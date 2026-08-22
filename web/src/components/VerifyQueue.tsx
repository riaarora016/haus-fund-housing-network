import type { Property } from '../lib/types';
import { Status, Phone, Email, Fresh } from './Badges';
import { freshness } from '../lib/staleness';

export function verifyReasons(p: Property): string[] {
  const r: string[] = [];
  if (p.contact_verify) r.push('⚠ contact');
  if (p.status === 'stale-verify') r.push('stale-verify');
  if (p.price_per_bed_est == null) r.push('no price');
  if (p.kitchen === 'unknown') r.push('kitchen unknown');
  if (p.audience === 'inventory' && freshness(p).level === 'unverified') r.push('unverified >45d');
  return r;
}
export function VerifyQueue({ rows, onSelect }: { rows: Property[]; onSelect: (p: Property) => void }) {
  const q = rows.map((p) => ({ p, r: verifyReasons(p) })).filter((x) => x.r.length).sort((a, b) => b.r.length - a.r.length || (b.p.score ?? 0) - (a.p.score ?? 0));
  return (
    <div className="overflow-auto h-full">
      <div className="px-3 py-2 text-neutral-500">{q.length} rows need a human: contact flagged ⚠, status stale-verify, no price, kitchen unknown, or inventory not verified in 45 days. Highest-scoring first within each count.</div>
      <table className="min-w-full border-collapse"><thead><tr><th className="th">Why</th><th className="th">Name</th><th className="th">Status</th><th className="th">Score</th><th className="th">Phone</th><th className="th">Email</th><th className="th">Verified</th><th className="th">Last checked</th></tr></thead>
        <tbody>{q.map(({ p, r }) => <tr key={p.id} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900" onClick={() => onSelect(p)}>
          <td className="td">{r.map((x) => <span key={x} className="chip mr-0.5 border-amber-300 text-amber-800 dark:text-amber-300">{x}</span>)}</td>
          <td className="td whitespace-normal min-w-64"><span className="font-medium">{p.name}</span><div className="text-[11px] text-neutral-500">{p.address}</div></td>
          <td className="td"><Status s={p.status} /></td><td className="td font-mono text-right">{p.score}</td>
          <td className="td" onClick={(e) => e.stopPropagation()}><Phone v={p.contact_phone} /></td><td className="td max-w-64 whitespace-normal" onClick={(e) => e.stopPropagation()}><Email v={p.contact_email || p.contact_path} /></td>
          <td className="td">{p.audience === 'inventory' ? <Fresh p={p} /> : '—'}</td><td className="td text-neutral-500">{p.last_checked_raw}</td></tr>)}</tbody></table>
    </div>
  );
}
