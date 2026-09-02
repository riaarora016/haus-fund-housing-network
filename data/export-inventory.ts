// Adapter: properties.json (tracker rows) -> the Haus Fund Inventory model (data/inventory/inventory.json).
// Normalizes field names, maps statuses, and NEVER invents values: anything the tracker does not know is null.
// Also bundles the Haus network nodes, cohorts and markets so the app has one data file.
import fs from 'node:fs';
import type { Property } from './schema';

const props = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as Property[];
const haus = JSON.parse(fs.readFileSync('data/haus-nodes.json', 'utf8'));
const cohorts = JSON.parse(fs.readFileSync('data/cohorts.json', 'utf8'));
const GENERATED = '2026-08-27';

type DealStatus = 'research' | 'not_contacted' | 'contacted' | 'awaiting_reply' | 'call_scheduled' | 'negotiating' | 'verbal_yes' | 'diligence' | 'contract_sent' | 'signed' | 'unavailable' | 'rejected' | 'archived';
type InvClass = 'haus_operated' | 'contracted_partner' | 'candidate' | 'rejected' | 'archived';

function dealStatus(p: Property): DealStatus {
  if (p.status === 'confirmed') return 'signed';
  if (p.status === 'ruled-out') return 'rejected';
  if (p.status === 'taken' || p.status === 'sold') return 'unavailable';
  if (p.baseline && p.type === 'co-living') return 'verbal_yes';      // "being signed" on Aug 20; signature not confirmed in our data
  if (p.status === 'stale-verify') return 'research';
  switch (p.outreach_status) {
    case 'loi': return 'negotiating';
    case 'toured': return 'diligence';
    case 'dead': return 'rejected';
    case 'contacted': case 'called': case 'emailed': return p.last_emailed && !p.last_verified ? 'awaiting_reply' : 'contacted';
    default: return 'not_contacted';
  }
}
function invClass(p: Property): InvClass {
  if (p.status === 'confirmed') return 'contracted_partner';
  if (p.status === 'ruled-out') return 'rejected';
  if (p.status === 'taken' || p.status === 'sold') return 'archived';
  return 'candidate';
}
const HOUSE_TO_NODE: Record<string, string> = { punkhaus: 'punk-haus', femhaus: 'fem-haus', alumhaus: 'alum-haus', safehaus: 'safe-haus' };
const verifiedPrice = (p: Property) => p.price_now != null && p.last_verified ? p.last_verified : null;
const verifiedBeds = (p: Property) => p.beds_available != null && p.last_verified ? p.last_verified : null;

