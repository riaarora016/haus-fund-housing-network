// The one-pager Elliot asked for: a digestible market map you can print or send as a link.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadData, type Loaded } from '../lib/data';
import type { Property } from '../lib/types';
import { fmtMoney } from '../lib/staleness';

export function BriefPage() {
  const [data, setData] = useState<Loaded | null>(null);
  useEffect(() => { loadData('all').then(setData); }, []);
  if (!data) return <div className="p-6 text-neutral-500">loading…</div>;
  const live = data.rows.filter((p) => !p.baseline && !['taken', 'sold', 'ruled-out'].includes(p.status) && ['SF-priority', 'SF-other'].includes(p.region));
  const top = [...live].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
  const baseline = data.rows.find((p) => p.baseline && p.type === 'co-living' && p.audience === 'pipeline');
  const s15 = live.filter((p) => p.sept15_ready === true).length;
  const walk = (p: Property) => p.walk_min_from_frontier ?? p.transit_min_to_frontier;
  return (
    <div className="max-w-4xl mx-auto p-6 print:p-0 text-[12px]">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-[18px] font-semibold">Biopunk SF housing: the shortlist</h1>
        <div className="print:hidden flex gap-2"><button className="btn" onClick={() => window.print()}>print / save PDF</button><Link className="btn" to="/">full tracker</Link></div>
      </div>
      <p className="text-neutral-600 dark:text-neutral-400 mb-3">
        Goal: 40-50 people near Frontier Tower (995 Market) at about $1,000/bed/month, kitchen access required.
        Current deal: two floors at the Fitzgerald (620 Post) from Sept 27{baseline?.price_per_bed_est ? `, singles from ${fmtMoney(baseline.price_per_bed_est)}` : ''}, no real kitchen.
        Cohort arrives Sept 15, so the gap runs Sept 1-27. {s15} of the buildings below can take people on Sept 15.
        Everything is ranked on transit, price, kitchen and bed count; full data and sources in the tracker.
      </p>
      <table className="w-full border-collapse">
        <thead><tr>{['#','Property','Neighborhood','Beds','$/bed','Kitchen','Walk','Sept 15','Ready as-is','Score','Contact','Phone'].map((h) => <th key={h} className="text-left border-b border-neutral-300 dark:border-neutral-700 py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {top.map((p, i) => (
            <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-900 align-top">
              <td className="py-1 pr-2 text-neutral-400">{i + 1}</td>
              <td className="py-1 pr-2"><b>{p.name}</b><div className="text-neutral-500">{p.address}</div></td>
              <td className="py-1 pr-2">{p.neighborhood}</td>
              <td className="py-1 pr-2">{p.beds_est ?? '?'}</td>
              <td className="py-1 pr-2">{fmtMoney(p.price_now ?? p.price_per_bed_est)}{p.price_now != null && <span className="text-neutral-500"> ✓{p.last_verified?.slice(5, 10)}</span>}</td>
              <td className="py-1 pr-2">{p.kitchen}</td>
              <td className="py-1 pr-2">{walk(p) ?? '?'} min</td>
              <td className="py-1 pr-2">{p.sept15_ready === true ? 'yes' : p.sept15_ready === false ? 'no' : '?'}</td>
              <td className="py-1 pr-2">{p.walk_in_ready}</td>
              <td className="py-1 pr-2 font-mono">{p.score}</td>
              <td className="py-1 pr-2">{(p.contact_name || '').split(/[,(·]/)[0]}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{(p.contact_phone.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) ?? [p.contact_phone.slice(0, 18)])[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-neutral-500">
        Prices with a ✓ were verified on that date from the operator's own booking page; the rest are from the July report / August Notion tracker and need a call.
        Playbook: master-lease a residential hotel or dorm block as-is (no retrofits), 3-month program terms so landlords carry no tenant-rights risk, block pricing brings beds under target.
        Generated from the live tracker; numbers update as we verify.
      </p>
    </div>
  );
}
