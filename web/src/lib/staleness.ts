// Step-6 staleness rules (front end). last_verified ≤7d green · 8–14d amber · 15–45d grey & −10 score · >45d "unverified — ask", hidden from founders by default.
import type { Property } from './types';
export type Freshness = { level: 'green' | 'amber' | 'grey' | 'unverified'; days: number | null; label: string; penalty: number };
export function freshness(p: Pick<Property, 'last_verified' | 'verified_via'>, now = Date.now()): Freshness {
  if (!p.last_verified) return { level: 'unverified', days: null, label: 'unverified — ask', penalty: 0 };
  const days = Math.floor((now - Date.parse(p.last_verified)) / 86400000);
  if (days <= 7) return { level: 'green', days, label: `verified ${days}d ago · ${p.verified_via}`, penalty: 0 };
  if (days <= 14) return { level: 'amber', days, label: `verified ${days}d ago · ${p.verified_via}`, penalty: 0 };
  if (days <= 45) return { level: 'grey', days, label: `verified ${days}d ago · ${p.verified_via} · −10`, penalty: 10 };
  return { level: 'unverified', days, label: `unverified — ask (${days}d)`, penalty: 0 };
}
export const adjScore = (p: Property, now = Date.now()) => p.score == null ? null : p.audience === 'inventory' ? Math.max(0, p.score - freshness(p, now).penalty) : p.score;
export const FRESH_CLASS: Record<Freshness['level'], string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  amber: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
  grey: 'bg-neutral-200 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
  unverified: 'bg-white text-neutral-500 border-dashed border-neutral-400 dark:bg-neutral-950 dark:text-neutral-400',
};
export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
