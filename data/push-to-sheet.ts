// Write data/properties.json to the Google Sheet: master tabs "Pipeline" + "Inventory" (full schema),
// plus the working views Elliot asked for: one tab per house (Punk House, Femme House, Alum House),
// a Call order tab, and an Airtable export of confirmed rows. Every tab is also mirrored to
// data/sheets/*.csv so the views are reviewable without credentials.
//   npx tsx data/push-to-sheet.ts            # overwrite tabs with the local build
//   npx tsx data/push-to-sheet.ts --merge    # keep Sheet-side edits to human columns first
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { sheetConfigured, readProperties, writeProperties, writeTab } from './lib/sheet';
import { buildTabs } from './lib/tabs';
import type { Property } from './schema';

const HUMAN_COLUMNS: (keyof Property)[] = ['status','outreach_status','contacted_by','notes','contact_name','contact_org','contact_phone','contact_email','contact_verify','contact_path','do_not_email','sept15_ready','timeline_tags','houses','beds_available','price_now','price_private_now','min_stay_nights','last_verified','verified_via','confidence','next_check','email_thread_id','last_emailed'];

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function writeLocalCsv(title: string, header: string[], rows: string[][], note?: string) {
  const dir = path.join('data', 'sheets'); fs.mkdirSync(dir, { recursive: true });
  const lines = [note ? [`NOTE: ${note}`] : null, header, ...rows].filter(Boolean) as string[][];
  fs.writeFileSync(path.join(dir, `${title.replace(/[^\w ]/g, '').trim().replace(/ +/g, '-').toLowerCase()}.csv`), lines.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n');
}

(async () => {
  const local = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as Property[];
  let out = local;
  if (process.argv.includes('--merge') && sheetConfigured()) {
    const remote = new Map((await readProperties()).map((r) => [r.id, r]));
    out = local.map((p) => { const r = remote.get(p.id); if (!r) return p; const m: any = { ...p }; for (const c of HUMAN_COLUMNS) if (r[c] !== '' && r[c] != null) m[c] = r[c]; return m as Property; });
    console.log('merged human-edited columns from the Sheet');
  }
  const tabs = buildTabs(out);
  for (const t of tabs) writeLocalCsv(t.title, t.header, t.rows, t.note);
  console.log(`local previews in data/sheets/: ${tabs.map((t) => `${t.title} (${t.rows.length})`).join(', ')}`);
  if (!sheetConfigured()) { console.log('SHEET_ID + service-account credentials missing in .env, so nothing was pushed to Google. See README "Google Sheet setup".'); return; }
  await writeProperties(out);
  for (const t of tabs) await writeTab(t.title, t.header, t.note ? [[`NOTE: ${t.note}`], ...t.rows] : t.rows);
  console.log(`pushed ${out.length} rows (${out.filter((p) => p.audience === 'pipeline').length} Pipeline, ${out.filter((p) => p.audience === 'inventory').length} Inventory) + ${tabs.length} view tabs to sheet ${process.env.SHEET_ID}`);
})();
