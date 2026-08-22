import { useEffect, useState } from 'react';
import type { Property } from '../lib/types';
import { Kitchen, Status, Tag, Source, Sept15, ScoreCell, Fresh, Phone, Email } from './Badges';
import { adjScore, fmtDate, fmtMoney } from '../lib/staleness';
import { TEMPLATES, templateFor, fill, varsFor } from '../lib/templates';

const LOG_KEY = (id: string) => `outreach-log:${id}`;
export function Drawer({ p, all, onClose, onSelect }: { p: Property; all: Property[]; onClose: () => void; onSelect: (p: Property) => void }) {
  const [tpl, setTpl] = useState(templateFor(p));
  const [log, setLog] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => { setTpl(templateFor(p)); setLog(localStorage.getItem(LOG_KEY(p.id)) ?? ''); setCopied(''); }, [p.id]);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const related = p.related_id ? all.find((x) => x.id === p.related_id) : null;
  const t = TEMPLATES[tpl];
  const email = t ? `Subject: ${fill(t.subject, varsFor(p))}\n\n${fill(t.body, varsFor(p))}` : '';
  const copy = async (text: string, what: string) => { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };
  const F = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="grid grid-cols-[9rem_1fr] gap-2 py-0.5 border-b border-neutral-100 dark:border-neutral-900"><div className="text-neutral-500">{k}</div><div className="break-words">{v ?? '—'}</div></div>;
  return (
    <aside className="w-[34rem] max-w-full shrink-0 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-auto h-full">
      <div className="sticky top-0 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2 flex items-start gap-2">
        <div className="grow"><div className="font-medium text-[14px]">{p.name}</div><div className="text-neutral-500">{p.address}</div>
          <div className="mt-1 flex flex-wrap gap-1 items-center"><Status s={p.status} /><Source p={p} />{p.timeline_tags.map((x) => <Tag key={x} t={x} />)}{p.aau && <span className="chip border-rose-300 text-rose-700">AAU — pitch as block</span>}{p.baseline && <span className="chip border-sky-300 text-sky-700">BASELINE</span>}<ScoreCell p={p} adj={adjScore(p)} /></div></div>
        <button className="btn" onClick={onClose} title="Esc">✕</button>
      </div>
      <div className="p-3 space-y-3">
        {p.play && <div className="rounded border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-2 py-1"><span className="text-[10px] uppercase text-amber-700 dark:text-amber-300">the play</span><div>{p.play}</div></div>}

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Contact {p.contact_verify && <span className="chip border-amber-400 text-amber-800 dark:text-amber-300 ml-1">⚠ verify by phone before relying on this</span>}</h3>
          <F k="name" v={p.contact_name} /><F k="phone" v={<Phone v={p.contact_phone} />} /><F k="email" v={<Email v={p.contact_email} />} /><F k="path" v={p.contact_path} /><F k="section" v={p.contact_section} />
          <F k="outreach" v={<span>{p.outreach_status}{p.contacted_by ? ` · ${p.contacted_by}` : ''}{p.last_emailed ? ` · emailed ${fmtDate(p.last_emailed)}` : ''}{p.do_not_email ? ' · DO NOT EMAIL' : ''}</span>} />
        </section>

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Live availability {p.audience === 'inventory' && <Fresh p={p} />}</h3>
          <F k="beds available" v={p.beds_available != null ? <b>{p.beds_available} <span className="font-normal text-neutral-500">as of {fmtDate(p.last_verified)} via {p.verified_via}</span></b> : <span className="text-neutral-500">not verified — never estimated</span>} />
          <F k="price now" v={p.price_now != null ? <span>{fmtMoney(p.price_now)}/bed{p.price_private_now ? ` · private ${fmtMoney(p.price_private_now)}` : ''} <span className="text-neutral-500">as of {fmtDate(p.last_verified)} via {p.verified_via}</span></span> : <span className="text-neutral-500">not verified</span>} />
          <F k="min stay" v={p.min_stay_nights != null ? `${p.min_stay_nights} nights` : null} /><F k="bookable online" v={p.bookable_online ? <a className="underline" href={p.booking_url} target="_blank" rel="noreferrer">yes → {p.booking_url.replace(/^https?:\/\//, '').slice(0, 50)}</a> : p.booking_url ? <a className="underline" href={p.booking_url} target="_blank" rel="noreferrer">no (contact) · {p.booking_url.replace(/^https?:\/\//, '').slice(0, 40)}</a> : 'no'} />
          <F k="confidence" v={p.confidence} /><F k="next check" v={p.next_check} /><F k="operator" v={p.operator} />
        </section>

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Building</h3>
          <F k="type" v={`${p.type}${p.type_raw && p.type_raw !== p.type ? ` (${p.type_raw})` : ''}`} /><F k="rooms / capacity" v={`${p.rooms ?? '?'}${p.capacity_raw ? ` · ${p.capacity_raw}` : ''}`} /><F k="beds est" v={`${p.beds_est ?? '?'}${p.occupancy_assumption ? ` (× ${p.occupancy_assumption} per room)` : ''}`} />
          <F k="$/room" v={p.price_per_room_low != null ? `${fmtMoney(p.price_per_room_low)}–${fmtMoney(p.price_per_room_high)}` : null} /><F k="$/bed est" v={<span>{fmtMoney(p.price_per_bed_est)} <span className="text-neutral-500">{p.price_raw}</span></span>} /><F k="monthly for 45" v={fmtMoney(p.monthly_total_45_est)} />
          <F k="kitchen" v={<span><Kitchen k={p.kitchen} /> {p.kitchen_raw && p.kitchen_raw !== p.kitchen ? <span className="text-neutral-500">({p.kitchen_raw})</span> : null}</span>} /><F k="bath / furnished" v={`${p.bath} / ${String(p.furnished)}`} />
          <F k="walk to Frontier" v={<span>{p.walk_min_from_frontier ?? (p.transit_min_to_frontier != null ? `~${p.transit_min_to_frontier}` : '—')} min <span className="text-neutral-500">({p.walk_min_from_frontier != null ? p.walk_source : 'computed heuristic'}){p.dist_to_frontier_mi != null && ` · ${p.dist_to_frontier_mi} mi straight-line · geocode: ${p.geo_precision}`}</span></span>} />
          <F k="sept 15 ready" v={<Sept15 v={p.sept15_ready} />} /><F k="neighborhood" v={`${p.neighborhood}${p.neighborhood_raw !== p.neighborhood ? ` (${p.neighborhood_raw})` : ''} · ${p.region}`} /><F k="tier" v={p.tier} /><F k="cluster" v={p.cluster_id} />
          {related && <F k="same building" v={<button className="underline" onClick={() => onSelect(related)}>{related.name} ({related.audience} tab)</button>} />}
          <F k="last checked" v={p.last_checked_raw} /><F k="id" v={<code>{p.id}</code>} />
        </section>

        {p.score_breakdown && <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Score breakdown</h3>
          <div className="grid grid-cols-4 gap-1 text-center">{(['transit', 'price', 'kitchen', 'beds'] as const).map((k) => <div key={k} className="rounded border border-neutral-200 dark:border-neutral-800 py-1"><div className="text-[10px] text-neutral-500">{k}</div><div className="font-mono">{p.score_breakdown![k]}</div></div>)}</div>
          <ul className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400 list-disc pl-4">{p.score_breakdown.sept15_bonus ? <li>sept-15 bonus +{p.score_breakdown.sept15_bonus}</li> : null}{p.score_breakdown.caps_applied.map((c) => <li key={c} className="text-red-600">{c}</li>)}{p.score_breakdown.method_notes.map((n) => <li key={n}>{n}</li>)}{adjScore(p) !== p.score && <li className="text-neutral-500">staleness −{(p.score ?? 0) - (adjScore(p) ?? 0)} (verification 15–45 days old)</li>}</ul></section>}

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Sources</h3>
          <ul className="list-disc pl-4">{p.source_links.map((l) => <li key={l} className="break-all"><a className="underline decoration-dotted" href={/^https?:/.test(l) ? l : `https://${l.replace(/^.*?: ?/, '')}`} target="_blank" rel="noreferrer">{l}</a></li>)}{p.source_links.length === 0 && <li className="text-neutral-500">workbook row only ({p.last_checked_raw})</li>}</ul></section>

        {p.notes && <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Notes</h3><div className="whitespace-pre-wrap text-[12px]">{p.notes.split(' | ').map((n, i) => <p key={i} className="mb-1">{n}</p>)}</div></section>}

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Outreach log <span className="normal-case text-neutral-400">(saved in this browser; paste into the Sheet's "Outreach log" tab)</span></h3>
          <textarea className="input w-full h-24 font-mono" value={log} onChange={(e) => { setLog(e.target.value); localStorage.setItem(LOG_KEY(p.id), e.target.value); }} placeholder={`${new Date().toISOString().slice(0, 10)} · call · asked beds from Sept 15 / rate / kitchen · answer…`} />
          <button className="btn mt-1" onClick={() => copy(`${new Date().toISOString().slice(0, 10)}\t${p.name}\t${p.audience === 'pipeline' ? 'Pipeline' : 'Inventory'}\t\t\t${p.contact_name}\t\t\t\t\t\t\t${log.replace(/\n/g, ' ')}`, 'log row')}>{copied === 'log row' ? 'copied ✓' : 'copy as Sheet row'}</button></section>

        <section><h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Outreach email</h3>
          <div className="flex gap-1 items-center mb-1"><select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>{Object.values(TEMPLATES).filter((x) => !x.name.startsWith('_')).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select>
            <button className="btn" onClick={() => copy(email, 'email')}>{copied === 'email' ? 'copied ✓' : 'Copy outreach email'}</button>
            {/@/.test(p.contact_email) && <a className="btn" href={`mailto:${p.contact_email.match(/[\w.+-]+@[\w.-]+/)?.[0]}?subject=${encodeURIComponent(fill(t?.subject ?? '', varsFor(p)))}&body=${encodeURIComponent(fill(t?.body ?? '', varsFor(p)))}`}>open in mail</a>}</div>
          {t?.use_for && <div className="text-[11px] text-neutral-500 mb-1">{t.use_for}</div>}
          <pre className="whitespace-pre-wrap text-[11px] rounded border border-neutral-200 dark:border-neutral-800 p-2 max-h-64 overflow-auto">{email}</pre></section>
      </div>
    </aside>
  );
}
