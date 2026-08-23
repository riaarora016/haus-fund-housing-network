// Generic fallback: any operator page that prints monthly prices in text ("$900/mo", "$1,625 per month").
// Never reads availability (none of these sites show it) → beds_available null, bookable=false.
import type { Adapter } from './types';
import { blank, bodyText } from './types';

export const pricetext: Adapter = {
  name: 'pricetext', hosts: /./,
  async check(page, row) {
    const r = blank();
    await page.goto(row.booking_url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const text = await bodyText(page);
    r.evidence = text.slice(0, 600);
    // "$900/mo", "$1,625 per month", "$900 for a month-to-month lease", "$800 when you sign a 4-month lease"
    const monthly = [...text.matchAll(/\$\s?(\d{1,2},?\d{3}|\d{3})(?:\s*(?:\/|per|for a|a)\s*(?:mo|month)|[^$]{0,40}month)/gi)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n >= 400 && n <= 5000);
    const loose = monthly.length ? monthly : [...text.matchAll(/\$\s?(\d{1,2},?\d{3}|\d{3})\b/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n >= 500 && n <= 4000);
    if (!loose.length) { r.needs_adapter = 'no monthly price text found'; return r; }
    r.price_now = Math.min(...loose);
    const priv = text.match(/private[^$]{0,80}\$\s?(\d{1,2},?\d{3})/i); r.price_private_now = priv ? Number(priv[1].replace(/,/g, '')) : null;
    const term = text.match(/(\d+)\s*-?\s*month\s*(?:lease|minimum|min)/i); r.min_stay_nights = term ? Number(term[1]) * 30 : null;
    r.bookable = false; r.ok = true;
    r.evidence = `monthly from $${r.price_now}${monthly.length ? ' (explicit /mo)' : ' (loose $ match - verify)'} - ${text.slice(0, 300)}`;
    return r;
  },
};
