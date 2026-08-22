// FOUND Study SF (foundstudy.com/sanfrancisco). Room-type cards with monthly prices; lease terms in months.
import type { Adapter } from './types';
import { blank, bodyText, money } from './types';

export const foundstudy: Adapter = {
  name: 'foundstudy', hosts: /foundstudy\.com/i,
  async check(page, row) {
    const r = blank();
    await page.goto(row.booking_url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const text = await bodyText(page);
    r.evidence = text.slice(0, 600);
    const monthly = money(text).filter((n) => n >= 500 && n <= 4000);
    if (!monthly.length) { r.needs_adapter = 'no monthly $ figures in rendered text (prices may be in an iframe/booking widget)'; return r; }
    r.price_now = Math.min(...monthly);
    const priv = text.match(/(?:private|single)[^$]{0,60}\$\s?([\d,]+)/i); r.price_private_now = priv ? Number(priv[1].replace(/,/g, '')) : null;
    const term = text.match(/(\d+)\s*-?\s*month/i); r.min_stay_nights = term ? Number(term[1]) * 30 : null;
    r.bookable = /apply now|book now|reserve/i.test(text) ? true : null; r.ok = true;
    return r;
  },
};
