// Hostelworld property page with ?from=&to=&guests=1. Reads the lowest nightly dorm price for each window and
// whether the page says "no availability". Heavily JS-rendered + bot-protected: expect needs_adapter on failure.
import type { Adapter } from './types';
import { blank, bodyText } from './types';

export const hostelworld: Adapter = {
  name: 'hostelworld', hosts: /hostelworld\.com/i,
  async check(page, row, windows) {
    const r = blank(); r.windows = [];
    for (const w of windows) {
      const url = `${row.booking_url.replace(/\/$/, '')}/?from=${w.checkin}&to=${w.checkout}&guests=${w.guests}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      const text = await bodyText(page);
      if (/access denied|captcha|verify you are human|unusual traffic/i.test(text)) { r.needs_adapter = 'bot wall (captcha/access denied)'; r.evidence = text.slice(0, 300); return r; }
      const nightly = [...text.matchAll(/US\$\s?(\d{2,3})(?:\.\d{2})?/g)].map((m) => Number(m[1])).filter((n) => n >= 15 && n <= 400);
      const noAvail = /no availability|sold out|not available for (these|your) dates|fully booked/i.test(text);
      r.windows.push({ window: w, nightly: nightly.length ? Math.min(...nightly) : null, available: noAvail ? false : nightly.length ? true : null });
      if (!r.evidence) r.evidence = text.slice(0, 400);
    }
    const nightlies = r.windows.map((x) => x.nightly).filter((n): n is number => n != null);
    if (!nightlies.length && !r.windows.some((x) => x.available === false)) { r.needs_adapter = 'no US$ nightly prices parsed (JS widget not rendered?)'; return r; }
    r.price_now = nightlies.length ? Math.round(Math.min(...nightlies) * 30) : null;
    r.bookable = r.windows.some((x) => x.available === true) ? true : r.windows.every((x) => x.available === false) ? false : null;
    r.min_stay_nights = 1; r.ok = true;
    return r;
  },
};
