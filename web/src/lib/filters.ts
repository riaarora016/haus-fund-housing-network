import { PRIORITY_NEIGHBORHOODS, type Property } from './types';
export type Filters = {
  q: string; nb: string[]; type: string[]; tag: string[]; kitchen: '' | 'yes' | 'no'; status: string[]; outreach: string[];
  audience: 'all' | 'pipeline' | 'inventory'; house: '' | 'punkhaus' | 'femhaus' | 'alumhaus' | 'safehaus'; ready: boolean; eastBay: boolean; nonPriority: boolean; sort: string; dir: 'asc' | 'desc';
};
export const DEFAULT: Filters = { q: '', nb: [], type: [], tag: [], kitchen: '', status: [], outreach: [], audience: 'all', house: '', ready: false, eastBay: false, nonPriority: true, sort: 'score', dir: 'desc' };
const L = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
export function fromParams(sp: URLSearchParams): Filters {
  return { q: sp.get('q') ?? '', nb: L(sp.get('nb')), type: L(sp.get('type')), tag: L(sp.get('tag')), kitchen: (sp.get('kitchen') as Filters['kitchen']) ?? '', status: L(sp.get('status')), outreach: L(sp.get('outreach')),
    audience: (sp.get('aud') as Filters['audience']) || 'all', house: (sp.get('house') as Filters['house']) || '', ready: sp.get('ready') === '1', eastBay: sp.get('eb') === '1', nonPriority: sp.get('np') !== '0', sort: sp.get('sort') || 'score', dir: (sp.get('dir') as Filters['dir']) || 'desc' };
}
export function toParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q); if (f.nb.length) sp.set('nb', f.nb.join(',')); if (f.type.length) sp.set('type', f.type.join(','));
  if (f.tag.length) sp.set('tag', f.tag.join(',')); if (f.kitchen) sp.set('kitchen', f.kitchen); if (f.status.length) sp.set('status', f.status.join(','));
  if (f.outreach.length) sp.set('outreach', f.outreach.join(',')); if (f.audience !== 'all') sp.set('aud', f.audience); if (f.house) sp.set('house', f.house); if (f.ready) sp.set('ready', '1'); if (f.eastBay) sp.set('eb', '1');
  if (!f.nonPriority) sp.set('np', '0'); if (f.sort !== 'score') sp.set('sort', f.sort); if (f.dir !== 'desc') sp.set('dir', f.dir);
  return sp;
}
export function applyFilters(rows: Property[], f: Filters): Property[] {
  const q = f.q.toLowerCase();
  return rows.filter((p) => {
    if (p.baseline) return true; // Fitzgerald baseline rows are always pinned
    if (!f.eastBay && p.east_bay) return false;
    if (!f.nonPriority && ['SF-priority', 'SF-other'].includes(p.region) && !p.priority_neighborhood) return false;
    if (f.audience !== 'all' && p.audience !== f.audience) return false;
    if (f.house && !p.houses.includes(f.house)) return false;
    if (f.ready && p.walk_in_ready !== 'yes') return false;
    if (f.nb.length && !f.nb.includes(p.neighborhood)) return false;
    if (f.type.length && !f.type.includes(p.type)) return false;
    if (f.tag.length && !f.tag.some((t) => p.timeline_tags.includes(t as any))) return false;
    if (f.kitchen === 'yes' && !['communal', 'private'].includes(p.kitchen)) return false;
    if (f.kitchen === 'no' && p.kitchen !== 'none') return false;
    if (f.status.length && !f.status.includes(p.status)) return false;
    if (f.outreach.length && !f.outreach.includes(p.outreach_status)) return false;
    if (q && !`${p.name} ${p.address} ${p.neighborhood} ${p.contact_name} ${p.notes} ${p.play}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
export function neighborhoodOptions(rows: Property[]): string[] {
  const all = [...new Set(rows.map((r) => r.neighborhood))];
  const rest = all.filter((n) => !PRIORITY_NEIGHBORHOODS.includes(n)).sort();
  return [...PRIORITY_NEIGHBORHOODS.filter((n) => all.includes(n)), ...rest];
}
