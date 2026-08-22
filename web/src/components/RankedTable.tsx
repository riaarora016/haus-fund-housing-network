import type { Property } from '../lib/types';
import { Kitchen, Status, Tag, Source, Sept15, ScoreCell, Fresh } from './Badges';
import { adjScore, fmtMoney } from '../lib/staleness';

type Col = { key: string; label: string; get: (p: Property) => number | string | null; render?: (p: Property, i: number) => React.ReactNode; cls?: string };
export const COLS: Col[] = [
  { key: 'rank', label: '#', get: () => null, render: (_p, i) => <span className="text-neutral-400">{i + 1}</span> },
  { key: 'name', label: 'Name', get: (p) => p.name, render: (p) => <span className="whitespace-normal"><span className="font-medium">{p.name}</span>{p.aau && <span className="chip ml-1 border-rose-300 text-rose-700">AAU</span>}{p.contact_verify && <span className="ml-1" title="contact needs verification">⚠</span>}<div className="text-[11px] text-neutral-500">{p.address}</div></span>, cls: 'min-w-64 max-w-96' },
  { key: 'neighborhood', label: 'Neighborhood', get: (p) => p.neighborhood, render: (p) => <span className={p.priority_neighborhood ? '' : 'text-neutral-500'}>{p.neighborhood}{p.east_bay && <span className="ml-1 text-[10px] text-red-500">EB</span>}</span> },
  { key: 'type', label: 'Type', get: (p) => p.type },
  { key: 'beds_est', label: 'Beds', get: (p) => p.beds_est, render: (p) => <span title={`${p.capacity_raw || p.rooms || ''}${p.occupancy_assumption ? ` × ${p.occupancy_assumption}/room` : ''}`}>{p.beds_est ?? '?'}</span>, cls: 'text-right' },
  { key: 'price_per_bed_est', label: '$/bed', get: (p) => p.price_per_bed_est, render: (p) => <span title={p.price_raw}>{fmtMoney(p.price_per_bed_est)}{p.price_now != null && <span className="ml-1 text-[10px] text-emerald-600" title={`verified ${p.last_verified?.slice(0, 10)} via ${p.verified_via}`}>now {fmtMoney(p.price_now)}</span>}</span>, cls: 'text-right' },
  { key: 'kitchen', label: 'Kitchen', get: (p) => p.kitchen, render: (p) => <Kitchen k={p.kitchen} /> },
  { key: 'walk', label: 'Walk', get: (p) => p.walk_min_from_frontier ?? p.transit_min_to_frontier, render: (p) => <span title={p.walk_min_from_frontier != null ? p.walk_source : p.transit_min_to_frontier != null ? 'computed heuristic' : ''}>{p.walk_min_from_frontier ?? (p.transit_min_to_frontier != null ? `~${p.transit_min_to_frontier}` : '—')}</span>, cls: 'text-right' },
  { key: 'sept15', label: 'Sept 15', get: (p) => String(p.sept15_ready), render: (p) => <Sept15 v={p.sept15_ready} /> },
  { key: 'score', label: 'Score', get: (p) => adjScore(p), render: (p) => <ScoreCell p={p} adj={adjScore(p)} />, cls: 'text-right' },
  { key: 'status', label: 'Status', get: (p) => p.status, render: (p) => <Status s={p.status} /> },
  { key: 'tags', label: 'Timeline', get: (p) => p.timeline_tags.join(','), render: (p) => <span className="whitespace-normal">{p.timeline_tags.map((t) => <Tag key={t} t={t} />)}</span> },
  { key: 'outreach', label: 'Outreach', get: (p) => p.outreach_status, render: (p) => <span>{p.outreach_status}{p.contacted_by && <span className="text-neutral-500"> · {p.contacted_by}</span>}</span> },
  { key: 'verified', label: 'Verified', get: (p) => p.last_verified, render: (p) => p.audience === 'inventory' ? <Fresh p={p} /> : <span className="text-neutral-400">—</span> },
  { key: 'source', label: 'Source', get: (p) => p.source, render: (p) => <Source p={p} /> },
];

export function RankedTable({ rows, sort, dir, onSort, onSelect, selected }: { rows: Property[]; sort: string; dir: 'asc' | 'desc'; onSort: (k: string) => void; onSelect: (p: Property) => void; selected?: string }) {
  const col = COLS.find((c) => c.key === sort) ?? COLS[9];
  const sorted = [...rows].sort((a, b) => {
    if (a.baseline !== b.baseline) return 0;
    const va = col.get(a), vb = col.get(b);
    if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return dir === 'asc' ? c : -c;
  });
  const baseline = sorted.filter((p) => p.baseline), rest = sorted.filter((p) => !p.baseline);
  const Row = ({ p, i }: { p: Property; i: number }) => (
    <tr onClick={() => onSelect(p)} className={`cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 ${p.baseline ? 'bg-sky-50 dark:bg-sky-950/40' : ''} ${selected === p.id ? 'outline outline-1 outline-sky-400' : ''} ${['taken', 'sold', 'ruled-out'].includes(p.status) ? 'opacity-50' : ''}`}>
      {COLS.map((c) => <td key={c.key} className={`td ${c.cls ?? ''}`}>{c.render ? c.render(p, i) : String(c.get(p) ?? '—')}</td>)}
    </tr>
  );
  return (
    <div className="overflow-auto h-full">
      <table className="min-w-full border-collapse">
        <thead><tr>{COLS.map((c) => <th key={c.key} className={`th ${c.cls ?? ''}`} onClick={() => c.key !== 'rank' && onSort(c.key)}>{c.label}{sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
        <tbody>
          {baseline.map((p, i) => <Row key={p.id} p={p} i={i} />)}
          {baseline.length > 0 && <tr><td colSpan={COLS.length} className="td text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-300 bg-sky-50/60 dark:bg-sky-950/30">▲ current deal (Fitzgerald baseline, pinned) — everything below is scored against it</td></tr>}
          {rest.map((p, i) => <Row key={p.id} p={p} i={i} />)}
          {rows.length === 0 && <tr><td colSpan={COLS.length} className="td text-center text-neutral-500 py-8">no rows match these filters</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
