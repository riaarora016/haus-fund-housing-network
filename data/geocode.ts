// Geocode addresses (Nominatim, cached in data/geocache.json) and compute distance / transit heuristic
// to Frontier Tower (995 Market St). Respect Nominatim usage policy: 1 req/s, identifying User-Agent.
// Usage: npx tsx data/geocode.ts            (geocodes any row in properties.json lacking coords, then rewrites cache)
// build.ts only READS the cache, so the build stays offline + deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { FRONTIER } from './schema';

const CACHE = path.join(process.cwd(), 'data', 'geocache.json');
export type GeoHit = { lat: number; lng: number; precision: 'address' | 'neighborhood'; display: string; query: string };

export const NEIGHBORHOOD_CENTROIDS: Record<string, [number, number]> = {
  'SoMa': [37.7785, -122.4056], 'Nob Hill': [37.7930, -122.4160], 'Lower Nob Hill': [37.7880, -122.4160],
  'Civic Center': [37.7795, -122.4180], 'Tenderloin': [37.7840, -122.4140], 'Mid-Market': [37.7810, -122.4110],
  'Union Square': [37.7880, -122.4075], 'FiDi': [37.7940, -122.4000], 'Chinatown': [37.7941, -122.4078],
  'Mission': [37.7599, -122.4148], 'North Beach': [37.8000, -122.4100], 'Dogpatch': [37.7580, -122.3890],
  'Hayes Valley': [37.7760, -122.4240], 'Marina': [37.8000, -122.4370], 'Castro': [37.7620, -122.4350],
  'Haight': [37.7700, -122.4460], 'Lower Haight': [37.7720, -122.4300], 'Cathedral Hill': [37.7850, -122.4240],
  "Fisherman's Wharf": [37.8080, -122.4150], 'Fort Mason': [37.8060, -122.4320], 'Presidio': [37.7989, -122.4662],
  'Presidio Heights': [37.7880, -122.4520], 'Inner Richmond': [37.7800, -122.4650], 'Parkmerced': [37.7180, -122.4760],
  'Treasure Island': [37.8235, -122.3706], 'Design District / Potrero': [37.7680, -122.4030], 'NoPa/Panhandle': [37.7750, -122.4430],
  'South SF': [37.6547, -122.4077], 'Downtown Oakland': [37.8044, -122.2712], 'Uptown Oakland': [37.8100, -122.2680],
  'Lake Merritt, Oakland': [37.8050, -122.2590], 'Jack London Sq, Oakland': [37.7950, -122.2780], 'West Oakland': [37.8060, -122.2950],
  'Oakland Hills': [37.8030, -122.1830], 'Oakland Airport area': [37.7350, -122.2000], 'Berkeley': [37.8715, -122.2730],
  'Alameda': [37.7850, -122.2950], 'Richmond (East Bay)': [37.9360, -122.3480], 'San Rafael': [37.9735, -122.5311],
  'Citywide / San Rafael': [37.9735, -122.5311], 'Belmont': [37.5202, -122.2758], 'San Ramon': [37.7799, -121.9780],
  'Mountain View / Sunnyvale': [37.3861, -122.0839], 'San Jose': [37.3382, -121.8863], 'Philo (Mendocino)': [39.0663, -123.4447],
  'Pleasanton / Pleasant Hill / Newark': [37.6624, -121.8747], 'Various': [37.7749, -122.4194],
};

export function loadCache(): Record<string, GeoHit | null> {
  return fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
}
export function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(a))).toFixed(2);
}
export function distToFrontier(lat: number, lng: number) { return haversineMi(lat, lng, FRONTIER.lat, FRONTIER.lng); }

// Heuristic transit minutes (only used when the source has no walk time and no Maps API key):
// ≤1 mi → walk at 20 min/mi × 1.3 street factor; else 8 min access + Muni/BART ~12 mph door-to-door + 6 min egress.
export function transitHeuristicMin(distMi: number, eastBay: boolean): number {
  if (distMi <= 1) return Math.round(distMi * 1.3 * 20);
  const m = Math.round(8 + (distMi * 1.3) / 12 * 60 + 6);
  return eastBay ? Math.max(m, 45) : m;
}

/** Which string to ask Nominatim for. Returns null for un-geocodable addresses (handled by centroid fallback). */
export function geocodeQuery(address: string, region: string): string | null {
  let a = address.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // take the first building of a "A + B" cluster
  a = a.split(/\s\+\s/)[0].split(' / ')[0];
  if (!/\d/.test(a)) return null; // no street number → not geocodable with confidence
  const hasCity = /oakland|berkeley|alameda|san rafael|belmont|san ramon|mountain view|san jose|philo|richmond|emeryville|sunnyvale|south sf|south san francisco/i.test(a);
  const inSF = ['SF-priority', 'SF-other'].includes(region);
  if (!/,\s*(SF|San Francisco)/i.test(a) && !hasCity && inSF) a += ', San Francisco, CA';
  a = a.replace(/,\s*SF\b/i, ', San Francisco, CA');
  if (!/CA\b/.test(a)) a += ', CA';
  return a;
}

async function nominatim(q: string): Promise<GeoHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const j = (await res.json()) as any[];
  if (!j.length) return null;
  return { lat: +j[0].lat, lng: +j[0].lon, precision: 'address', display: j[0].display_name, query: q };
}

if (process.argv[1] && process.argv[1].endsWith('geocode.ts')) {
  (async () => {
    const props = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'properties.json'), 'utf8')) as any[];
    const cache = loadCache();
    let n = 0, hits = 0, misses = 0;
    const pending = props
      .map((p) => geocodeQuery(p.address, p.region))
      .filter((q): q is string => !!q && !(q in cache));
    const uniq = [...new Set(pending)];
    console.log(`geocode: ${uniq.length} new queries (${Object.keys(cache).length} cached)`);
    for (const q of uniq) {
      try {
        const hit = await nominatim(q);
        cache[q] = hit; if (hit) hits++; else misses++;
        console.log(`${hit ? '✓' : '✗'} ${q}${hit ? ` → ${hit.lat},${hit.lng}` : ''}`);
      } catch (e) { console.log(`! ${q}: ${(e as Error).message}`); }
      n++;
      await new Promise((r) => setTimeout(r, 1100));
      if (n % 10 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    }
    fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2));
    console.log(`done: ${hits} hits, ${misses} misses. Re-run build.ts to apply.`);
  })();
}
