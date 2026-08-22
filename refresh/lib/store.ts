// Row store for the refresh jobs. The Google Sheet is the DB; when it isn't configured (local dev, first run)
// we read data/properties.json and persist verification results to refresh/state/verifications.json, which
// build.ts folds back into properties.json. Either way every change is also logged to refresh/state/changes.jsonl.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { sheetConfigured, readProperties, writeProperties } from '../../data/lib/sheet';
import type { Property } from '../../data/schema';

export const STATE_DIR = path.join(process.cwd(), 'refresh', 'state');
export const VERIF = path.join(STATE_DIR, 'verifications.json');
export const CHANGES = path.join(STATE_DIR, 'changes.jsonl');
export const nowIso = () => new Date().toISOString();
export const dateStr = (d = new Date()) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const daysSince = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity);

export type Patch = Partial<Pick<Property, 'beds_available' | 'price_now' | 'price_private_now' | 'min_stay_nights' | 'bookable_online' | 'last_verified' | 'verified_via' | 'confidence' | 'next_check' | 'status' | 'do_not_email' | 'email_thread_id' | 'last_emailed'>> & { notes?: string };

export class Store {
  rows: Property[] = [];
  mode: 'sheet' | 'local' = 'local';
  private verif: Record<string, Patch & { updated_at?: string }> = {};
  private dirty = false;

  static async open(): Promise<Store> {
    const s = new Store();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    s.verif = fs.existsSync(VERIF) ? JSON.parse(fs.readFileSync(VERIF, 'utf8')) : {};
    if (sheetConfigured() && !process.argv.includes('--local')) { s.mode = 'sheet'; s.rows = await readProperties(); }
    else { s.rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'properties.json'), 'utf8')); }
    console.log(`store: ${s.mode} mode, ${s.rows.length} rows`);
    return s;
  }
  byId(id: string) { return this.rows.find((r) => r.id === id); }
  inventory() { return this.rows.filter((r) => r.audience === 'inventory'); }

  /** Apply a verification patch. `source` is logged. Notes are appended, never replaced. */
  patch(id: string, p: Patch, source: string) {
    const row = this.byId(id); if (!row) throw new Error(`no row ${id}`);
    const before: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'notes') continue;
      before[k] = (row as any)[k]; (row as any)[k] = v;
    }
    if (p.notes) row.notes = [row.notes, `[${dateStr()} ${source}] ${p.notes}`].filter(Boolean).join(' | ');
    const prev = this.verif[id] ?? {};
    this.verif[id] = { ...prev, ...p, notes: p.notes ? [prev.notes, `[${dateStr()} ${source}] ${p.notes}`].filter(Boolean).join(' | ') : prev.notes, updated_at: nowIso() };
    const changed = Object.entries(before).filter(([k, v]) => String(v ?? '') !== String((p as any)[k] ?? ''));
    if (changed.length) fs.appendFileSync(CHANGES, JSON.stringify({ at: nowIso(), id, name: row.name, source, changes: Object.fromEntries(changed.map(([k, v]) => [k, { from: v, to: (p as any)[k] }])) }) + '\n');
    this.dirty = true;
  }

  async commit() {
    fs.writeFileSync(VERIF, JSON.stringify(this.verif, null, 2) + '\n');
    if (this.mode === 'sheet' && this.dirty) { await writeProperties(this.rows); console.log('store: wrote rows to Sheet'); }
    else if (this.dirty) console.log('store: wrote refresh/state/verifications.json (run `npm run build` to fold into properties.json)');
    this.dirty = false;
  }
}

export function readChanges(sinceIso: string) {
  if (!fs.existsSync(CHANGES)) return [] as any[];
  return fs.readFileSync(CHANGES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.at >= sinceIso);
}
