import type { Page } from 'playwright';
import type { Property } from '../../data/schema';

export type Window = { checkin: string; checkout: string; nights: number; guests: number };
export type ScrapeResult = {
  adapter: string; id: string; name: string; url: string; at: string;
  ok: boolean;                     // did we get a usable read?
  needs_adapter?: string;          // set when the site is reachable but our parser can't read it
  error?: string;
  price_now: number | null;        // lowest $/bed/month seen (nightly × nights when only nightly is shown)
  price_private_now: number | null;
  beds_available: number | null;   // ONLY when the page states a count; never estimated
  bookable: boolean | null;        // can a stranger book a bed online for the window?
  min_stay_nights: number | null;
  windows?: { window: Window; nightly: number | null; available: boolean | null }[];
  evidence: string;                // the text we parsed from (short)
};
export interface Adapter {
  name: string;
  hosts: RegExp;
  check(page: Page, row: Property, windows: Window[]): Promise<AdapterResult>;
}
export const money = (t: string) => [...t.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d{2,5})(?:\.\d{2})?/g)].map((m) => Number(m[1].replace(/,/g, '')));
export type AdapterResult = Omit<ScrapeResult, 'adapter' | 'id' | 'name' | 'url' | 'at'>;
export const blank = (): AdapterResult => ({ ok: false, price_now: null, price_private_now: null, beds_available: null, bookable: null, min_stay_nights: null, evidence: '' });
export async function bodyText(page: Page): Promise<string> {
  return (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ').trim();
}
