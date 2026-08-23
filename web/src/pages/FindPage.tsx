// Founder view (/find): no login, inventory rows only, only VERIFIED numbers shown as current.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadData, OPS_ENABLED, type Loaded } from '../lib/data';
import type { Property } from '../lib/types';
import { freshness, FRESH_CLASS, adjScore, fmtDate, fmtMoney } from '../lib/staleness';
import { Kitchen } from '../components/Badges';

type Form = { arrival: string; nights: number; max: number; shared: boolean; kitchen: boolean; walk: number; unverified: boolean };
const DEF: Form = { arrival: '2026-09-15', nights: 30, max: 1500, shared: true, kitchen: true, walk: 20, unverified: false };
const read = (sp: URLSearchParams): Form => ({ arrival: sp.get('arrival') || DEF.arrival, nights: +(sp.get('nights') || DEF.nights), max: +(sp.get('max') || DEF.max), shared: sp.get('shared') !== '0', kitchen: sp.get('kitchen') !== '0', walk: +(sp.get('walk') || DEF.walk), unverified: sp.get('unverified') === '1' });
const write = (f: Form) => { const sp = new URLSearchParams(); sp.set('arrival', f.arrival); sp.set('nights', String(f.nights)); sp.set('max', String(f.max)); if (!f.shared) sp.set('shared', '0'); if (!f.kitchen) sp.set('kitchen', '0'); sp.set('walk', String(f.walk)); if (f.unverified) sp.set('unverified', '1'); return sp; };

