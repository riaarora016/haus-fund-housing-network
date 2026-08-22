import fs from 'node:fs';
import path from 'node:path';
import type { Property } from '../../data/schema';

export function loadTemplate(name: string): { subject: string; body: string; use_for: string } {
  const file = path.join(process.cwd(), 'templates', 'outreach', `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/); if (!m) throw new Error(`bad template ${file}`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim(); try { v = JSON.parse(v); } catch {} fm[k] = v; } }
  return { subject: fm.subject ?? '', body: m[2].trim(), use_for: fm.use_for ?? '' };
}
export function fill(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null || vars[k] === '' ? `[${k}]` : String(vars[k])));
}
export function templateFor(p: Property): string {
  if (p.timeline_tags.includes('femme-house') && (p.beds_est ?? 99) <= 20) return 'femme-house';
  if (p.status === 'receivership' || /receiver|lender|servicer|REO|default/i.test(p.play + ' ' + p.contact_name)) return 'receiver-or-lender';
  if (p.type === 'dorm' || p.type === 'campus' || p.aau) return 'dorm-institution';
  if (p.type === 'co-living' || p.type === 'hostel' || p.audience === 'inventory') return 'co-living-block';
  return 'sro-master-lease';
}
export function varsFor(p: Property, sender = process.env.SENDER_NAME ?? 'Ria Arora'): Record<string, string | number | null> {
  const now = new Date();
  return {
    name: p.name.split(' — ')[0], address: p.address, rooms: p.rooms ?? p.beds_est, beds: p.beds_est, price_ask: p.price_per_bed_est ? `$${p.price_per_bed_est.toLocaleString()}/bed` : '$1,000/bed',
    contact_name: (p.contact_name.split(/[—,(·]/)[0] || 'there').trim(), sender_name: sender, month: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    arrival: 'September 15', nights: 30, cohort: '40–50',
  };
}
