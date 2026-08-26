import type { Property } from '../lib/types';
import { freshness, FRESH_CLASS } from '../lib/staleness';

export const KITCHEN_ICON: Record<string, string> = { private: '🍳', communal: '🍲', none: '🚫', unknown: '❔' };
export function Kitchen({ k }: { k: Property['kitchen'] }) { return <span title={`kitchen: ${k}`} className={k === 'none' ? 'text-red-600 dark:text-red-400' : ''}>{KITCHEN_ICON[k]} <span className="text-[11px] text-neutral-500">{k}</span></span>; }

const STATUS_CLS: Record<string, string> = {
  active: 'border-emerald-300 text-emerald-800 dark:text-emerald-300', 'on-market': 'border-sky-300 text-sky-800 dark:text-sky-300', receivership: 'border-violet-300 text-violet-800 dark:text-violet-300',
  dark: 'border-neutral-400 text-neutral-700 dark:text-neutral-300', taken: 'border-red-300 text-red-700', sold: 'border-red-300 text-red-700', 'stale-verify': 'border-amber-400 text-amber-800 dark:text-amber-300', 'ruled-out': 'border-red-300 text-red-700 line-through',
};
export const Status = ({ s }: { s: string }) => <span className={`chip ${STATUS_CLS[s] ?? 'border-neutral-300'}`}>{s}</span>;
export const Tag = ({ t }: { t: string }) => <span className={`chip mr-0.5 ${t === 'bridge-sept' ? 'border-orange-300 text-orange-800 dark:text-orange-300' : t === 'femme-house' ? 'border-pink-300 text-pink-800 dark:text-pink-300' : t === 'q1-2027' ? 'border-indigo-300 text-indigo-800 dark:text-indigo-300' : 'border-neutral-300 text-neutral-600 dark:text-neutral-400'}`}>{t}</span>;
export const Source = ({ p }: { p: Property }) => {
  const s = p.audience === 'inventory' ? 'notion' : p.tier === 'Baseline' ? 'baseline' : /§/.test(p.contact_section) ? 'report' : 'sheet';
  return <span className={`chip ${s === 'notion' ? 'border-fuchsia-300 text-fuchsia-800 dark:text-fuchsia-300' : s === 'report' ? 'border-teal-300 text-teal-800 dark:text-teal-300' : 'border-neutral-300 text-neutral-600'}`} title={p.last_checked_raw}>{s}</span>;
};
export const Sept15 = ({ v }: { v: Property['sept15_ready'] }) => <span className={v === true ? 'text-emerald-700 dark:text-emerald-400 font-medium' : v === false ? 'text-red-600 dark:text-red-400' : 'text-neutral-400'}>{v === true ? 'yes' : v === false ? 'no' : '?'}</span>;
export function Fresh({ p }: { p: Property }) { const f = freshness(p); return <span className={`chip ${FRESH_CLASS[f.level]}`} title={f.label}>{f.level === 'unverified' ? 'unverified - ask' : `${f.days}d · ${p.verified_via}`}</span>; }
export function ScoreCell({ p, adj }: { p: Property; adj: number | null }) {
  const b = p.score_breakdown;
  const tip = b ? `transit ${b.transit} · price ${b.price} · kitchen ${b.kitchen} · beds ${b.beds}${b.sept15_bonus ? ` · sept15 +${b.sept15_bonus}` : ''}${b.caps_applied.length ? `\ncaps: ${b.caps_applied.join('; ')}` : ''}${adj != null && p.score != null && adj !== p.score ? `\nstaleness −${p.score - adj}` : ''}\n${b.method_notes.join('\n')}` : '';
  const v = adj ?? p.score;
  const cls = v == null ? '' : v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-lime-500' : v >= 40 ? 'bg-amber-400' : 'bg-neutral-400';
  return <span title={tip} className="inline-flex items-center gap-1.5 cursor-help"><span className={`inline-block h-2 w-2 rounded-full ${cls}`} /><span className="font-mono">{v == null ? '-' : v.toFixed(v % 1 ? 1 : 0)}</span>{adj != null && p.score != null && adj !== p.score && <span className="text-[10px] text-neutral-500">({p.score})</span>}</span>;
}
export const Phone = ({ v }: { v: string }) => { const m = v.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/); return m ? <a className="underline decoration-dotted" href={`tel:${m[0].replace(/\D/g, '')}`}>{v}</a> : <span>{v || '-'}</span>; };
export const Email = ({ v }: { v: string }) => (/@/.test(v) ? <a className="underline decoration-dotted break-all" href={`mailto:${v.match(/[\w.+-]+@[\w.-]+/)?.[0]}`}>{v}</a> : <span className="break-all">{v || '-'}</span>);

export const HouseChip = ({ h }: { h: string }) => <span className={`chip mr-0.5 ${h === 'punkhaus' ? 'border-sky-300 text-sky-800 dark:text-sky-300' : h === 'femhaus' ? 'border-pink-300 text-pink-800 dark:text-pink-300' : h === 'safehaus' ? 'border-violet-300 text-violet-800 dark:text-violet-300' : 'border-teal-300 text-teal-800 dark:text-teal-300'}`}>{h}</span>;
export const Channel = ({ c }: { c: string }) => <span className="chip border-neutral-300 text-neutral-600 dark:text-neutral-400" title="how we reach the decision-maker">{c}</span>;
export const Ready = ({ v }: { v: string }) => <span className={`chip ${v === 'yes' ? 'border-emerald-300 text-emerald-800 dark:text-emerald-300' : v === 'no' ? 'border-red-300 text-red-700' : 'border-neutral-300 text-neutral-500'}`} title="walk-in ready: no retrofit or permitting needed">{v === 'yes' ? 'walk-in ready' : v === 'no' ? 'needs work' : 'ready?'}</span>;
