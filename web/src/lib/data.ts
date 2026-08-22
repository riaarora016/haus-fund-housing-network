// Data loading: published Sheet CSVs (VITE_PIPELINE_CSV_URL / VITE_INVENTORY_CSV_URL) with ../data/properties.json as dev fallback.
import Papa from 'papaparse';
import { cellsToRow } from '@data/lib/csv';
import type { Property } from './types';
import fallback from '@data/properties.json';

export const OPS_ENABLED = (import.meta.env.VITE_ENABLE_OPS ?? 'true') !== 'false';
export type Loaded = { rows: Property[]; source: 'sheet' | 'local'; loadedAt: Date; lastUpdated: string | null; errors: string[] };

async function fetchCsv(url: string): Promise<Property[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 60)}`);
  const text = await res.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.filter((r) => r.id).map(cellsToRow);
}

export async function loadData(audience: 'all' | 'inventory'): Promise<Loaded> {
  const urls = [audience === 'all' && OPS_ENABLED ? import.meta.env.VITE_PIPELINE_CSV_URL : '', import.meta.env.VITE_INVENTORY_CSV_URL].filter(Boolean) as string[];
  const errors: string[] = [];
  let rows: Property[] = [];
  let source: Loaded['source'] = 'local';
  if (urls.length) {
    const results = await Promise.allSettled(urls.map(fetchCsv));
    for (const r of results) r.status === 'fulfilled' ? rows.push(...r.value) : errors.push(String(r.reason));
    if (rows.length) source = 'sheet';
  }
  if (!rows.length) rows = (fallback as unknown as Property[]).filter((p) => audience === 'all' ? (OPS_ENABLED || p.audience === 'inventory') : p.audience === 'inventory');
  if (audience === 'inventory') rows = rows.filter((p) => p.audience === 'inventory'); // residents never see the pipeline tab
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const lastUpdated = rows.map((r) => r.last_verified ?? '').concat(rows.map((r) => r.last_checked ?? '')).filter(Boolean).sort().pop() ?? null;
  return { rows, source, loadedAt: new Date(), lastUpdated, errors };
}
