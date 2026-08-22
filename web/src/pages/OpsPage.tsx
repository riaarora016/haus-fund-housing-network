import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadData, type Loaded } from '../lib/data';
import { applyFilters, fromParams, toParams, type Filters } from '../lib/filters';
import type { Property } from '../lib/types';
import { Header } from '../components/Header';
import { FiltersBar } from '../components/FiltersBar';
import { RankedTable } from '../components/RankedTable';
import { Drawer } from '../components/Drawer';
import { MapView } from '../components/MapView';
import { VerifyQueue } from '../components/VerifyQueue';

export function OpsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [sp, setSp] = useSearchParams();
  const f = useMemo(() => fromParams(sp), [sp]);
  const tab = sp.get('tab') ?? 'table';
  const selectedId = sp.get('sel') ?? undefined;
  useEffect(() => { loadData('all').then(setData); }, []);
  const set = useCallback((patch: Partial<Filters>) => { const next = toParams({ ...f, ...patch }); if (tab !== 'table') next.set('tab', tab); if (selectedId) next.set('sel', selectedId); setSp(next, { replace: true }); }, [f, tab, selectedId, setSp]);
  const setTab = (t: string) => { const next = new URLSearchParams(sp); t === 'table' ? next.delete('tab') : next.set('tab', t); setSp(next); };
  const select = (p: Property | null) => { const next = new URLSearchParams(sp); p ? next.set('sel', p.id) : next.delete('sel'); setSp(next, { replace: true }); };
  const rows = data?.rows ?? [];
  const visible = useMemo(() => applyFilters(rows, f), [rows, f]);
  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;
  if (!data) return <div className="p-6 text-neutral-500">loading…</div>;
  return (
    <div className="flex flex-col h-screen">
      <Header data={data} visible={visible.filter((p) => !p.baseline)} />
      <FiltersBar f={f} set={set} rows={rows} showAudience />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-neutral-200 dark:border-neutral-800 text-[12px]">
        {(['table', 'map', 'verify'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black' : ''}`}>{t === 'table' ? `ranked table (${visible.filter((p) => !p.baseline).length})` : t === 'map' ? 'map' : 'verify queue'}</button>)}
        <span className="ml-auto text-neutral-500">default sort: score desc · click headers to sort · click a row for the drawer · <Link className="underline" to="/find">founder view →</Link></span>
      </div>
      <div className="flex grow min-h-0 overflow-hidden">
        <div className="grow min-w-0 min-h-0 h-full relative">
          {tab === 'table' && <RankedTable rows={visible} sort={f.sort} dir={f.dir} onSort={(k) => set({ sort: k, dir: f.sort === k && f.dir === 'desc' ? 'asc' : 'desc' })} onSelect={select} selected={selectedId} />}
          {tab === 'map' && <MapView rows={visible} onSelect={select} selected={selectedId} />}
          {tab === 'verify' && <VerifyQueue rows={visible} onSelect={select} />}
        </div>
        {selected && <Drawer p={selected} all={rows} onClose={() => select(null)} onSelect={select} />}
      </div>
    </div>
  );
}
