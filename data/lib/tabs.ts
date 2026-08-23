// Builds the extra Google Sheet tabs Elliot works from: one per house, a call-order tab, and the
// Airtable export of confirmed rows. Google Sheets is for drafting; once a deal is confirmed the
// row moves to Airtable, so the export stays flat and typed.
import type { Property, House } from '../schema';

export type Tab = { title: string; header: string[]; rows: string[][]; note?: string };

const SLIM_HEADER = ['Rank','Name','Detail','Address','Neighborhood','Beds est','$/bed est','$ now (verified)','Kitchen','Walk min','Sept 15 ready','Walk-in ready','Deal channel','Score','Status','Outreach','Contact','Phone','Email / path','The play','id'];

// Elliot's channel preference: people we can know (owners), then motivated intermediaries, institutions, operators.
export const CHANNEL_ORDER = ['owner', 'receiver', 'broker', 'institution', 'operator', 'unknown'] as const;

export function templateNameFor(p: Property): string {
  if (p.timeline_tags.includes('femme-house') && (p.beds_est ?? 99) <= 20) return 'femme-house';
  if (p.deal_channel === 'receiver') return 'receiver-or-lender';
  if (p.deal_channel === 'institution') return 'dorm-institution';
  if (p.type === 'co-living' || p.type === 'hostel' || p.audience === 'inventory') return 'co-living-block';
  return 'sro-master-lease';
}

const walkOf = (p: Property) => p.walk_min_from_frontier ?? p.transit_min_to_frontier;
const cell = (v: unknown) => (v == null ? '' : String(v));
function slimRow(p: Property, rank: number): string[] {
  return [String(rank), p.name, p.name_detail, p.address, p.neighborhood, cell(p.beds_est), cell(p.price_per_bed_est),
    p.price_now != null ? `${p.price_now} (${p.last_verified?.slice(0, 10)} via ${p.verified_via})` : '',
    p.kitchen, cell(walkOf(p)), String(p.sept15_ready), p.walk_in_ready, p.deal_channel, cell(p.score), p.status,
    [p.outreach_status, p.contacted_by].filter(Boolean).join(' by '), p.contact_name, p.contact_phone, p.contact_email || p.contact_path, p.play, p.id];
}
const ranked = (rows: Property[]) => [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

function houseTab(props: Property[], house: House, title: string, note: string): Tab {
  const rows = ranked(props.filter((p) => p.houses.includes(house)));
  // baseline rows first so every candidate reads against the current deal
  const ordered = [...rows.filter((p) => p.baseline), ...rows.filter((p) => !p.baseline)];
  return { title, header: SLIM_HEADER, note, rows: ordered.map((p, i) => slimRow(p, i + 1)) };
}

export function buildTabs(props: Property[]): Tab[] {
  const live = props.filter((p) => !['taken', 'sold', 'ruled-out'].includes(p.status));

  const punk = houseTab(props, 'punk-house', 'Punk House',
    'Main cohort, 40-50 people. Buildings with 35+ beds in SF, ranked by score. Fitzgerald baseline rows pinned on top: beat these or we stay put.');
  const femme = houseTab(props, 'femme-house', 'Femme House',
    'Femme / safe house: ~10-12 women, kitchen required, 3-6 months. 2550 Van Ness (Minerva) is the live option; these are the alternatives and backups.');
  const alum = houseTab(props, 'alum-house', 'Alum House',
    'Alum house opens Sept 1 + spillover for alumni sticking around. Operating co-living / hostels / SROs under ~35 beds where one person can just book in. Hive: toured by Elliot, nice kitchen and community, no block available, actively looking for female residents.');

  const callable = ranked(live.filter((p) => !p.baseline && p.contact_phone && p.contact_phone !== '-' && ['SF-priority', 'SF-other'].includes(p.region) && (p.score ?? 0) >= 40));
  const callRows: string[][] = [];
  let rank = 1;
  for (const ch of CHANNEL_ORDER) {
    for (const p of callable.filter((x) => x.deal_channel === ch).slice(0, 12)) {
      callRows.push([String(rank++), ch, p.name, p.contact_name, p.contact_phone, p.contact_email || p.contact_path,
        templateNameFor(p), cell(p.score), cell(p.beds_est), cell(p.price_per_bed_est), cell(walkOf(p)), p.kitchen,
        p.walk_in_ready, p.contact_verify ? 'verify number first' : '', p.play]);
    }
  }
  const calls: Tab = {
    title: 'Call order', note: 'Who to call first, second, third. Grouped by channel in Elliot\'s preference order: owners (pocket deals), receivers, brokers, institutions, operators. Landlord objection script: this is a 3-month program with visa-bound residents; everyone vacates at program end, so there is no tenant-rights exposure. Ask for: block of beds from Sept 15, monthly rate per bed, kitchen access, minimum term.',
    header: ['Call #','Channel','Property','Contact','Phone','Email / path','Template','Score','Beds','$/bed','Walk min','Kitchen','Walk-in ready','Flag','The play'],
    rows: callRows,
  };

  const confirmed = props.filter((p) => p.status === 'confirmed');
  const airtable: Tab = {
    title: 'Airtable export', note: 'Rows with status=confirmed, flat columns, ready to import into the Airtable CRM (Google Sheets is for drafting; Airtable is set in stone). Mark a row confirmed in Pipeline/Inventory and re-run push-to-sheet.',
    header: ['Name','Address','Neighborhood','Type','Beds','$/bed agreed','Monthly total','Kitchen','Contact','Phone','Email','House','Move-in','Notes','id'],
    rows: confirmed.map((p) => [p.name, p.address, p.neighborhood, p.type, cell(p.beds_est), cell(p.price_now ?? p.price_per_bed_est), cell(p.monthly_total_45_est), p.kitchen, p.contact_name, p.contact_phone, p.contact_email, p.houses.join(', '), String(p.sept15_ready), p.notes.slice(0, 300), p.id]),
  };
  return [punk, femme, alum, calls, airtable];
}
