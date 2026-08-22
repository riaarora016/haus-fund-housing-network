// UrbaNests property pages: a "Starting Rates $ (per person/month)" table by Leasing Term × Occupancy and a
// headline "Single Rooms from $N". No live vacancy count → beds_available stays null; bookable=false (call/form).
import type { Adapter } from './types';
import { blank, bodyText, money } from './types';

export const urbanests: Adapter = {
  name: 'urbanests', hosts: /urbanests\.com/i,
  async check(page, row) {
    const r = blank();
    await page.goto(row.booking_url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const text = await bodyText(page);
    r.evidence = text.slice(0, 600);
    const headline = text.match(/(?:from|starting at)\s*\$\s?([\d,]+)/i);
    const prices = money(text).filter((n) => n >= 300 && n <= 5000);
    if (!prices.length) { r.needs_adapter = 'no $ amounts found on page (layout changed?)'; return r; }
    // per-person shared rates are the lowest figures; private = headline
    r.price_now = Math.min(...prices);
    r.price_private_now = headline ? Number(headline[1].replace(/,/g, '')) : null;
    const term = text.match(/(\d+)\s*-?\s*(\d+)?\s*month/i);
    r.min_stay_nights = term ? Number(term[1]) * 30 : null;
    r.bookable = false; r.ok = true;
    r.evidence = `per-person from $${r.price_now}${r.price_private_now ? `; single from $${r.price_private_now}` : ''}${term ? `; min ${term[0]}` : ''} — ${text.slice(0, 300)}`;
    return r;
  },
};