export function FindPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [sp, setSp] = useSearchParams();
  const f = useMemo(() => read(sp), [sp]);
  const set = (p: Partial<Form>) => setSp(write({ ...f, ...p }), { replace: true });
  const [taken, setTaken] = useState<Record<string, string>>({});
  useEffect(() => { loadData('inventory').then(setData); }, []);
  const rows = data?.rows ?? [];
  const results = useMemo(() => rows.map((p) => {
    const fr = freshness(p);
    const price = f.shared ? p.price_now : (p.price_private_now ?? (p.type === 'hostel' ? null : p.price_now));
    const reasons: string[] = [];
    if (['taken', 'sold', 'ruled-out', 'stale-verify'].includes(p.status)) reasons.push(`status ${p.status}`);
    if (fr.level === 'unverified') reasons.push('not verified in 45 days');
    if (f.kitchen && !['communal', 'private'].includes(p.kitchen)) reasons.push(`kitchen ${p.kitchen}`);
    const walk = p.walk_min_from_frontier ?? p.transit_min_to_frontier;
    if (walk != null && walk > f.walk) reasons.push(`${walk} min walk`);
    if (price != null && price > f.max) reasons.push(`${fmtMoney(price)} > max`);
    if (price == null && fr.level !== 'unverified') reasons.push(f.shared ? 'no verified price' : 'no verified private price');
    if (p.min_stay_nights != null && p.min_stay_nights > f.nights) reasons.push(`min stay ${p.min_stay_nights}n`);
    if (p.beds_available === 0) reasons.push('0 beds');
    if (p.baseline) reasons.push('current deal');
    return { p, fr, price, reasons, ok: reasons.length === 0 };
  }).filter((x) => x.ok || (f.unverified && x.reasons.every((r) => /verified/.test(r)))).sort((a, b) => (adjScore(b.p) ?? 0) - (adjScore(a.p) ?? 0)), [rows, f]);

  const took = async (p: Property) => {
    const url = import.meta.env.VITE_RESIDENT_WEBHOOK_URL;
    if (!url) { location.href = `mailto:${import.meta.env.VITE_HOUSING_EMAIL ?? 'housing@biopunk.house'}?subject=${encodeURIComponent(`I took a bed at ${p.name}`)}&body=${encodeURIComponent(`Row id: ${p.id}\nArrival: ${f.arrival}, ${f.nights} nights.\nPlease decrement beds_available and mark verified_via=resident.`)}`; return; }
    setTaken((t) => ({ ...t, [p.id]: 'saving…' }));
    try { const r = await fetch(url, { method: 'POST', body: JSON.stringify({ id: p.id, action: 'took_bed', who: 'founder (site)' }), headers: { 'Content-Type': 'text/plain' } }); const j = await r.json(); setTaken((t) => ({ ...t, [p.id]: j.ok ? `recorded ✓ (${j.beds_available ?? '-'} left)` : `error: ${j.error}` })); }
    catch (e) { setTaken((t) => ({ ...t, [p.id]: `error: ${(e as Error).message}` })); }
  };
  if (!data) return <div className="p-6 text-neutral-500">loading…</div>;
  return (
    <div className="max-w-5xl mx-auto p-3 space-y-3">
      <div className="flex items-baseline gap-3"><h1 className="text-[16px] font-medium">Find a bed near Frontier Tower</h1><span className="text-neutral-500">Biopunk housing · SF only · inventory verified by the team{OPS_ENABLED && <> · <Link className="underline" to="/">ops view</Link></>}</span></div>
      <form className="grid grid-cols-2 md:grid-cols-7 gap-2 rounded border border-neutral-200 dark:border-neutral-800 p-2" onSubmit={(e) => e.preventDefault()}>
        <label className="text-[11px]">arrival<input type="date" className="input w-full" value={f.arrival} onChange={(e) => set({ arrival: e.target.value })} /></label>
        <label className="text-[11px]">nights<input type="number" min={1} className="input w-full" value={f.nights} onChange={(e) => set({ nights: +e.target.value })} /></label>
        <label className="text-[11px]">max $/month<input type="number" step={50} className="input w-full" value={f.max} onChange={(e) => set({ max: +e.target.value })} /></label>
        <label className="text-[11px]">room<select className="input w-full" value={f.shared ? 'shared' : 'private'} onChange={(e) => set({ shared: e.target.value === 'shared' })}><option value="shared">shared OK (cheapest bed)</option><option value="private">private only</option></select></label>
        <label className="text-[11px]">kitchen<select className="input w-full" value={f.kitchen ? '1' : '0'} onChange={(e) => set({ kitchen: e.target.value === '1' })}><option value="1">required</option><option value="0">not required</option></select></label>
        <label className="text-[11px]">max walk (min)<input type="number" step={5} className="input w-full" value={f.walk} onChange={(e) => set({ walk: +e.target.value })} /></label>
        <label className="text-[11px] flex items-end gap-1 pb-1"><input type="checkbox" checked={f.unverified} onChange={(e) => set({ unverified: e.target.checked })} />show "unverified - ask"</label>
      </form>
      <div className="text-[11px] text-neutral-500">{results.length} matches · every price and bed count shows the date it was verified - a number without a date is an estimate, not an offer · <button className="underline" onClick={() => navigator.clipboard.writeText(location.href)}>copy link to this search</button></div>
      <div className="space-y-2">
        {results.map(({ p, fr, price }) => (
          <div key={p.id} className={`rounded border border-neutral-200 dark:border-neutral-800 p-2 ${fr.level === 'unverified' ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="grow min-w-56"><div className="font-medium">{p.name}</div><div className="text-neutral-500 text-[11px]">{p.address} · {p.type} · {p.walk_min_from_frontier ?? p.transit_min_to_frontier ?? '?'} min to Frontier · <Kitchen k={p.kitchen} /></div></div>
              <div className="text-right"><div className="font-mono text-[14px]">{price != null ? `${fmtMoney(price)}/mo` : <span className="text-neutral-400">price: ask</span>}</div><div className="text-[10px] text-neutral-500">{price != null ? `verified ${fmtDate(p.last_verified)} · ${p.verified_via}` : p.price_per_bed_est ? `est. ${fmtMoney(p.price_per_bed_est)} (${p.last_checked_raw})` : ''}</div></div>
              <div className="text-right"><div className="font-mono text-[14px]">{p.beds_available != null ? `${p.beds_available} beds` : <span className="text-neutral-400">beds: ask</span>}</div><div className="text-[10px] text-neutral-500">{p.beds_available != null ? `as of ${fmtDate(p.last_verified)}` : 'never estimated'}</div></div>
              <span className={`chip ${FRESH_CLASS[fr.level]}`}>{fr.label}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 items-center text-[12px]">
              {p.booking_url && <a className="btn" href={p.booking_url} target="_blank" rel="noreferrer">{p.bookable_online ? 'book online ↗' : 'operator page ↗'}</a>}
              {p.contact_email && <a className="btn" href={`mailto:${p.contact_email.match(/[\w.+-]+@[\w.-]+/)?.[0]}?subject=${encodeURIComponent(`Bed from ${f.arrival} for ${f.nights} nights - Biopunk`)}`}>email operator</a>}
              {p.contact_phone && <a className="btn" href={`tel:${p.contact_phone.replace(/\D/g, '').slice(0, 10)}`}>call {p.contact_phone.split('·')[0]}</a>}
              {p.min_stay_nights != null && <span className="text-neutral-500">min stay {p.min_stay_nights} nights</span>}
              <button className="btn ml-auto" onClick={() => took(p)} disabled={!!taken[p.id]}>{taken[p.id] ?? 'I took a bed here'}</button>
            </div>
          </div>
        ))}
        {results.length === 0 && <div className="text-neutral-500 p-6 text-center">Nothing verified matches. Loosen the filters, tick "show unverified", or email {import.meta.env.VITE_HOUSING_EMAIL ?? 'housing@biopunk.house'}.</div>}
      </div>
    </div>
  );
}
