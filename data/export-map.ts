// Emits web/public/housing-map-data.json and a standalone embed for the shareable map artifact:
// SF rows with coordinates, the fields the finder needs, nothing sensitive beyond what outreach already uses.
import fs from 'node:fs';
import type { Property } from './schema';
const props = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as Property[];
const walk = (p: Property) => p.walk_min_from_frontier ?? p.transit_min_to_frontier;
const sf = props.filter((p) => ['SF-priority', 'SF-other'].includes(p.region) && p.lat && p.lng && !['taken', 'sold', 'ruled-out'].includes(p.status));
const slim = sf.map((p) => ({
  id: p.id, name: p.name, detail: p.name_detail, address: p.address, neighborhood: p.neighborhood, region: p.region,
  lat: p.lat, lng: p.lng, geo: p.geo_precision, type: p.type, beds: p.beds_est, rooms: p.rooms,
  price: p.price_per_bed_est, priceNow: p.price_now, pricePriv: p.price_private_now, kitchen: p.kitchen,
  walk: walk(p), sept15: p.sept15_ready, walkIn: p.walk_in_ready, score: p.score, status: p.status,
  audience: p.audience, houses: p.houses, bookable: p.bookable_online, bookingUrl: p.booking_url,
  phone: p.contact_phone, email: p.contact_email, lastVerified: p.last_verified, verifiedVia: p.verified_via,
  minStay: p.min_stay_nights, priority: p.priority_neighborhood, tags: p.timeline_tags, play: p.play,
})).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
const meta = {
  generated: '2026-08-23', frontier: { lat: 37.78255, lng: -122.40935, name: 'Frontier Tower', address: '995 Market St' },
  count: slim.length, bookableNow: slim.filter((p) => p.audience === 'inventory').length,
};
const out = { meta, properties: slim };
fs.mkdirSync('web/public', { recursive: true });
fs.writeFileSync('web/public/housing-map-data.json', JSON.stringify(out));
fs.writeFileSync('data/exports/housing-map-data.json', JSON.stringify(out, null, 2));
console.log(`map data: ${slim.length} SF rows (${meta.bookableNow} bookable now), lat ${Math.min(...slim.map(p=>p.lat!)).toFixed(3)}-${Math.max(...slim.map(p=>p.lat!)).toFixed(3)}, lng ${Math.min(...slim.map(p=>p.lng!)).toFixed(3)}-${Math.max(...slim.map(p=>p.lng!)).toFixed(3)}`);
