/**
 * Google Apps Script web app — the only "write" endpoint the static site has. Handles the founder view's
 * "I took a bed here" button: decrements beds_available on the Inventory tab, stamps last_verified=now,
 * verified_via=resident, and appends a line to the "Outreach log" tab. No auth (the sheet is the DB; CLAUDE.md).
 *
 * Install: Extensions → Apps Script in the Google Sheet → paste → Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone → copy the URL into web/.env as VITE_RESIDENT_WEBHOOK_URL.
 */
function doPost(e) {
  var body = JSON.parse(e.postData.contents || '{}');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Inventory');
  var values = sh.getDataRange().getValues();
  var header = values[0];
  var col = function (name) { var i = header.indexOf(name); if (i < 0) throw new Error('missing column ' + name); return i; };
  var idCol = col('id'), bedsCol = col('beds_available'), lvCol = col('last_verified'), viaCol = col('verified_via'), confCol = col('confidence'), notesCol = col('notes');
  for (var r = 1; r < values.length; r++) {
    if (values[r][idCol] !== body.id) continue;
    var row = r + 1, now = new Date().toISOString();
    if (body.action === 'took_bed') {
      var beds = values[r][bedsCol];
      if (beds !== '' && beds !== null && !isNaN(Number(beds))) sh.getRange(row, bedsCol + 1).setValue(Math.max(0, Number(beds) - 1));
      sh.getRange(row, lvCol + 1).setValue(now);
      sh.getRange(row, viaCol + 1).setValue('resident');
      sh.getRange(row, confCol + 1).setValue('med');
      sh.getRange(row, notesCol + 1).setValue((values[r][notesCol] ? values[r][notesCol] + ' | ' : '') + '[' + now.slice(0, 10) + ' resident] a founder reports taking a bed here' + (body.note ? ': ' + body.note : ''));
      var log = ss.getSheetByName('Outreach log');
      if (log) log.appendRow([now.slice(0, 10), values[r][col('name')], 'Inventory', 'resident', body.who || 'founder (site)', '', 'took a bed', beds === '' ? '' : Math.max(0, Number(beds) - 1), '', '', '', '', body.note || '']);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, beds_available: beds === '' ? null : Math.max(0, Number(beds) - 1) })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'row not found' })).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput('biopunk housing webhook ok'); }
