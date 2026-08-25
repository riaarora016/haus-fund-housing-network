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
  ['Punk House / Femme House / Alum House - one call sheet per house, already in calling order. Phone, contact and which template to use are on every row; rows without a phone number sit below the divider until someone digs one up.'],
  ['Scoring explained - how the 0-100 number is built, in plain words, with two worked examples.'],
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
const scoringExplained: any[][] = [
  ['How the score works'],
  ['Every building gets 0 to 100 points. The number is only a sorting tool: it puts the places most worth a call at the top. It is built from the four things the team said matter, in this order: how close it is to Frontier Tower, what a bed costs, whether people can cook, and whether the building is the right size.'],
  [''],
  ['THE FOUR PARTS'],
  ['1. Distance to Frontier Tower', 'up to 35 points', 'A 10 minute walk or less gets all 35. Points fall steadily to 0 at 45 minutes. East Bay and anything outside SF gets 0 here, which is why those sink to the bottom without being deleted.'],
  ['2. Price per bed', 'up to 30 points', 'At or under $1,000 a month per bed gets all 30. Points fall steadily to 0 at $2,200. If we have no price yet it gets 5 points, not 0, so unknowns stay visible instead of vanishing.'],
  ['3. Kitchen', 'up to 15 points', 'A communal or private kitchen gets all 15. No kitchen gets 0. Unknown gets 5. This is heavy on purpose: three months without a kitchen is what nearly broke people last time.'],
  ['4. Building size', 'up to 20 points', '40 to 60 beds is the sweet spot and gets all 20 (one building fits the whole cohort). 20 to 39 beds gets 12 (works as a pair of buildings). Over 100 gets 12 to 15 (more than we need, but workable). Under 20 gets 4. Unknown gets 4.'],
  [''],
  ['AFTER ADDING THOSE UP, TWO RULES CAN OVERRIDE'],
  ['Dead deals score 0', '', 'Anything taken, sold or ruled out drops to 0 no matter how good it looked.'],
  ['Tourist hotel with no kitchen caps at 40', '', 'Even if it is cheap and close, a hotel where nobody can cook can never rank above 40. That is the failure mode of the current setup and the score is built to never recommend it again.'],
  [''],
  ['ONE BONUS'],
  ['Ready for move-in gets +5', '', 'A building that can take people on arrival day beats one that makes everyone wait, so confirmed early availability adds 5 points (capped at 100).'],
  [''],
  ['READING THE NUMBER'],
  ['80 and up', 'strong fit', 'close, affordable, has a kitchen, right size. Call these first.'],
  ['60 to 79', 'good', 'one thing is off, usually price or distance. Worth a call.'],
  ['40 to 59', 'ok', 'two things are off, or a cap kicked in. Backups.'],
  ['under 40', 'stretch', 'far, expensive, no kitchen, or dead. Kept for the record.'],
  [''],
  ['WORKED EXAMPLE: European Hostel'],
  ['10 min walk = 35 · $545/bed = 30 · communal kitchen = 15 · 25 beds = 12 · move-in ready = +5. Total 97. That is why it sits at the top.'],
  [''],
  ['WORKED EXAMPLE: a dark tourist hotel in Union Square'],
  ['8 min walk = 35 · $1,750/bed = 11 · no kitchen = 0 · 131 beds = 15. Sum is 61, but the no-kitchen hotel cap pulls it down to 40. Good building, wrong setup for us.'],
  [''],
  ['Change the weights in one place (data/score.ts in the repo, or the Weights tab in the source workbook) and every score recalculates the same way for every building. No hand-tuning per row.'],
];
add('Scoring explained', scoringExplained, [44, 14, 110]);
const tabs = buildTabs(props);
for (const t of tabs.filter((t) => t.title !== 'Airtable export')) add(t.title, [[t.note ?? ''], t.header, ...t.rows], [6, 27, 24, 26, 21, 27, 16, 7, 6, 9, 22, 10, 8, 11, 11, 11, 11, 18, 28, 14, 36, 30]);
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
