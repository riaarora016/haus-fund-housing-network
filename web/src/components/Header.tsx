import type { Property } from '../lib/types';
import { freshness } from '../lib/staleness';
import type { Loaded } from '../lib/data';

export function Header({ data, visible }: { data: Loaded; visible: Property[] }) {
  const rows = data.rows;
  const sf = rows.filter((p) => !p.east_bay && ['SF-priority', 'SF-other'].includes(p.region) && !['taken', 'sold', 'ruled-out'].includes(p.status) && !p.baseline);
  const needVerify = rows.filter((p) => p.contact_verify || p.status === 'stale-verify' || p.price_per_bed_est == null || p.kitchen === 'unknown').length;
  const s15 = rows.filter((p) => p.sept15_ready === true && !p.baseline).length;
  const fresh = rows.filter((p) => p.audience === 'inventory' && freshness(p).level !== 'unverified').length;
  const stat = (k: string, v: React.ReactNode, t?: string) => <div title={t} className="px-3 py-1 border-r border-neutral-200 dark:border-neutral-800 last:border-r-0"><div className="text-[10px] uppercase tracking-wide text-neutral-500">{k}</div><div className="font-medium">{v}</div></div>;
  return (
    <header className="flex flex-wrap items-stretch border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60">
      {stat('Cohort', '40–50 people · ~$1,000/bed', 'Target from the Aug 2026 planning call; shared from ~$850, singles $1,500–2,500')}
      {stat('Anchor', <a className="underline decoration-dotted" href="https://www.openstreetmap.org/?mlat=37.78255&mlon=-122.40935#map=17/37.78255/-122.40935" target="_blank" rel="noreferrer">Frontier Tower · 995 Market</a>)}
      {stat('Active SF candidates', sf.length, 'SF rows not taken/sold/ruled-out, excluding the Fitzgerald baseline')}
      {stat('Rows shown', visible.length, 'after the current filters (baseline rows excluded from this count)')}
      {stat('Needs verification', needVerify, '⚠ contact, stale-verify, no price, or unknown kitchen')}
      {stat('Move-in', <span><b>Sept 15</b> vs Fitzgerald <b>Sept 27</b> · 12-night bridge</span>, 'Arrival Sept 15 (orientation 17–18); Fitzgerald starts Sept 27')}
      {stat('Sept-15 ready', `${s15} buildings`, 'sept15_ready = true from a source (Notion "Available now", hostels, report)')}
      {stat('Verified inventory', `${fresh} / ${rows.filter((p) => p.audience === 'inventory').length}`, 'inventory rows with a last_verified within 45 days')}
      {stat('Data', <span>{data.source === 'sheet' ? 'Google Sheet' : 'local properties.json'} · updated {data.lastUpdated ?? '—'}</span>, data.errors.join('\n') || `loaded ${data.loadedAt.toLocaleTimeString()}`)}
    </header>
  );
}
