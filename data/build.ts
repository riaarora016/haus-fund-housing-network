// build.ts - sources/biopunk-housing-tracker.xlsx  →  data/properties.json (canonical schema, sorted by id)
// Deterministic and offline: reads the workbook, data/booking-sites.json, data/geocache.json (written by
// geocode.ts) and refresh/state/verifications.json (written by the refresh jobs). Never hand-edit the JSON.
//   npx tsx data/build.ts            # build + report
//   npx tsx data/build.ts --quiet    # build only
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { SHEET_COLUMNS, type Property, type Kitchen, type PropertyType, type Status, type TimelineTag, type Region, PRIORITY_NEIGHBORHOODS } from './schema';
import { scoreProperty } from './score';
import { loadCache, geocodeQuery, NEIGHBORHOOD_CENTROIDS, distToFrontier, transitHeuristicMin } from './geocode';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'sources', 'biopunk-housing-tracker.xlsx');
const OUT = path.join(ROOT, 'data', 'properties.json');
const QUIET = process.argv.includes('--quiet');
const log: string[] = [];   // join-log.md lines
const L = (s: string) => log.push(s);

// ---------- helpers ----------
const s = (v: unknown) => (v == null ? '' : String(v)).trim();
const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/[,$]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const slug = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');
const yn = (v: unknown): true | false | 'unknown' => { const t = s(v).toLowerCase(); return t === 'yes' || t === 'true' ? true : t === 'no' || t === 'false' ? false : 'unknown'; };
const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12' };
function parseChecked(raw: string): string | null {
  const m = raw.match(/([A-Za-z]{3,4})\.?\s+(\d{1,2})?,?\s*(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
  if (!mm) return null;
  return `${m[3]}-${mm}-${(m[2] ?? '1').padStart(2, '0')}`;
}
function sheetRows(wb: XLSX.WorkBook, tab: string): Record<string, any>[] {
  const ws = wb.Sheets[tab]; if (!ws) throw new Error(`missing tab ${tab}`);
  return (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]).filter((r) => Object.values(r).some((v) => s(v) !== ''));
}

// ---------- normalisation tables ----------
const NEIGH_MAP: Record<string, string> = {
  'tenderloin': 'Civic Center', 'mid-market': 'Civic Center', 'lower nob hill': 'Nob Hill', 'nob hill/tl': 'Nob Hill',
  'nob hill/union sq': 'Nob Hill', 'union sq / soma': 'Union Square', 'union square area (verify)': 'Union Square',
  'union square (~161 powell st)': 'Union Square', 'central sf (nr union sq)': 'Union Square', '749 taylor st (union sq)': 'Union Square',
  'isadora duncan ln (taylor/post)': 'Union Square', '312 mason st': 'Union Square', '411 o\'farrell st': 'Civic Center',
  '706 polk st': 'Civic Center', '221 7th st': 'SoMa', '680 sacramento st (chinatown/fidi)': 'FiDi', 'cathedral hill': 'Nob Hill',
  '620 post st': 'Union Square', 'north beach (verify)': 'North Beach', '2436 mission st': 'Mission', 'sf (verify)': 'SF (verify)',
  'sf (verify block)': 'SF (verify)', 'soma / tl / mission rooms': 'SoMa', 'chinatown': 'FiDi', 'fort mason': 'Marina',
  'design district / potrero': 'Design District / Potrero',
};
function normNeighborhood(raw: string, region: Region): string {
  const k = raw.toLowerCase().trim();
  if (NEIGH_MAP[k]) return NEIGH_MAP[k];
  for (const p of PRIORITY_NEIGHBORHOODS) if (k === p.toLowerCase()) return p;
  return raw;
}
const TYPE_MAP: Record<string, PropertyType> = { 'sro-hotel': 'sro-hotel', 'tourist-hotel': 'tourist-hotel', dorm: 'dorm', 'co-living': 'co-living', 'apartment-block': 'apartment-block', sfh: 'sfh', campus: 'campus', hostel: 'hostel', other: 'other' };
const KITCHEN = (v: string): Kitchen => (['private', 'communal', 'none', 'unknown'].includes(v) ? (v as Kitchen) : 'unknown');
const STATUS = (v: string): Status => (['active','dark','receivership','on-market','taken','sold','stale-verify','ruled-out','confirmed'].includes(v) ? (v as Status) : 'active');
const TAGS = (v: string): TimelineTag[] => v.split(/[;,]/).map((t) => t.trim()).filter((t): t is TimelineTag => ['bridge-sept','q1-2027','femme-house','alum-house','expansion'].includes(t));
const REGION = (v: string): Region => (['SF-priority','SF-other','East Bay','Peninsula','North Bay','Remote'].includes(v) ? (v as Region) : 'SF-other');

function blank(): Property {
  return {
    id: '', name: '', name_detail: '', address: '', neighborhood: '', neighborhood_raw: '', region: 'SF-other', east_bay: false, priority_neighborhood: false,
    lat: null, lng: null, geo_precision: 'none', dist_to_frontier_mi: null, transit_min_to_frontier: null, walk_min_from_frontier: null, walk_source: '',
    type: 'other', type_raw: '', rooms: null, capacity_raw: '', beds_est: null, occupancy_assumption: null,
    price_per_room_low: null, price_per_room_high: null, price_per_bed_est: null, price_raw: '', monthly_total_45_est: null,
    kitchen: 'unknown', kitchen_raw: '', safety_flag: 'unknown', safety_reviews: '', review_rating: '', safety_note: '', common_space: '', furnished: 'unknown', bath: 'unknown',
    status: 'active', deal_channel: 'unknown', walk_in_ready: 'unknown', houses: [], timeline_tags: [], aau: false, baseline: false, sept15_ready: 'unknown', cluster_id: null, related_id: null, tier: '',
    score: null, score_breakdown: null, score_sheet: null,
    contact_name: '', contact_org: '', contact_phone: '', contact_email: '', contact_verify: false, contact_path: '', contact_section: '',
    source_links: [], source: 'sheet-pipeline', play: '', notes: '', outreach_status: 'not-contacted', contacted_by: '', notion_round: null, last_checked: null, last_checked_raw: '',
    audience: 'pipeline', beds_available: null, price_now: null, price_private_now: null, min_stay_nights: null, bookable_online: false, booking_url: '', listing_url: '', booking_adapter: '', operator: '',
    last_verified: null, verified_via: null, confidence: null, next_check: null, do_not_email: false, email_thread_id: '', last_emailed: null,
  };
}

// ---------- contacts ----------
type Contact = { section: string; property: string; contact: string; phone: string; email: string; verify: boolean; key: string[] };
const STOP = new Set(['the','a','an','of','at','sf','san','francisco','st','street','ave','hotel','residences','residence','club','apartments','apts','rooms','units','room','coliving','co-living','verify','by','phone','inc','llc','and','for']);
const tokens = (t: string) => t.toLowerCase().replace(/\*\*/g, '').replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 1);
function loadContacts(wb: XLSX.WorkBook): Contact[] {
  return sheetRows(wb, 'Contacts').map((r) => ({
    section: s(r['Section']), property: s(r['Property']), contact: s(r['Contact']), phone: s(r['Phone']), email: s(r['Email / path']),
    verify: /⚠/.test(s(r['Verify first?']) + s(r['Phone']) + s(r['Email / path'])),
    key: tokens(s(r['Property']).split(/[,(]/)[0]),
  }));
}
// Generic words that must never be the sole basis of a join (neighbourhoods, building-type words).
const GENERIC = new Set(['house','hill','nob','union','square','hostel','downtown','oakland','berkeley','polk','market','mission','soma','group','blocks','cluster','tower','place','suites','residences','hi','san','north','beach','center','civic','hotel','inn','hotels','lofts','point','park','bay','west','east','plaza']);
const distinctive = (ws: string[]) => ws.filter((w) => !GENERIC.has(w));
/**
 * Match a row to a Contacts-tab entry. Accepts only when:
 *  (a) the street number in the row's address appears in the contact's property text, or
 *  (b) ≥2 distinctive tokens overlap, or
 *  (c) exactly 1 distinctive token overlaps AND it is the contact's only distinctive token (e.g. "Urbanests", "20mish").
 * Score ≥1 = confident; anything else is logged and NOT applied.
 */
function bestContact(name: string, address: string, contacts: Contact[]): { c: Contact; score: number } | null {
  const nameTk = new Set(distinctive(tokens(name)));
  const am = address.match(/\b(\d{2,5})(?:[--]\d+)?\s+([A-Za-z0-9']+)/);
  const addrNum = am?.[1], addrStreet = am?.[2]?.toLowerCase();
  let best: { c: Contact; score: number } | null = null;
  for (const c of contacts) {
    const ck = distinctive(c.key); if (!ck.length && !addrNum) continue;
    const inter = ck.filter((w) => nameTk.has(w));
    // street number AND street name must both appear (620 Post ≠ 620 O'Farrell)
    const numHit = !!addrNum && !!addrStreet && new RegExp(`\\b${addrNum}\\b`).test(c.property) && c.property.toLowerCase().includes(addrStreet);
    let score = 0;
    if (numHit && inter.length >= 1) score = 2;
    else if (numHit) score = 1.2;
    else if (inter.length >= 2) score = 1 + inter.length * 0.1;
    else if (inter.length === 1 && ck.length === 1) score = 1;
    else if (inter.length === 1) score = 0.5;
    if (score > (best?.score ?? 0)) best = { c, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

// ---------- main ----------
function main() {
  const wb = XLSX.read(fs.readFileSync(SRC), { type: "buffer" });
  const contacts = loadContacts(wb);
  const booking = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'booking-sites.json'), 'utf8')) as Record<string, any>;
  const verifPath = path.join(ROOT, 'refresh', 'state', 'verifications.json');
  const verif = fs.existsSync(verifPath) ? (JSON.parse(fs.readFileSync(verifPath, 'utf8')) as Record<string, any>) : {};
  const geo = loadCache();
  const ids = new Set<string>();
  const uid = (prefix: string, name: string) => { let id = `${prefix}-${slug(name)}`; let n = 2; while (ids.has(id)) id = `${prefix}-${slug(name)}-${n++}`; ids.add(id); return id; };
  const props: Property[] = [];
  L('# Join log - generated by data/build.ts (do not hand-edit; fix the rules in build.ts)\n');
  L(`Source: sources/biopunk-housing-tracker.xlsx · built deterministic (no dates)\n`);

  // ----- Pipeline tab -----
  L('## Pipeline rows (contacts are inline in the workbook; Contacts tab only adds the ⚠ verify flag)\n');
  for (const r of sheetRows(wb, 'Pipeline')) {
    const p = blank();
    p.name = s(r['Name']); p.address = s(r['Address']); p.id = uid('pl', p.name);
    p.region = REGION(s(r['Region'])); p.east_bay = p.region === 'East Bay';
    p.neighborhood_raw = s(r['Neighborhood']); p.neighborhood = normNeighborhood(p.neighborhood_raw, p.region);
    p.priority_neighborhood = PRIORITY_NEIGHBORHOODS.includes(p.neighborhood);
    p.walk_min_from_frontier = num(r['Walk min to Frontier (est)']); p.walk_source = s(r['Walk source']) || 'est. by neighborhood';
    p.type = TYPE_MAP[s(r['Type'])] ?? 'other'; p.type_raw = s(r['Type']);
    p.rooms = num(r['Rooms / units']); p.capacity_raw = s(r['Rooms / units']);
    const occ = num(r['Occ. per room']); p.occupancy_assumption = occ === 1 || occ === 2 || occ === 3 ? occ : null;
    p.beds_est = num(r['Beds est']) ?? (p.rooms != null && p.occupancy_assumption ? p.rooms * p.occupancy_assumption : null);
    p.price_per_room_low = num(r['$/room low']); p.price_per_room_high = num(r['$/room high']); p.price_per_bed_est = num(r['$/bed est']);
    p.price_raw = s(r['Price / ask (as sourced)']); p.monthly_total_45_est = num(r['Monthly for cohort ($)']);
    p.kitchen = KITCHEN(s(r['Kitchen'])); p.kitchen_raw = s(r['Kitchen']);
    p.status = STATUS(s(r['Status'])); p.tier = s(r['Source tier']); p.timeline_tags = TAGS(s(r['Timeline tags']));
    p.sept15_ready = yn(r['Sept-15 ready?']); p.aau = yn(r['AAU?']) === true || /academy of art|\bAAU\b/i.test(p.name); p.baseline = yn(r['Baseline?']) === true;
    p.play = s(r['The play']); p.contact_name = s(r['Contact']); p.contact_phone = s(r['Phone']); p.contact_email = s(r['Email / path']);
    if (!/@/.test(p.contact_email)) { p.contact_path = p.contact_email; p.contact_email = ''; }
    p.contact_section = s(r['Contact section']);
    p.contact_verify = /⚠/.test(p.contact_phone + p.contact_email + p.contact_path);
    p.source_links = s(r['Source links']).split(/\n/).map((x) => x.trim()).filter(Boolean);
    p.notes = s(r['Notes']); p.score_sheet = num(r['SCORE']);
    p.outreach_status = (s(r['Outreach status']) as any) || 'not-contacted';
    p.last_checked_raw = s(r['Last checked']); p.last_checked = parseChecked(p.last_checked_raw);
    p.source = 'sheet-pipeline'; p.audience = 'pipeline';
    if (p.aau) p.cluster_id = 'aau-cluster';
    if (/fitzgerald/i.test(p.name)) p.cluster_id = 'fitzgerald-620-post';
    if (p.type === 'tourist-hotel' || p.type === 'sro-hotel' || p.type === 'hostel') p.furnished = true;
    if (p.type === 'co-living' || p.type === 'dorm') p.furnished = true;
    if (p.type === 'sro-hotel' || p.type === 'hostel' || p.type === 'dorm') p.bath = 'shared';
    if (p.type === 'tourist-hotel' || p.type === 'apartment-block') p.bath = 'private';
    // ⚠ flag from the Contacts tab
    const bc = bestContact(p.name, p.address, contacts);
    if (bc && bc.score >= 1) { if (bc.c.verify) { p.contact_verify = true; L(`- ⚠ pipeline **${p.name}** ⇐ contacts "${bc.c.property}" (score ${bc.score.toFixed(2)}) → contact_verify=true`); } }
    else if (bc) L(`- ✗ pipeline **${p.name}** ~ "${bc.c.property}" (score ${bc.score.toFixed(2)}) - rejected, not applied`);
    props.push(p);
  }

  // ----- Inventory tab -----
  L('\n## Inventory rows ⇐ Contacts tab joins (fuzzy; review these)\n');
  for (const r of sheetRows(wb, 'Inventory')) {
    const p = blank();
    p.name = s(r['Name']); p.address = s(r['Address / area']); p.id = uid('inv', p.name);
    p.region = REGION(s(r['Region'])); p.east_bay = p.region === 'East Bay';
    p.neighborhood_raw = s(r['Neighborhood']); p.neighborhood = normNeighborhood(p.neighborhood_raw, p.region);
    p.priority_neighborhood = PRIORITY_NEIGHBORHOODS.includes(p.neighborhood);
    p.walk_min_from_frontier = num(r['Walk min to Frontier']); p.walk_source = s(r['Walk source']) || 'Notion tracker';
    p.type = TYPE_MAP[s(r['Type (norm.)'])] ?? 'other'; p.type_raw = s(r['Type (as tracked)']);
    p.capacity_raw = s(r['Capacity (as tracked)']); p.rooms = num(r['Beds est']) ?? (/(\d+)\s*rooms/i.test(p.capacity_raw) ? num(p.capacity_raw) : null);
    p.beds_est = num(r['Beds est']);
    p.occupancy_assumption = p.beds_est != null ? 1 : null;
    p.price_raw = s(r['Price as listed']); p.price_per_bed_est = num(r['$/bed est (sort)']); p.monthly_total_45_est = num(r['Monthly for cohort ($)']);
    p.kitchen = KITCHEN(s(r['Kitchen (norm.)'])); p.kitchen_raw = s(r['Kitchen (as tracked)']);
    p.status = STATUS(s(r['Status'])); p.sept15_ready = yn(r['Sept-15 ready?']);
    const nr = num(r['Notion round']); p.notion_round = nr === 1 ? 1 : nr === 2 ? 2 : null;
    p.outreach_status = (s(r['Outreach status']) as any) || (p.notion_round === 1 ? 'contacted' : 'not-contacted');
    p.contacted_by = s(r['Contacted by']) || (p.notion_round === 1 ? 'Alex' : '');
    p.score_sheet = num(r['SCORE']); p.last_checked_raw = s(r['Last checked']); p.last_checked = parseChecked(p.last_checked_raw);
    p.source = 'sheet-inventory'; p.audience = 'inventory'; p.tier = 'Inventory (Notion)';
    p.timeline_tags = ['bridge-sept'];                          // bookable today ⇒ bridge candidates by definition
    if (p.type === 'hostel') { p.sept15_ready = p.sept15_ready === 'unknown' ? true : p.sept15_ready; p.furnished = true; p.bath = 'shared'; }
    if (['co-living','dorm','sro-hotel','tourist-hotel'].includes(p.type)) p.furnished = true;
    if (['co-living','dorm','sro-hotel'].includes(p.type)) p.bath = 'shared';
    if (p.type === 'tourist-hotel' || p.type === 'apartment-block') p.bath = 'private';
    if (/fitzgerald/i.test(p.name)) { p.baseline = true; p.cluster_id = 'fitzgerald-620-post'; p.sept15_ready = false; p.timeline_tags = []; }
    if (/kitchen|communal/i.test(p.kitchen_raw) && p.kitchen === 'communal') p.common_space = p.kitchen_raw;
    if (p.beds_est != null && p.beds_est >= 60 && p.type === 'apartment-block') p.timeline_tags.push('expansion');
    // Notion round-1 rows were contacted by Alex in Aug 2026 - treat as a manual, low-confidence verification dated to the source month.
    if (p.notion_round === 1 && p.last_checked) { p.last_verified = `${p.last_checked}T00:00:00Z`; p.verified_via = 'manual'; p.confidence = 'low'; }
    // booking-site seed
    const b = booking[p.name];
    if (b) {
      p.operator = b.operator ?? ''; p.booking_url = b.booking_url ?? ''; p.listing_url = b.listing_url ?? ''; p.booking_adapter = b.adapter ?? '';
      p.bookable_online = !!b.bookable_online; if (b.contact_email) p.contact_email = b.contact_email; if (b.contact_phone) p.contact_phone = b.contact_phone;
      if (b.contact_path) p.contact_path = b.contact_path; if (b.notes) p.notes = [p.notes, b.notes].filter(Boolean).join(' | ');
      if (b.status_override) p.status = STATUS(b.status_override);
      if (/⚠/.test(p.contact_phone)) p.contact_verify = true;
    }
    if (p.booking_url) p.source_links.push(p.booking_url); if (p.listing_url) p.source_links.push(p.listing_url);
    // contacts join
    const bc = bestContact(p.name, p.address, contacts);
    if (bc && bc.score < 1) L(`- ✗ inventory **${p.name}** (${p.address}) ~ "${bc.c.property}" (score ${bc.score.toFixed(2)}) - rejected, not applied`);
    if (bc && bc.score >= 1) {
      if (!p.contact_name) p.contact_name = bc.c.contact; if (!p.contact_phone) p.contact_phone = bc.c.phone;
      if (!p.contact_email && /@/.test(bc.c.email)) p.contact_email = bc.c.email; else if (!p.contact_path && !/@/.test(bc.c.email)) p.contact_path = bc.c.email;
      if (!p.contact_section) p.contact_section = bc.c.section; if (bc.c.verify) p.contact_verify = true;
      L(`- ${bc.score >= 1 ? '✓' : '?'} inventory **${p.name}** (${p.address}) ⇐ "${bc.c.property}" → ${bc.c.contact || '-'} ${bc.c.phone || ''} (score ${bc.score.toFixed(2)})`);
    }
    props.push(p);
  }

  // ----- related_id: same building on both tabs (do NOT merge - different audiences/tabs) -----
  L('\n## Cross-tab matches (pipeline ↔ inventory, linked via related_id - same building, two audiences)\n');
  const addrKey = (a: string) => { const m = a.match(/(\d{2,5})\s+([A-Za-z0-9']+)/); return m ? `${m[1]} ${m[2].toLowerCase()}` : null; };
  const hints: [RegExp, RegExp][] = [[/20mish/i, /20mish|20 mission/i], [/urbanests/i, /urbanests 1080 folsom/i], [/found study/i, /found study 16 turk/i], [/^hive coliving/i, /^hive coliving \(was/i], [/foundry/i, /^foundry coliving$/i], [/kenmore/i, /kenmore/i], [/monroe/i, /monroe/i]];
  const pl = props.filter((p) => p.audience === 'pipeline'), inv = props.filter((p) => p.audience === 'inventory');
  for (const a of pl) {
    let m = inv.find((b) => addrKey(a.address) && addrKey(a.address) === addrKey(b.address) && !b.related_id && !(/fitzgerald/i.test(a.name) !== /fitzgerald/i.test(b.name)));
    if (/fitzgerald/i.test(a.name)) m = inv.find((b) => /fitzgerald/i.test(b.name) && (a.type === 'tourist-hotel') === /nightly|hotel side/i.test(b.name));
    if (!m) for (const [ra, rb] of hints) if (ra.test(a.name)) m = inv.find((b) => rb.test(b.name));
    if (m) { a.related_id = m.id; m.related_id = a.id; if (!a.cluster_id && !m.cluster_id) { a.cluster_id = m.cluster_id = `bldg-${slug(m.address.split(',')[0]) || slug(m.name)}`; } L(`- **${a.name}** ↔ **${m.name}** (${m.address})`); }
  }
  // explicit NON-merges the team flagged
  L('\nNot merged on purpose: Mosser SRO 1000 Market (pipeline) vs The Mosser Hotel 54 4th St (inventory) - different buildings.');


  // ----- Elliot-derived fields: clean name, deal channel, walk-in ready, house assignment -----
  const BROKER_RE = /broker|CBRE|colliers|marcus & millichap|compass|kw commercial|\bJLL\b|eastdil|berkadia|lee & associates|ehmer|legacy real estate|coldwell|\bNAI\b|lapham|kinetic|3D strategies|zielinski/i;
  const OWNER_RE = /owner|property office|mosser companies|mag management|faizan|patel|gaehwiler|behring|prado group|tidewater/i;
  const RECEIVER_RE = /receiver|servicer|\bREO\b|lender|special servicing|cwcapital|hotelave|douglas wilson|bh properties|default|foreclos/i;
  const INSTITUTION_RE = /university|college|academy|\bAAU\b|\bYMCA\b|\bYWCA\b|salvation army|archdiocese|catholic|holy names|\bCCA\b|\bNDNU\b|minerva/i;
  const NO_WALKIN_RE = /retrofit|entitle|permitting|convert(?:ed|ing)? (?:to|into)|conversion|renovation needed|build-?out|shell condition|vacant hospital|care campus|care facility|barracks|wind-down|mothball/i;
  for (const p of props) {
    // The workbook titles carry a tagline after a long dash; split it so the sheet reads like a name, not a headline.
    const parts = p.name.split(/\s+\u2014\s+/);
    if (parts.length > 1) {
      if (/^BASELINE$/i.test(parts[0].trim())) { p.name = parts.slice(1).join('; ').trim(); p.name_detail = 'current deal (baseline)'; }
      else { p.name = parts[0].trim(); p.name_detail = parts.slice(1).join('; ').trim(); }
    }
    const hay = [p.contact_name, p.contact_org, p.contact_section, p.play, p.notes, p.tier, p.name_detail, p.name].join(' ');
    // channel order matters: institution beats broker (AAU sells through M&M but the play is the institution)
    p.deal_channel = p.aau || INSTITUTION_RE.test([p.name, p.contact_name, p.contact_org, p.contact_section, p.operator].join(' ')) ? 'institution'
      : p.status === 'receivership' || RECEIVER_RE.test(hay) ? 'receiver'
      : BROKER_RE.test(hay) ? 'broker'
      : OWNER_RE.test(hay) ? 'owner'
      : p.audience === 'inventory' || p.operator || ['co-living', 'hostel'].includes(p.type) ? 'operator'
      : 'unknown';
    p.walk_in_ready = NO_WALKIN_RE.test(hay) || p.type === 'campus' ? 'no'
      : p.audience === 'inventory' || (p.status === 'active' && ['co-living', 'hostel', 'sro-hotel', 'dorm', 'apartment-block', 'tourist-hotel'].includes(p.type)) ? 'yes'
      : 'unknown';
    const inSF = ['SF-priority', 'SF-other'].includes(p.region);
    const dead = ['taken', 'sold', 'ruled-out'].includes(p.status);
    const kitchenYes = p.kitchen === 'communal' || p.kitchen === 'private';
    p.houses = [];
    if (!dead && inSF && (p.beds_est == null ? p.rooms != null && p.rooms >= 35 : p.beds_est >= 35)) p.houses.push('punk-house');
    if (!dead && inSF && (p.timeline_tags.includes('femme-house') || (kitchenYes && p.beds_est != null && p.beds_est >= 8 && p.beds_est <= 20))) p.houses.push('femme-house');
    if (!dead && inSF && p.audience === 'inventory' && ['co-living', 'hostel', 'sro-hotel'].includes(p.type) && p.status === 'active' && (p.beds_est == null || p.beds_est < 35)) p.houses.push('alum-house');
    if (p.baseline) p.houses = ['punk-house'];
  }

  // ----- geocode (from cache only) + transit -----
  for (const p of props) {
    const q = geocodeQuery(p.address, p.region);
    const hit = q ? geo[q] : null;
    if (hit) { p.lat = hit.lat; p.lng = hit.lng; p.geo_precision = 'address'; }
    else {
      const c = NEIGHBORHOOD_CENTROIDS[p.neighborhood_raw] ?? NEIGHBORHOOD_CENTROIDS[p.neighborhood];
      if (c) { p.lat = c[0]; p.lng = c[1]; p.geo_precision = 'neighborhood'; }
    }
    if (p.lat != null && p.lng != null) {
      p.dist_to_frontier_mi = distToFrontier(p.lat, p.lng);
      // heuristic transit only for real (address-level) geocodes - a neighbourhood centroid is not a commute
      if (p.walk_min_from_frontier == null && p.geo_precision === 'address') p.transit_min_to_frontier = transitHeuristicMin(p.dist_to_frontier_mi, p.east_bay || !['SF-priority','SF-other'].includes(p.region));
    }
  }

  // ----- safety: neighborhood default, then per-building hand checks from data/safety.json -----
  const safetyCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'safety.json'), 'utf8')) as { overrides: Record<string, any> };
  for (const p of props) {
    const inSF = ['SF-priority', 'SF-other'].includes(p.region);
    if (inSF) {
      // Civic Center bucket includes the Tenderloin and Mid-Market per the neighborhood normalisation
      p.safety_flag = p.neighborhood === 'Civic Center' ? 'rough-block'
        : ['SoMa', 'Mission', 'Union Square', 'Design District / Potrero'].includes(p.neighborhood) ? 'mixed'
        : 'ok';
    } else p.safety_flag = 'unknown';
    const o = safetyCfg.overrides[p.id];
    if (o) {
      if (o.flag) p.safety_flag = o.flag;
      if (o.reviews) p.safety_reviews = o.reviews;
      if (o.rating) p.review_rating = o.rating;
      if (o.note) p.safety_note = o.note;
      if (o.status) p.status = STATUS(o.status);
    }
  }

  // ----- verification overrides from the refresh jobs -----
  for (const p of props) {
    const v = verif[p.id]; if (!v) continue;
    for (const k of ['beds_available','price_now','price_private_now','min_stay_nights','bookable_online','last_verified','verified_via','confidence','next_check','do_not_email','email_thread_id','last_emailed'] as const) {
      if (v[k] !== undefined) (p as any)[k] = v[k];
    }
    if (v.status) p.status = STATUS(v.status);
    if (v.notes) p.notes = [p.notes, v.notes].filter(Boolean).join(' | ');
  }

  // ----- score -----
  for (const p of props) { const { score, breakdown } = scoreProperty(p); p.score = score; p.score_breakdown = breakdown; }

  props.sort((a, b) => a.id.localeCompare(b.id));
  // House rule: no long typographic dashes in anything we publish. Replace them in every string value on the way out.
  const deDash = (t: string) => t.replace(/\s*\u2014\s*/g, ' - ').replace(/\u2013/g, '-');
  const ordered = props.map((p) => Object.fromEntries(SHEET_COLUMNS.map((c) => { const v = (p as any)[c]; return [c, typeof v === 'string' ? deDash(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? deDash(x) : x)) : v]; })));
  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', 'join-log.md'), deDash(log.join('\n')) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', 'contacts.json'), deDash(JSON.stringify(contacts.map(({ key, ...c }) => c), null, 2)) + '\n');

  // ----- templates -----
  const tdir = path.join(ROOT, 'templates', 'outreach'); fs.mkdirSync(tdir, { recursive: true });
  for (const r of sheetRows(wb, 'Templates')) {
    const name = s(r['Template']); if (!name) continue;
    const file = name === 'original-team-template' ? '_original-team-template.md' : `${name}.md`;
    const clean = (t: string) => t.replace(/\s*\u2014\s*/g, ' - ').replace(/\u2013/g, '-');
    fs.writeFileSync(path.join(tdir, file), clean(`---\ntemplate: ${name}\nuse_for: ${JSON.stringify(s(r['Use for']))}\nsubject: ${JSON.stringify(s(r['Subject']))}\n---\n\n${s(r['Body'])}\n`));
  }

  if (QUIET) return;
  // ----- report -----
  const count = (f: (p: Property) => string) => { const m = new Map<string, number>(); for (const p of props) m.set(f(p), (m.get(f(p)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '); };
  console.log(`\n${props.length} rows → data/properties.json`);
  console.log('by audience:     ', count((p) => p.audience));
  console.log('by region:       ', count((p) => p.region));
  console.log('by neighborhood: ', count((p) => p.neighborhood));
  console.log('by type:         ', count((p) => p.type));
  console.log('by status:       ', count((p) => p.status));
  console.log('by geo precision:', count((p) => p.geo_precision));
  console.log('sept15_ready:    ', count((p) => String(p.sept15_ready)));
  console.log('\nmissing price:   ', props.filter((p) => p.price_per_bed_est == null).map((p) => p.name).join('; ') || 'none');
  console.log('missing contact: ', props.filter((p) => !p.contact_name && !p.contact_phone && !p.contact_email && !p.contact_path).map((p) => p.name).join('; ') || 'none');
  const diffs = props.filter((p) => p.score_sheet != null && Math.abs((p.score ?? 0) - p.score_sheet) >= 0.5).sort((a, b) => Math.abs((b.score ?? 0) - (b.score_sheet ?? 0)) - Math.abs((a.score ?? 0) - (a.score_sheet ?? 0)));
  console.log(`\nscore vs workbook SCORE: ${props.length - diffs.length} match, ${diffs.length} differ by ≥0.5:`);
  for (const p of diffs.slice(0, 25)) console.log(`  ${p.score_sheet} → ${p.score}  ${p.name.slice(0, 50)}  [${p.score_breakdown?.caps_applied.join('; ') || p.score_breakdown?.method_notes.filter((n) => /unknown|no walk|region/.test(n)).join('; ')}]`);
  console.log('\nTop 30 by score:');
  for (const p of [...props].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30))
    console.log(`  ${String(p.score).padStart(6)}  ${p.name.slice(0, 42).padEnd(42)} ${p.neighborhood.padEnd(14)} ${p.type.padEnd(15)} beds=${String(p.beds_est ?? '?').padStart(4)} $${String(p.price_per_bed_est ?? '?').padStart(5)} ${p.kitchen.padEnd(8)} walk=${String(p.walk_min_from_frontier ?? p.transit_min_to_frontier ?? '?').padStart(3)} s15=${String(p.sept15_ready).padEnd(7)} ${p.audience}`);
}
main();
