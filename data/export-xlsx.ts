// Builds the shareable Google-Sheet-ready workbook: data/exports/biopunk-housing-tracker.xlsx.
// One composite priority list (tiered, contacts inline), Elliot's working views, templates and a log.
// Upload to Drive with conversion and it becomes a native multi-tab Google Sheet.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { Property } from './schema';
import { buildTabs, templateNameFor, CHANNEL_ORDER } from './lib/tabs';

const props = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as Property[];
const walkOf = (p: Property) => p.walk_min_from_frontier ?? p.transit_min_to_frontier;
const cell = (v: unknown) => (v == null ? '' : v as any);
const dead = (p: Property) => ['taken', 'sold', 'ruled-out'].includes(p.status);
const inSF = (p: Property) => ['SF-priority', 'SF-other'].includes(p.region);

// Tiers: how soon we pick up the phone.
function tierOf(p: Property): [number, string] {
  if (p.baseline) return [0, 'BASELINE (current deal)'];
  if (dead(p)) return [9, 'Dead (kept for record)'];
  if (!inSF(p)) return [8, 'Parked (outside SF)'];
  const s = p.score ?? 0;
  if (s >= 75) return [1, 'Tier 1: call this week'];
  if (s >= 55) return [2, 'Tier 2: call next'];
  if (s >= 40) return [3, 'Tier 3: backup'];
  return [4, 'Tier 4: long shot'];
}

// In the composite list a building that sits on both master tabs appears once: the deal row wins.
const skipDupes = new Set(props.filter((p) => p.audience === 'inventory' && p.related_id && props.some((x) => x.id === p.related_id && x.audience === 'pipeline')).map((p) => p.id));

const priorityRows = props
  .filter((p) => !skipDupes.has(p.id))
  .map((p) => ({ p, t: tierOf(p) }))
  .sort((a, b) => a.t[0] - b.t[0] || (b.p.score ?? 0) - (a.p.score ?? 0));

const PRIORITY_HEADER = ['Priority', 'Tier', 'Property', 'What it is', 'Address', 'Neighborhood', 'Beds', '$/bed (est)', '$ verified now', 'Kitchen', 'Walk min', 'Sept 15?', 'Walk-in ready', 'Channel', 'Contact person', 'Phone', 'Email / path', 'Template', 'Status', 'Outreach so far', 'House fit', 'Score', 'The play'];
const priority = priorityRows.map(({ p, t }, i) => [
  i + 1, t[1], p.name, p.name_detail, p.address, p.neighborhood, cell(p.beds_est), cell(p.price_per_bed_est),
  p.price_now != null ? `$${p.price_now} on ${p.last_verified?.slice(0, 10)} (${p.verified_via})` : '',
  p.kitchen, cell(walkOf(p)), String(p.sept15_ready), p.walk_in_ready, p.deal_channel,
  p.contact_name, p.contact_phone, p.contact_email || p.contact_path, templateNameFor(p), p.status,
  [p.outreach_status, p.contacted_by].filter(Boolean).join(' by '), p.houses.join(', '), cell(p.score), p.play,
]);

const bookable = props
  .filter((p) => p.audience === 'inventory' && p.status === 'active')
  .sort((a, b) => (a.price_now ?? a.price_per_bed_est ?? 99999) - (b.price_now ?? b.price_per_bed_est ?? 99999))
  .map((p) => [p.name, p.address, p.neighborhood, cell(p.price_now ?? ''), p.last_verified ? `${p.last_verified.slice(0, 10)} via ${p.verified_via}` : 'not verified yet',
    cell(p.price_per_bed_est), p.kitchen, cell(walkOf(p)), cell(p.min_stay_nights), p.bookable_online ? 'yes' : 'no', p.booking_url, p.contact_phone, p.contact_email || p.contact_path]);

