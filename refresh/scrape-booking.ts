// Nightly: for each inventory row with a booking_url, ask the operator's site for 1 bed × 30 nights at
// today+14 and today+45. Records price + bookable; logs sites that need a new adapter instead of failing.
//   npx tsx refresh/scrape-booking.ts                 # all rows with a booking_url
//   npx tsx refresh/scrape-booking.ts --limit 5       # first N (smoke test)
//   npx tsx refresh/scrape-booking.ts --only urbanests,hostelworld
//   npx tsx refresh/scrape-booking.ts --ids inv-a,inv-b
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store, STATE_DIR, nowIso, dateStr, addDays } from './lib/store';
import { ADAPTERS } from './adapters';
import type { ScrapeResult, Window } from './adapters/types';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const windows = (): Window[] => [14, 45].map((d) => { const ci = addDays(new Date(), d); return { checkin: dateStr(ci), checkout: dateStr(addDays(ci, 30)), nights: 30, guests: 1 }; });

(async () => {
  const store = await Store.open();
  const only = arg('--only')?.split(','), ids = arg('--ids')?.split(','), limit = Number(arg('--limit') ?? 0);
  let rows = store.inventory().filter((r) => r.booking_url && r.booking_adapter);
  if (only) rows = rows.filter((r) => only.includes(r.booking_adapter));
  if (ids) rows = rows.filter((r) => ids.includes(r.id));
  if (limit) rows = rows.slice(0, limit);
  const skipped = store.inventory().filter((r) => r.booking_url && !r.booking_adapter);
  console.log(`scrape-booking: ${rows.length} rows, windows ${windows().map((w) => w.checkin).join(' & ')}; ${skipped.length} rows have a URL but no adapter`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const results: ScrapeResult[] = [];
  for (const row of rows) {
    const ad = ADAPTERS[row.booking_adapter];
    const base = { adapter: row.booking_adapter, id: row.id, name: row.name, url: row.booking_url, at: nowIso() };
    if (!ad) { results.push({ ...base, ok: false, needs_adapter: `adapter "${row.booking_adapter}" not registered`, price_now: null, price_private_now: null, beds_available: null, bookable: null, min_stay_nights: null, evidence: '' }); continue; }
    const page = await ctx.newPage();
    try {
      const r = await ad.check(page, row, windows());
      results.push({ ...base, ...r });
      console.log(`${r.ok ? '✓' : r.needs_adapter ? '⚠' : '✗'} ${row.name} [${ad.name}] ${r.ok ? `$${r.price_now}/mo${r.price_private_now ? ` (private $${r.price_private_now})` : ''} bookable=${r.bookable} min=${r.min_stay_nights ?? '?'}n` : r.needs_adapter ?? r.error}`);
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0].slice(0, 200);
      results.push({ ...base, ok: false, error: msg, price_now: null, price_private_now: null, beds_available: null, bookable: null, min_stay_nights: null, evidence: '' });
      console.log(`✗ ${row.name} [${ad.name}] ${msg}`);
    } finally { await page.close(); }
  }
  await browser.close();
  for (const r of skipped) results.push({ adapter: '', id: r.id, name: r.name, url: r.booking_url, at: nowIso(), ok: false, needs_adapter: 'no adapter assigned in data/booking-sites.json', price_now: null, price_private_now: null, beds_available: null, bookable: null, min_stay_nights: null, evidence: '' });

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const out = path.join(STATE_DIR, 'scrape-booking.json');
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) as ScrapeResult[] : [];
  const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id)), ...results].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(out, JSON.stringify(merged, null, 2) + '\n');
  const ok = results.filter((r) => r.ok).length, na = results.filter((r) => r.needs_adapter).length, err = results.filter((r) => r.error).length;
  console.log(`\nscrape-booking done: ${ok} read, ${na} need adapter work, ${err} errors → ${out}. Next: npx tsx refresh/normalize.ts`);
  if (na) { console.log('\nNeeds adapter work:'); for (const r of results.filter((r) => r.needs_adapter)) console.log(`  - ${r.name} (${r.adapter || '-'}): ${r.needs_adapter}`); }
})();
