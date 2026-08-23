// The weekly loop (EMAIL, never phone):
//   receive (every run): read replies in housing@biopunk.house, match to rows by Gmail thread id (fallback: sender
//            address), extract {beds_available, price_now, min_stay_nights, notes} with Claude, write verified_via=email.
//   send (Mondays, or --send): the weekly-availability-check template to EVERY inventory row with an email
//            (booking-page rows included - the email confirms group rates the widget can't show).
// Caps: ≤40 emails/day, never >1 email per operator per 7 days, unsubscribe line sets do_not_email=true.
// Without Gmail creds this is a dry run: prints what it would send/read.
//   npx tsx refresh/poll-inbox.ts            # receive; send only if today is Monday
//   npx tsx refresh/poll-inbox.ts --send     # force the weekly send
//   npx tsx refresh/poll-inbox.ts --dry-run  # never send, even on Monday
import fs from 'node:fs';
import path from 'node:path';
import { Store, STATE_DIR, nowIso, dateStr, addDays, daysSince } from './lib/store';
import { gmailConfigured, listInbound, sendEmail, ensureLabel, labelMessage } from './lib/gmail';
import { claudeConfigured, extractAvailability } from './lib/claude';
import { loadTemplate, fill, varsFor } from './lib/templates';

const DAILY_CAP = 40, PER_OPERATOR_DAYS = 7;
const SIGNER = process.env.SENDER_NAME ?? 'Ria Arora';
const AI_LINE = 'Replies to this address are read with help from an AI assistant and then by a human on our team. Reply "unsubscribe" and we will not email you again.';
const state = path.join(STATE_DIR, 'inbox.json');
type InboxState = { processed: string[]; sent: { date: string; id: string; to: string; threadId: string }[]; unmatched: { id: string; from: string; subject: string; date: string }[] };

(async () => {
  const store = await Store.open();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const st: InboxState = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { processed: [], sent: [], unmatched: [] };
  const dry = process.argv.includes('--dry-run') || !gmailConfigured();
  if (!gmailConfigured()) console.log('poll-inbox: Gmail not configured (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN) → DRY RUN');

  // ---------- receive ----------
  if (gmailConfigured()) {
    const label = await ensureLabel('biopunk/processed');
    const msgs = (await listInbound()).filter((m) => !st.processed.includes(m.id));
    console.log(`inbox: ${msgs.length} new inbound messages`);
    for (const m of msgs) {
      let row = store.rows.find((r) => r.email_thread_id && r.email_thread_id === m.threadId)
        ?? store.rows.find((r) => r.contact_email && m.fromEmail === r.contact_email.toLowerCase());
      if (!row) { st.unmatched.push({ id: m.id, from: m.from, subject: m.subject, date: m.date }); st.processed.push(m.id); await labelMessage(m.id, label); console.log(`  ? unmatched: ${m.from} - ${m.subject}`); continue; }
      if (/\bunsubscribe\b|stop emailing|remove me|do not contact/i.test(m.text)) {
        store.patch(row.id, { do_not_email: true, notes: `operator asked not to be emailed (${m.fromEmail})` }, 'email');
        st.processed.push(m.id); await labelMessage(m.id, label); console.log(`  ⛔ ${row.name}: unsubscribe`); continue;
      }
      if (!claudeConfigured()) { console.log(`  · ${row.name}: reply received but ANTHROPIC_API_KEY missing - leaving for next run`); continue; }
      try {
        const x = await extractAvailability(m.text, row);
        store.patch(row.id, {
          beds_available: x.beds_available, price_now: x.price_now ?? row.price_now, price_private_now: x.price_private_now ?? row.price_private_now,
          min_stay_nights: x.min_stay_nights ?? row.min_stay_nights, last_verified: nowIso(), verified_via: 'email', confidence: 'med',
          next_check: dateStr(addDays(new Date(), 7)), do_not_email: x.unsubscribe || row.do_not_email, email_thread_id: m.threadId,
          notes: `${x.sentiment}${x.wants_call ? ', wants a call' : ''}${x.available_from ? `, from ${x.available_from}` : ''}: ${x.notes}`,
        }, `email:${m.fromEmail}`);
        st.processed.push(m.id); await labelMessage(m.id, label);
        console.log(`  ✓ ${row.name}: beds=${x.beds_available ?? '-'} $${x.price_now ?? '-'} min=${x.min_stay_nights ?? '-'} (${x.sentiment})`);
      } catch (e) { console.log(`  ! ${row.name}: ${(e as Error).message}`); }
    }
  }

  // ---------- send (Mondays) ----------
  const monday = new Date().getDay() === 1;
  if (process.argv.includes('--send') || monday) {
    const today = dateStr(), sentToday = st.sent.filter((s) => s.date === today).length;
    const tpl = loadTemplate('weekly-availability-check');
    // AAU is never touched by automation: the pitch goes person-to-person, top-down, and must not look
    // like it comes from the residency channel. Same for anything tagged institution just to be safe.
    const candidates = store.inventory().filter((r) => /@/.test(r.contact_email) && !r.do_not_email && !r.aau && r.deal_channel !== 'institution' && r.status !== 'ruled-out' && daysSince(r.last_emailed) >= PER_OPERATOR_DAYS);
    // one email per operator address per week - group rows that share a contact (e.g. UrbaNests) into one message
    const byEmail = new Map<string, typeof candidates>();
    for (const r of candidates) { const k = r.contact_email.toLowerCase(); byEmail.set(k, [...(byEmail.get(k) ?? []), r]); }
    let budget = DAILY_CAP - sentToday; console.log(`send: ${byEmail.size} operators due (${candidates.length} rows), daily budget ${budget}${dry ? ' - DRY RUN' : ''}`);
    for (const [to, rows] of byEmail) {
      if (budget <= 0) { console.log(`  daily cap reached; ${byEmail.size - st.sent.filter((s) => s.date === today).length} operators roll to tomorrow`); break; }
      const lead = rows[0];
      const v = { ...varsFor(lead, SIGNER), name: rows.map((r) => r.name.split(' - ')[0]).join(', '), ai_line: AI_LINE };
      const subject = fill(tpl.subject, v), body = fill(tpl.body, v) + (tpl.body.includes('{{ai_line}}') ? '' : `\n\n${AI_LINE}`);
      if (dry) { console.log(`  → (dry) ${to}: "${subject}" [${rows.length} row(s)]`); continue; }
      try {
        const prior = rows.find((r) => r.email_thread_id)?.email_thread_id || undefined;
        const sent = await sendEmail({ to, subject, text: body, threadId: prior });
        for (const r of rows) store.patch(r.id, { email_thread_id: sent.threadId, last_emailed: nowIso() }, 'weekly-send');
        st.sent.push({ date: today, id: lead.id, to, threadId: sent.threadId }); budget--;
        console.log(`  ✉ ${to} (${rows.map((r) => r.name.split(' - ')[0]).join(', ')})`);
      } catch (e) { console.log(`  ! ${to}: ${(e as Error).message}`); }
    }
  } else console.log('send: not Monday (pass --send to force)');

  fs.writeFileSync(state, JSON.stringify(st, null, 2) + '\n');
  await store.commit();
})();
