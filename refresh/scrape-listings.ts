// Nightly: for rows with LoopNet / Crexi / Zillow / Apartments.com URLs — is the listing still live? price? days on market?
// Gone → status=stale-verify, confidence=low (applied by normalize.ts).
//   npx tsx refresh/scrape-listings.ts [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store, STATE_DIR, nowIso } from './lib/store';

const LISTING = /loopnet\.com|crexi\.com|zillow\.com|apartments\.com|showcase\.com/i;
export type ListingResult = { id: string; name: string; url: string; at: string; live: boolean | null; price_text: string | null; days_on_market: number | null; note: string };
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };

(async () => {
  const store = await Store.open();
  const limit = Number(arg('--limit') ?? 0);
  let targets = store.rows.flatMap((r) => [r.listing_url, ...r.source_links].filter((u) => LISTING.test(u)).slice(0, 1).map((url) => ({ row: r, url })));
  if (limit) targets = targets.slice(0, limit);
  console.log(`scrape-listings: ${targets.length} listing URLs`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36', locale: 'en-US' });
  const results: ListingResult[] = [];
  for (const { row, url } of targets) {
    const page = await ctx.newPage();
    const res: ListingResult = { id: row.id, name: row.name, url, at: nowIso(), live: null, price_text: null, days_on_market: null, note: '' };
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      const text = (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ');
      const status = resp?.status() ?? 0;
      if (/access denied|captcha|verify you are human|unusual traffic|press & hold/i.test(text) || status === 403) { res.note = `bot wall (HTTP ${status})`; }
      else if (status === 404 || /no longer available|off market|this listing has been removed|listing not found|has been sold|off-market/i.test(text)) { res.live = false; res.note = `gone (HTTP ${status})`; }
      else if (status >= 200 && status < 400 && text.length > 500) {
        res.live = true;
        res.price_text = text.match(/\$\s?[\d,.]+(?:\s?[MK])?(?:\s*\/\s*(?:mo|month|SF|unit|room|key))?/i)?.[0] ?? null;
        const dom = text.match(/(\d+)\s*days? on (?:market|loopnet|crexi)/i); res.days_on_market = dom ? Number(dom[1]) : null;
        res.note = 'live';
      } else res.note = `unclear (HTTP ${status}, ${text.length} chars)`;
      console.log(`${res.live === true ? '✓' : res.live === false ? '✗' : '?'} ${row.name.slice(0, 40)} — ${res.note} ${res.price_text ?? ''} ${res.days_on_market != null ? `${res.days_on_market}d` : ''}`);
    } catch (e) { res.note = `error: ${(e as Error).message.split('\n')[0].slice(0, 120)}`; console.log(`! ${row.name.slice(0, 40)} — ${res.note}`); }
    finally { await page.close(); }
    results.push(res);
  }
  await browser.close();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const out = path.join(STATE_DIR, 'scrape-listings.json');
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) as ListingResult[] : [];
  fs.writeFileSync(out, JSON.stringify([...prev.filter((p) => !results.some((r) => r.id === p.id && r.url === p.url)), ...results].sort((a, b) => a.id.localeCompare(b.id)), null, 2) + '\n');
  console.log(`scrape-listings done → ${out}`);
})();
