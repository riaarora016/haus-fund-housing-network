// Reconcile scrape-booking + scrape-listings (+ email results already applied by poll-inbox) into the rows,
// set confidence (booking-page=high, email=med, listing-only=low), grey out no-reply rows after 21 days,
// and write a one-paragraph daily entry to refresh/CHANGELOG.md. Then rebuild properties.json and push.
//   npx tsx refresh/normalize.ts [--no-push]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Store, STATE_DIR, nowIso, dateStr, addDays, daysSince, readChanges } from './lib/store';
import { writeChangelogParagraph } from './lib/claude';
import { sheetConfigured } from '../data/lib/sheet';
import type { ScrapeResult } from './adapters/types';
import type { ListingResult } from './scrape-listings';

(async () => {
  const store = await Store.open();
  const since = nowIso();
  const booking: ScrapeResult[] = fs.existsSync(path.join(STATE_DIR, 'scrape-booking.json')) ? JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'scrape-booking.json'), 'utf8')) : [];
  const listings: ListingResult[] = fs.existsSync(path.join(STATE_DIR, 'scrape-listings.json')) ? JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'scrape-listings.json'), 'utf8')) : [];
  const fresh = (at: string) => daysSince(at) < 2;

  let applied = 0, needs: string[] = [];
  for (const r of booking.filter((b) => fresh(b.at))) {
    const row = store.byId(r.id); if (!row) continue;
    if (r.ok) {
      // booking-page reads beat older email/manual reads; an email read from the last 7 days keeps its bed count.
      const keepEmailBeds = row.verified_via === 'email' && daysSince(row.last_verified) < 7;
      store.patch(r.id, {
        price_now: r.price_now ?? row.price_now, price_private_now: r.price_private_now ?? row.price_private_now,
        min_stay_nights: r.min_stay_nights ?? row.min_stay_nights, bookable_online: r.bookable === true,
        beds_available: keepEmailBeds ? row.beds_available : r.beds_available,   // null unless the page states a count
        last_verified: r.at, verified_via: 'booking-page', confidence: r.bookable == null ? 'med' : 'high', next_check: dateStr(addDays(new Date(), 1)),
        notes: `${r.adapter}: ${r.evidence.slice(0, 160)}`,
      }, `scrape:${r.adapter}`); applied++;
    } else if (r.needs_adapter) needs.push(`${r.name}: ${r.needs_adapter}`);
  }
  for (const l of listings.filter((x) => fresh(x.at))) {
    const row = store.byId(l.id); if (!row) continue;
    if (l.live === false) { store.patch(l.id, { status: 'stale-verify', confidence: 'low', last_verified: l.at, verified_via: 'listing', notes: `listing gone: ${l.url}` }, 'scrape:listing'); applied++; }
    else if (l.live === true && row.audience === 'pipeline') { store.patch(l.id, { last_verified: l.at, verified_via: 'listing', confidence: row.confidence === 'high' || row.confidence === 'med' ? row.confidence : 'low', notes: `listing live${l.price_text ? ` @ ${l.price_text}` : ''}${l.days_on_market != null ? `, ${l.days_on_market} days on market` : ''}` }, 'scrape:listing'); applied++; }
  }
  // 21-day no-reply rule: emailed, no newer verification → confidence low (front end greys it out by last_verified age)
  let greyed = 0;
  for (const row of store.inventory()) {
    if (row.last_emailed && daysSince(row.last_emailed) >= 21 && (!row.last_verified || row.last_verified < row.last_emailed) && row.confidence !== 'low') { store.patch(row.id, { confidence: 'low', notes: 'no reply in 21 days' }, 'normalize'); greyed++; }
  }
  await store.commit();

  // changelog
  const changes = readChanges(dateStr() + 'T00:00:00');
  const summary = `Booking scrape: ${booking.filter((b) => fresh(b.at) && b.ok).length} sites read, ${needs.length} need adapter work${needs.length ? ` (${needs.slice(0, 4).join('; ')}${needs.length > 4 ? '…' : ''})` : ''}. Listings: ${listings.filter((l) => fresh(l.at)).length} checked, ${listings.filter((l) => fresh(l.at) && l.live === false).length} gone. ${greyed} rows greyed for no reply in 21 days.`;
  const para = await writeChangelogParagraph(changes, summary);
  const cl = path.join(process.cwd(), 'refresh', 'CHANGELOG.md');
  const head = fs.existsSync(cl) ? fs.readFileSync(cl, 'utf8') : '# Refresh changelog\n\nOne paragraph per run, newest first. Written by refresh/normalize.ts (Claude summarises the diff; facts only).\n';
  const [title, ...rest] = head.split(/\n(?=## )/);
  fs.writeFileSync(cl, `${title.trimEnd()}\n\n## ${since.slice(0, 16).replace('T', ' ')} UTC\n\n${para}\n${rest.length ? '\n' + rest.join('\n') : ''}`);
  console.log(`normalize: ${applied} rows updated, ${greyed} greyed, ${changes.length} logged changes → refresh/CHANGELOG.md`);

  // rebuild + push so the site picks it up
  execSync('npx tsx data/build.ts --quiet', { stdio: 'inherit' });
  if (sheetConfigured() && !process.argv.includes('--no-push')) execSync('npx tsx data/push-to-sheet.ts --merge', { stdio: 'inherit' });
  else console.log('normalize: Sheet not configured → properties.json rebuilt locally only');
})();
