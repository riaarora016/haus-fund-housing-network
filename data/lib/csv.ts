// Browser-safe (de)serialisation of Property rows <-> Sheet/CSV cells. Imported by the web app and sheet.ts.
import { SHEET_COLUMNS, type Property } from '../schema';

// ---- (de)serialisation: every cell is a string in the Sheet / CSV ----
export function toCell(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(' | ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
export function rowToCells(p: Property): string[] { return SHEET_COLUMNS.map((c) => toCell((p as any)[c])); }

const NUM = new Set(['lat','lng','dist_to_frontier_mi','transit_min_to_frontier','walk_min_from_frontier','rooms','beds_est','occupancy_assumption',
  'price_per_room_low','price_per_room_high','price_per_bed_est','monthly_total_45_est','score','score_sheet','notion_round','beds_available','price_now','price_private_now','min_stay_nights']);
const BOOL = new Set(['east_bay','priority_neighborhood','aau','baseline','contact_verify','bookable_online','do_not_email']);
const LIST = new Set(['timeline_tags','source_links','houses']);
const JSONC = new Set(['score_breakdown']);
export function cellsToRow(obj: Record<string, string>): Property {
  const out: any = {};
  for (const c of SHEET_COLUMNS) {
    const v = obj[c] ?? '';
    if (NUM.has(c)) out[c] = v === '' ? null : Number(v);
    else if (BOOL.has(c)) out[c] = v === 'true' || v === 'TRUE';
    else if (LIST.has(c)) out[c] = v === '' ? [] : v.split(' | ').map((s) => s.trim()).filter(Boolean);
    else if (JSONC.has(c)) { try { out[c] = v ? JSON.parse(v) : null; } catch { out[c] = null; } }
    else if (c === 'sept15_ready') out[c] = v === 'true' ? true : v === 'false' ? false : 'unknown';
    else if (c === 'furnished') out[c] = v === 'true' ? true : v === 'false' ? false : 'unknown';
    else if (['cluster_id','related_id','last_checked','last_verified','verified_via','confidence','next_check','last_emailed'].includes(c)) out[c] = v === '' ? null : v;
    else out[c] = v;
  }
  return out as Property;
}

