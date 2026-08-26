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

const PRIORITY_HEADER = ['Priority', 'Tier', 'Property', 'Haus', 'What it is', 'Address', 'Neighborhood', 'Beds', '$/bed (est)', '$ verified now', 'Kitchen', 'Safety', 'Reviews say', 'Walk min', 'Sept 15?', 'Walk-in ready', 'Channel', 'Contact person', 'Phone', 'Email / path', 'Template', 'Status', 'Outreach so far', 'Score', 'The play'];
const priority = priorityRows.map(({ p, t }, i) => [
  i + 1, t[1], p.name, p.houses.join(', ') || '-', p.name_detail, p.address, p.neighborhood, cell(p.beds_est), cell(p.price_per_bed_est),
  p.price_now != null ? `$${p.price_now} on ${p.last_verified?.slice(0, 10)} (${p.verified_via})` : '',
  p.kitchen, p.safety_flag, [p.safety_reviews, p.review_rating].filter(Boolean).join(': '), cell(walkOf(p)), String(p.sept15_ready), p.walk_in_ready, p.deal_channel,
  p.contact_name, p.contact_phone, p.contact_email || p.contact_path, templateNameFor(p), p.status,
  [p.outreach_status, p.contacted_by].filter(Boolean).join(' by '), cell(p.score), p.play,
]);

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
  ['Priority list - every building, ranked, with a Haus column showing which house each one could serve: punkhaus (40-50 people), femhaus (~12 women, kitchen), alumhaus (bookable spillover), safehaus (calm block, kitchen, small). Tier 1 = call this week.'],
  ['Punkhaus / Femhaus / Alumhaus - one table per house, already in calling order, and each one doubles as that house\'s outreach log: record the call with Granola, send Claude the notes, and the row\'s Last outreach, Latest note, and Next check get filled in. Rows without a phone number sit below the divider until someone digs one up.'],
  ['Scoring - how the 0-100 number is built, one line per part, with two worked examples.'],
  ['Templates - outreach emails + call scripts. The dorm-institution one never mentions the residency (AAU rule: person-to-person, top-down, never automated).'],
  ['Airtable export - rows marked confirmed, flat and ready to import once a deal is set in stone.'],
  [''],
  ['SCORING (0-100): distance 35 + price 30 + kitchen 15 + size 20, minus up to 15 for safety (rough blocks and bad reviews), +5 if ready for arrival day. Dead deals score 0; a tourist hotel with no kitchen caps at 40. Full plain-words breakdown on the Scoring tab.'],
  ['ON EVERY CALL: ask for a block of beds from Sept 15, monthly rate per bed, kitchen access, minimum term. Tenant-rights worry? 3-month program, visa-bound residents, everyone vacates at program end. Block pricing beats their vacancy math.'],
  [''],
  ['HONESTY RULES: nothing here has been re-verified unless it shows a verification date. Numbers marked with a date came from the operator\'s own booking page or a reply from them. Bed counts are never estimated.'],
];


const wb = XLSX.utils.book_new();
function add(name: string, rows: any[][], widths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}
add('Start here', start, [160]);
add('Priority list', [PRIORITY_HEADER, ...priority], [7, 20, 30, 24, 22, 30, 14, 6, 9, 20, 10, 11, 26, 8, 8, 11, 11, 28, 22, 28, 16, 11, 18, 7, 38]);
const scoringExplained: any[][] = [
  ['How the score works'],
  ['Every building gets 0 to 100 points so the best calls float to the top. Four things add points, safety takes points off, and three rules can override the math. One line each:'],
  [''],
  ['Part', 'Points', 'In one line'],
  ['Distance to Frontier Tower', 'up to 35', 'A 10 minute walk gets all 35; points fade to 0 by 45 minutes away.'],
  ['Price per bed', 'up to 30', '$1,000 a month or less gets all 30; points fade to 0 by $2,200; no price yet gets 5 so it stays visible.'],
  ['Kitchen', 'up to 15', 'Any real kitchen gets 15; no kitchen gets 0; unknown gets 5.'],
  ['Building size', 'up to 20', '40 to 60 beds is perfect (20); 20 to 39 works as a pair of buildings (12); under 20 gets 4; over 100 gets 12 to 15.'],
  ['Safety', 'up to -15', 'A rough block (Tenderloin, 6th St, Mid-Market) takes off 8, a mixed block takes off 3, and reviews that flag safety take off up to 7 more.'],
  ['Move-in bonus', '+5', 'A building confirmed ready for arrival day gets 5 extra.'],
  ['Dead deal rule', 'score 0', 'Anything taken, sold, or ruled out drops to 0.'],
  ['Hotel rule', 'cap at 40', 'A tourist hotel with no kitchen can never score above 40, however cheap it is.'],
  [''],
  ['Reading the number', '', ''],
  ['80 and up', 'strong fit', 'Close, affordable, has a kitchen, right size, decent block. Call first.'],
  ['60 to 79', 'good', 'One thing is off, usually price, distance, or the block. Worth a call.'],
  ['40 to 59', 'ok', 'Two things are off, or a cap kicked in. Backups.'],
  ['under 40', 'stretch', 'Far, expensive, no kitchen, or dead. Kept for the record.'],
  [''],
  ['Worked example: European Hostel', '', 'Walk 35 + price 30 + kitchen 15 + size 12 = 92. Rough block takes off 8 and bad safety reviews take off 7 (capped at 15 total) = 77. Move-in ready adds 5. Final: 82. Cheap and close, but the reviews are why it is not number 1 anymore.'],
  ['Worked example: AAU dorm, 860 Sutter', '', 'Walk 31 + price 30 + kitchen 15 + size 15 = 91. Clean Nob Hill block, nothing comes off. Not confirmed for arrival day, no bonus. Final: 89.'],
  [''],
  ['Weights live in one place (data/score.ts in the repo). Change one number there and every building rescores the same way. The safety reads come from the neighborhood plus hand-checked reviews (data/safety.json), so a specific building can always be corrected by hand.'],
];
add('Scoring', scoringExplained, [44, 14, 110]);
const tabs = buildTabs(props);
for (const t of tabs.filter((t) => t.title !== 'Airtable export')) add(t.title, [[t.note ?? ''], t.header, ...t.rows], [6, 27, 24, 26, 21, 27, 16, 7, 6, 9, 22, 10, 8, 11, 11, 11, 11, 18, 28, 14, 36, 30]);
add('Templates', [['Template', 'Use for', 'Subject', 'Body'], ...templates], [22, 40, 44, 110]);
const at = tabs.find((t) => t.title === 'Airtable export')!;
add('Airtable export', [[at.note ?? ''], at.header, ...at.rows], [26, 30, 14, 12, 6, 10, 10, 10, 24, 20, 26, 16, 10, 40, 30]);

fs.mkdirSync('data/exports', { recursive: true });
const out = 'data/exports/biopunk-housing-tracker.xlsx';
XLSX.writeFile(wb, out);
const t1 = priorityRows.filter(({ t }) => t[0] === 1).length;
console.log(`${out}: ${wb.SheetNames.length} tabs (${wb.SheetNames.join(', ')}); priority list ${priority.length} rows, Tier 1 = ${t1}; ${skipDupes.size} cross-tab duplicates collapsed`);
