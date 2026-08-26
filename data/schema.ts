// Canonical row schema - see CLAUDE.md "Canonical row schema" + Step 6 additions.
// One row = one property. properties.json is sorted by id and never hand-edited.

export type PropertyType =
  | 'sro-hotel' | 'tourist-hotel' | 'dorm' | 'co-living' | 'apartment-block'
  | 'sfh' | 'campus' | 'hostel' | 'other';
export type Kitchen = 'private' | 'communal' | 'none' | 'unknown';
export type Status =
  | 'active' | 'dark' | 'receivership' | 'on-market' | 'taken' | 'sold'
  | 'stale-verify' | 'ruled-out' | 'confirmed';
export type TimelineTag = 'bridge-sept' | 'q1-2027' | 'femme-house' | 'alum-house' | 'expansion';
export type OutreachStatus =
  | 'not-contacted' | 'contacted' | 'called' | 'emailed' | 'toured' | 'loi' | 'dead';
export type Audience = 'pipeline' | 'inventory';
export type VerifiedVia = 'booking-page' | 'listing' | 'email' | 'call' | 'resident' | 'manual';
export type Confidence = 'high' | 'med' | 'low';
export type Sept15 = true | false | 'unknown';
// How we reach the decision-maker. Elliot's channel preference: pocket deals (owner) first, then receivers, brokers, institutions, operators.
export type DealChannel = 'owner' | 'receiver' | 'broker' | 'institution' | 'operator' | 'unknown';
// Elliot: "if we have to retrofit a space, it takes forever for permitting... we don't want to do that."
export type WalkInReady = 'yes' | 'no' | 'unknown';
// Block-level safety read: neighborhood default, refined by hand checks of online reviews (data/safety.json).
export type SafetyFlag = 'ok' | 'mixed' | 'rough-block' | 'unknown';
export type House = 'punkhaus' | 'femhaus' | 'alumhaus' | 'safehaus';
export type Region = 'SF-priority' | 'SF-other' | 'East Bay' | 'Peninsula' | 'North Bay' | 'Remote';

export interface ScoreBreakdown {
  transit: number;
  price: number;
  kitchen: number;
  beds: number;
  safety: number;
  sept15_bonus: number;
  caps_applied: string[];
  method_notes: string[];
}

export interface Property {
  id: string;
  name: string;
  name_detail: string;           // the tagline that used to sit after the dash in the workbook name
  address: string;
  neighborhood: string;          // normalized to CLAUDE.md list where possible
  neighborhood_raw: string;      // as it appears in the source
  region: Region;
  east_bay: boolean;
  priority_neighborhood: boolean;
  lat: number | null;
  lng: number | null;
  geo_precision: 'address' | 'neighborhood' | 'none';
  dist_to_frontier_mi: number | null;
  transit_min_to_frontier: number | null; // computed only when no source walk time
  walk_min_from_frontier: number | null;  // Notion walk minutes (inventory) or sheet estimate (pipeline)
  walk_source: string;

  type: PropertyType;
  type_raw: string;
  rooms: number | null;
  capacity_raw: string;
  beds_est: number | null;
  occupancy_assumption: 1 | 2 | 3 | null;
  price_per_room_low: number | null;
  price_per_room_high: number | null;
  price_per_bed_est: number | null;
  price_raw: string;
  monthly_total_45_est: number | null;

  kitchen: Kitchen;
  kitchen_raw: string;
  safety_flag: SafetyFlag;
  safety_reviews: 'good' | 'concerns' | 'bad' | '';
  review_rating: string;         // e.g. "8.5/10 Hostelworld (1,668 reviews)"
  safety_note: string;
  common_space: string;
  furnished: boolean | 'unknown';
  bath: 'private' | 'shared' | 'unknown';

  status: Status;
  deal_channel: DealChannel;
  walk_in_ready: WalkInReady;
  houses: House[];               // which Biopunk house(s) this building could serve
  timeline_tags: TimelineTag[];
  aau: boolean;
  baseline: boolean;
  sept15_ready: Sept15;
  cluster_id: string | null;
  related_id: string | null;      // the same building on the other tab (pipeline <-> inventory)
  tier: string;

  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  score_sheet: number | null;     // the workbook's own SCORE column, kept for diffing

  contact_name: string;
  contact_org: string;
  contact_phone: string;
  contact_email: string;
  contact_verify: boolean;
  contact_path: string;
  contact_section: string;

  source_links: string[];
  source: 'sheet-pipeline' | 'sheet-inventory' | 'report' | 'notion' | 'dashboard' | 'existing-sheet';
  play: string;
  notes: string;
  outreach_status: OutreachStatus;
  contacted_by: string;
  notion_round: 1 | 2 | null;
  last_checked: string | null;    // ISO date from the source ("Jul 16 2026 (report)" -> 2026-07-16)
  last_checked_raw: string;

  // ---- Step 6 additions ----
  audience: Audience;
  beds_available: number | null;  // NEVER estimated. booking page / email / call / resident, or null.
  price_now: number | null;       // lowest $/bed/month as last verified (shared bed if offered)
  price_private_now: number | null; // private-room $/month as last verified
  min_stay_nights: number | null;
  bookable_online: boolean;
  booking_url: string;
  listing_url: string;
  booking_adapter: string;        // refresh/adapters/<name>.ts
  operator: string;
  last_verified: string | null;   // ISO timestamp
  verified_via: VerifiedVia | null;
  confidence: Confidence | null;
  next_check: string | null;      // ISO date
  do_not_email: boolean;
  email_thread_id: string;
  last_emailed: string | null;
}

// Column order for the Google Sheet tabs + CSV. Keep stable: the web app parses by header name.
export const SHEET_COLUMNS: (keyof Property)[] = [
  'id','name','name_detail','address','neighborhood','neighborhood_raw','region','east_bay','priority_neighborhood',
  'lat','lng','geo_precision','dist_to_frontier_mi','transit_min_to_frontier','walk_min_from_frontier','walk_source',
  'type','type_raw','rooms','capacity_raw','beds_est','occupancy_assumption',
  'price_per_room_low','price_per_room_high','price_per_bed_est','price_raw','monthly_total_45_est',
  'kitchen','kitchen_raw','safety_flag','safety_reviews','review_rating','safety_note','common_space','furnished','bath',
  'status','deal_channel','walk_in_ready','houses','timeline_tags','aau','baseline','sept15_ready','cluster_id','related_id','tier',
  'score','score_breakdown','score_sheet',
  'contact_name','contact_org','contact_phone','contact_email','contact_verify','contact_path','contact_section',
  'source_links','source','play','notes','outreach_status','contacted_by','notion_round','last_checked','last_checked_raw',
  'audience','beds_available','price_now','price_private_now','min_stay_nights','bookable_online','booking_url','listing_url','booking_adapter','operator',
  'last_verified','verified_via','confidence','next_check','do_not_email','email_thread_id','last_emailed',
];

export const PRIORITY_NEIGHBORHOODS = ['SoMa', 'Nob Hill', 'Civic Center', 'FiDi', 'Union Square', 'NoPa/Panhandle'];
export const FRONTIER = { name: 'Frontier Tower', address: '995 Market St, San Francisco, CA 94103', lat: 37.78255, lng: -122.40935 };
