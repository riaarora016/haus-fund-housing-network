// Builds the Google Sheet view tabs: one call-ordered tab per house plus the Airtable export.
// Each house tab IS the call sheet for that house: rows sorted by priority, contact and phone
// up front, and the template to use on the row. No separate call-order tab.
import type { Property, House } from '../schema';

export type Tab = { title: string; header: string[]; rows: string[][]; note?: string };

export const CHANNEL_ORDER = ['owner', 'receiver', 'broker', 'institution', 'operator', 'unknown'] as const;

export function templateNameFor(p: Property): string {
  if (p.timeline_tags.includes('femme-house') && (p.beds_est ?? 99) <= 20) return 'femme-house';
  if (p.deal_channel === 'receiver') return 'receiver-or-lender';
  if (p.deal_channel === 'institution') return 'dorm-institution';
  if (p.type === 'co-living' || p.type === 'hostel' || p.audience === 'inventory') return 'co-living-block';
  return 'sro-master-lease';
}

const HOUSE_HEADER = ['Call #','Property','Contact person','Phone','Email / path','Template to use','Score','Safety','Reviews say','Beds','$/bed est','$ verified now','Kitchen','Walk min','Move-in ready','Status','Last outreach','Latest note','Next check','Address','Neighborhood','id'];

const walkOf = (p: Property) => p.walk_min_from_frontier ?? p.transit_min_to_frontier;
const cell = (v: unknown) => (v == null ? '' : String(v));
const hasPhone = (p: Property) => !!p.contact_phone && p.contact_phone.trim() !== '' && p.contact_phone.trim() !== '-';

function houseRow(p: Property, callNo: string): string[] {
  const lastDate = (p.last_emailed ?? p.last_verified ?? '').slice(0, 10);
  const lastOutreach = [p.outreach_status, p.contacted_by && `by ${p.contacted_by}`, lastDate].filter(Boolean).join(' ');
  const latestNote = (p.notes.split(' | ').pop() ?? '').slice(0, 160);
  return [callNo, p.name, p.contact_name, p.contact_phone, p.contact_email || p.contact_path,
    templateNameFor(p), cell(p.score), p.safety_flag, [p.safety_reviews, p.review_rating].filter(Boolean).join(': '),
    cell(p.beds_est), cell(p.price_per_bed_est),
    p.price_now != null ? `${p.price_now} (${p.last_verified?.slice(0, 10)})` : '',
    p.kitchen, cell(walkOf(p)), String(p.sept15_ready), p.status,
    lastOutreach, latestNote, cell(p.next_check), p.address, p.neighborhood, p.id];
}

function houseTab(props: Property[], house: House, title: string, note: string): Tab {
  const rows = props.filter((p) => p.houses.includes(house) && !p.baseline);
  // calling priority: rows we can actually call (phone on file) first, best score first; the rest follow as research targets
  const callable = rows.filter(hasPhone).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const research = rows.filter((p) => !hasPhone(p)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const body = [
    ...callable.map((p, i) => houseRow(p, String(i + 1))),
    ...(research.length ? [['', `--- no phone on file yet (${research.length}): find a number, then they join the queue ---`, ...Array(HOUSE_HEADER.length - 2).fill('')]] : []),
    ...research.map((p) => houseRow(p, '')),
  ];
  return { title, header: HOUSE_HEADER, note, rows: body };
}

export function buildTabs(props: Property[]): Tab[] {
  const punk = houseTab(props, 'punk-house', 'Punkhaus',
    'Main cohort house, 40 to 50 people, buildings with 35+ beds in SF. This tab is the call sheet AND the log: make the call (Granola on), send Claude the notes, and Last outreach / Latest note / Next check on the row get filled in. Ask for: block of beds from Sept 15, monthly rate per bed, kitchen access, minimum term. Tenant-rights worry: 3-month program, visa-bound residents, everyone vacates at program end.');
  const femme = houseTab(props, 'femme-house', 'Femhaus',
    'Femme / safe house: about 10 to 12 women, kitchen required, 3 to 6 months. 2550 Van Ness (Minerva) is the live option; these are backups in calling order. Safety column matters double here. Calls made with Granola get logged onto the row by Claude.');
  const alum = houseTab(props, 'alum-house', 'Alumhaus',
    'Alum house and spillover: operating co-living, hostels and SROs under ~35 beds where one person can just book in. Call in order to confirm rates and holds; Granola notes get logged onto the row. Hive: toured by Elliot, great community reviews, no block available, actively looking for female residents.');

  const confirmed = props.filter((p) => p.status === 'confirmed');
  const airtable: Tab = {
    title: 'Airtable export', note: 'Rows with status=confirmed, flat columns, ready to import into the Airtable CRM (Google Sheets is for drafting; Airtable is where set-in-stone deals live). Mark a row confirmed and re-run push-to-sheet.',
    header: ['Name','Address','Neighborhood','Type','Beds','$/bed agreed','Monthly total','Kitchen','Contact','Phone','Email','House','Move-in','Notes','id'],
    rows: confirmed.map((p) => [p.name, p.address, p.neighborhood, p.type, cell(p.beds_est), cell(p.price_now ?? p.price_per_bed_est), cell(p.monthly_total_45_est), p.kitchen, p.contact_name, p.contact_phone, p.contact_email, p.houses.join(', '), String(p.sept15_ready), p.notes.slice(0, 300), p.id]),
  };
  return [punk, femme, alum, airtable];
}