const records = props.map((p) => ({
  id: p.id, property_name: p.name, name_detail: p.name_detail || null,
  inventory_class: invClass(p), deal_status: dealStatus(p), current_deal: !!p.baseline,
  market: 'sf', city: 'San Francisco', address: p.address, lat: p.lat, lng: p.lng, geo_precision: p.geo_precision,
  neighborhood: p.neighborhood, region: p.region, east_bay: p.east_bay, priority_neighborhood: p.priority_neighborhood,
  operator_name: p.operator || null, operator_type: p.deal_channel, property_type: p.type, property_type_raw: p.type_raw || null,
  total_rooms: p.rooms, total_beds: p.beds_est, occupancy_assumption: p.occupancy_assumption, capacity_raw: p.capacity_raw || null,
  available_beds: p.beds_available, private_rooms: null, shared_rooms: null, shared_beds: null,
  kitchen_status: p.kitchen, kitchen_raw: p.kitchen_raw || null, common_space: p.common_space || null, laundry: null, furnished: p.furnished, workspace: null, bath: p.bath,
  asking_per_room_low: p.price_per_room_low, asking_per_room_high: p.price_per_room_high, asking_per_bed: p.price_per_bed_est, asking_raw: p.price_raw || null,
  asking_monthly_45: p.monthly_total_45_est, verified_per_bed: p.price_now, verified_private_room: p.price_private_now,
  negotiated_monthly: null, negotiated_per_room: null, negotiated_per_bed: null, utilities_monthly: null, deposit: null, other_fees: null, currency: 'USD',
  minimum_stay_days: p.min_stay_nights, maximum_stay_days: null, available_from: null, available_until: null, sept15_ready: p.sept15_ready, bookable_online: p.bookable_online,
  frontier_walk_minutes: p.walk_min_from_frontier, walk_source: p.walk_min_from_frontier != null ? p.walk_source : null,
  frontier_transit_minutes_est: p.transit_min_to_frontier, distance_miles: p.dist_to_frontier_mi,
  safety_flag: p.safety_flag, safety_reviews: p.safety_reviews || null, review_rating: p.review_rating || null, safety_note: p.safety_note || null, safety_source: p.safety_note ? 'neighborhood default + hand-checked reviews (data/safety.json)' : 'neighborhood default',
  contact_name: p.contact_name || null, contact_title: null, contact_org: p.contact_org || null, contact_phone: p.contact_phone || null, contact_email: /@/.test(p.contact_email) ? p.contact_email : null, contact_path: p.contact_path || null, contact_verify: p.contact_verify,
  website_url: p.booking_url || null, listing_url: p.listing_url || null, source_links: p.source_links, source_type: p.source, source_tier: p.tier || null,
  last_price_verified_at: verifiedPrice(p), last_availability_verified_at: verifiedBeds(p), last_contacted_at: p.last_emailed, next_followup_at: p.next_check,
  last_checked_at: p.last_checked, last_checked_raw: p.last_checked_raw || null, verification_method: p.verified_via, confidence: p.confidence,
  assigned_owner: p.contacted_by || null, cohort_ids: [] as string[], haus_node_ids: p.houses.map((h) => HOUSE_TO_NODE[h]).filter(Boolean), use: null as string | null, beds_reserved: null as number | null,
  tracker_score: p.score, tracker_score_breakdown: p.score_breakdown, tier: p.tier,
  timeline_tags: p.timeline_tags, houses: p.houses, walk_in_ready: p.walk_in_ready, aau: p.aau, do_not_email: p.do_not_email,
  play: p.play || null, notes: p.notes,
  updated_by: 'import', created_at: '2026-08-22', updated_at: GENERATED,
}));

// Twins: the same building tracked on both tabs. Keep the deal (pipeline) record, fold the inventory twin's
// verified booking-page facts into it, and drop the twin so beds are never counted twice.
const byId = new Map(records.map((r) => [r.id, r]));
const merged = records.filter((r) => {
  const src = props.find((p) => p.id === r.id)!;
  if (src.audience !== 'inventory' || !src.related_id) return true;
  const deal = byId.get(src.related_id) as any; if (!deal) return true;
  for (const k of ['verified_per_bed', 'verified_private_room', 'available_beds', 'last_price_verified_at', 'last_availability_verified_at', 'website_url', 'listing_url', 'minimum_stay_days', 'bookable_online', 'verification_method', 'confidence'] as const)
    if (deal[k] == null && (r as any)[k] != null) deal[k] = (r as any)[k];
  if (r.frontier_walk_minutes != null) { deal.frontier_walk_minutes = r.frontier_walk_minutes; deal.walk_source = r.walk_source; }
  if (r.geo_precision === 'address' && deal.geo_precision !== 'address') { deal.lat = r.lat; deal.lng = r.lng; deal.geo_precision = 'address'; }
  deal.twin_id = r.id; deal.notes = [deal.notes, r.notes].filter(Boolean).join(' | ');
  return false;
});
const out = { generated: GENERATED, default_market: 'sf', default_cohort: 'c3', markets: cohorts.markets, cohorts: cohorts.cohorts, haus_nodes: haus.nodes, records: merged };
fs.mkdirSync('data/inventory', { recursive: true });
fs.writeFileSync('data/inventory/inventory.json', JSON.stringify(out));
fs.writeFileSync('data/exports/inventory.json', JSON.stringify(out, null, 2));
const c = (k: string) => Object.entries(merged.reduce((m: any, r: any) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {})).map(([a, b]) => `${a}=${b}`).join(', ');
console.log(`${merged.length} records (${records.length - merged.length} twins folded); class: ${c('inventory_class')}; deal_status: ${c('deal_status')}`);
