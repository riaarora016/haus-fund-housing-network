import type { Filters } from '../lib/filters';
import type { Property } from '../lib/types';
import { neighborhoodOptions } from '../lib/filters';

const TYPES = ['sro-hotel', 'tourist-hotel', 'dorm', 'co-living', 'hostel', 'apartment-block', 'campus', 'sfh', 'other'];
const TAGS = ['bridge-sept', 'q1-2027', 'femme-house', 'alum-house', 'expansion'];
const STATUSES = ['active', 'on-market', 'receivership', 'dark', 'stale-verify', 'taken', 'sold', 'ruled-out'];
const OUTREACH = ['not-contacted', 'contacted', 'called', 'emailed', 'toured', 'loi', 'dead'];

function Multi({ label, opts, value, onChange, priorityCount = 0 }: { label: string; opts: string[]; value: string[]; onChange: (v: string[]) => void; priorityCount?: number }) {
  return (
    <details className="relative">
      <summary className="btn list-none cursor-pointer">{label}{value.length ? <span className="ml-1 rounded bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black px-1 text-[10px]">{value.length}</span> : null}</summary>
      <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-auto rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1 shadow-lg">
        {opts.map((o, i) => (
          <label key={o} className={`flex items-center gap-2 px-1 py-0.5 text-[12px] hover:bg-neutral-100 dark:hover:bg-neutral-800 ${i === priorityCount && priorityCount ? 'border-t border-neutral-200 dark:border-neutral-700 mt-1 pt-1' : ''}`}>
            <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />{o}{i < priorityCount && <span className="text-[10px] text-neutral-400">priority</span>}
          </label>
        ))}
        {value.length > 0 && <button className="btn mt-1 w-full" onClick={() => onChange([])}>clear</button>}
      </div>
    </details>
  );
}

export function FiltersBar({ f, set, rows, showAudience }: { f: Filters; set: (p: Partial<Filters>) => void; rows: Property[]; showAudience: boolean }) {
  const nbs = neighborhoodOptions(rows);
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
      <input className="input w-48" placeholder="search name / address / notes" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      <Multi label="Neighborhood" opts={nbs} value={f.nb} onChange={(nb) => set({ nb })} priorityCount={nbs.filter((n) => ['SoMa','Nob Hill','Civic Center','FiDi','Union Square','NoPa/Panhandle'].includes(n)).length} />
      <Multi label="Type" opts={TYPES} value={f.type} onChange={(type) => set({ type })} />
      <Multi label="Timeline" opts={TAGS} value={f.tag} onChange={(tag) => set({ tag })} />
      <select className="input" value={f.kitchen} onChange={(e) => set({ kitchen: e.target.value as Filters['kitchen'] })}><option value="">kitchen: any</option><option value="yes">kitchen: yes</option><option value="no">kitchen: none</option></select>
      <Multi label="Status" opts={STATUSES} value={f.status} onChange={(status) => set({ status })} />
      <Multi label="Outreach" opts={OUTREACH} value={f.outreach} onChange={(outreach) => set({ outreach })} />
      {showAudience && <select className="input" value={f.audience} onChange={(e) => set({ audience: e.target.value as Filters['audience'] })}><option value="all">pipeline + inventory</option><option value="pipeline">pipeline (whole buildings)</option><option value="inventory">inventory (bookable beds)</option></select>}
      <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={f.eastBay} onChange={(e) => set({ eastBay: e.target.checked })} />Show East Bay</label>
      <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={f.nonPriority} onChange={(e) => set({ nonPriority: e.target.checked })} />Show non-priority SF</label>
      <button className="btn ml-auto" onClick={() => navigator.clipboard.writeText(location.href)} title="copy the current filtered view URL">copy link</button>
    </div>
  );
}