const templates = fs.readdirSync('templates/outreach').filter((f) => f.endsWith('.md')).map((f) => {
  const raw = fs.readFileSync(path.join('templates/outreach', f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  const fm: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split('\n')) { const i = line.indexOf(':'); if (i > 0) { let v = line.slice(i + 1).trim(); try { v = JSON.parse(v); } catch {} fm[line.slice(0, i).trim()] = v; } }
  return [fm.template ?? f, fm.use_for ?? '', fm.subject ?? '', (m?.[2] ?? raw).trim()];
});

const start = [
  ['Biopunk Housing Tracker'],
  [`Built ${new Date().toISOString().slice(0, 10)} from the composite dataset (July incubator report + cost dashboard + contact sheet + Giulia/Alex Notion tracker + booking-page checks). 146 buildings tracked; this file shows the working views.`],
  [''],
  ['THE JOB: house 40-50 people near Frontier Tower (995 Market) at about $1,000/bed/month, kitchen access required, no retrofits. Current deal: two floors at the Fitzgerald (620 Post) from Sept 27, singles from $1,595, no real kitchen. Anything on this list is measured against that.'],
  ['DATES: alum house opens Sept 1 · cohort arrives Sept 15 (orientation 17-18) · Fitzgerald starts Sept 27. The gap runs Sept 1-27; a building that takes people Sept 15 beats the Fitzgerald.'],
  [''],
  ['TABS'],
  ['Priority list - every building, ranked. Tier 1 = call this week. Contacts, phone, and which template to use are on the row. Duplicates across sources appear once.'],
  ["Call order - the same thing as a phone queue, grouped the way Elliot works deals: owners (pocket deals) first, then receivers, brokers, institutions, operators."],
  ['Punk House / Femme House / Alum House - candidates per house. Punk = 40-50 people, 35+ beds. Femme = ~10-12 women, kitchen required (backups to 2550 Van Ness). Alum = operating places one person can book into, opens Sept 1.'],
  ['Bookable now - beds someone can get today, cheapest first, with the date each price was verified. A price with no date is an estimate, not an offer.'],
  ['Templates - outreach emails + call scripts. The dorm-institution one never mentions the residency (AAU rule: person-to-person, top-down, never automated).'],
  ['Outreach log - one row per touch. Fill it in as calls happen.'],
  ['Airtable export - rows marked confirmed, flat and ready to import once a deal is set in stone.'],
  [''],
  ['SCORING (0-100): transit to Frontier 35 pts · price per bed 30 · kitchen 15 · bed-count fit 20. Caps: taken/sold/ruled-out = 0; tourist hotel with no kitchen maxes at 40. +5 if it can take people Sept 15. East Bay scores 0 on transit (ruled out, rows kept).'],
  ['ON EVERY CALL: ask for a block of beds from Sept 15, monthly rate per bed, kitchen access, minimum term. Tenant-rights worry? 3-month program, visa-bound residents, everyone vacates at program end. Block pricing beats their vacancy math.'],
  [''],
  ['HONESTY RULES: nothing here has been re-verified unless it shows a verification date. Numbers marked with a date came from the operator\'s own booking page or a reply from them. Bed counts are never estimated.'],
];

const outreachLog = [
  ['Date', 'Property (match Priority list name)', 'Channel (call/email/tour)', 'Who reached out', 'Person reached', 'Asked (beds from Sept 15 / rate / kitchen / min term)', 'Answer: beds', 'Answer: $/bed', 'Answer: min stay', 'Next step', 'Next check date', 'Notes'],
];

const wb = XLSX.utils.book_new();
function add(name: string, rows: any[][], widths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}
add('Start here', start, [160]);
add('Priority list', [PRIORITY_HEADER, ...priority], [7, 20, 30, 26, 30, 14, 6, 9, 22, 10, 8, 8, 11, 11, 30, 22, 30, 16, 11, 18, 22, 7, 40]);
const tabs = buildTabs(props);
for (const t of tabs.filter((t) => t.title !== 'Airtable export')) add(t.title, [[t.note ?? ''], t.header, ...t.rows], t.title === 'Call order' ? [6, 11, 26, 26, 20, 26, 16, 7, 6, 8, 8, 10, 11, 14, 36] : [5, 26, 24, 28, 14, 8, 9, 22, 10, 8, 9, 11, 11, 7, 11, 16, 26, 20, 26, 36, 30]);
add('Bookable now', [['Property', 'Address', 'Neighborhood', '$/bed now', 'Verified', '$/bed est', 'Kitchen', 'Walk min', 'Min stay (nights)', 'Book online?', 'Booking link', 'Phone', 'Email'], ...bookable], [28, 30, 14, 9, 22, 9, 10, 8, 10, 10, 44, 20, 28]);
add('Templates', [['Template', 'Use for', 'Subject', 'Body'], ...templates], [22, 40, 44, 110]);
add('Outreach log', outreachLog, [10, 30, 12, 12, 22, 34, 10, 10, 10, 18, 12, 40]);
const at = tabs.find((t) => t.title === 'Airtable export')!;
add('Airtable export', [[at.note ?? ''], at.header, ...at.rows], [26, 30, 14, 12, 6, 10, 10, 10, 24, 20, 26, 16, 10, 40, 30]);

fs.mkdirSync('data/exports', { recursive: true });
const out = 'data/exports/biopunk-housing-tracker.xlsx';
XLSX.writeFile(wb, out);
const t1 = priorityRows.filter(({ t }) => t[0] === 1).length;
console.log(`${out}: ${wb.SheetNames.length} tabs (${wb.SheetNames.join(', ')}); priority list ${priority.length} rows, Tier 1 = ${t1}; bookable now ${bookable.length}; ${skipDupes.size} cross-tab duplicates collapsed`);
