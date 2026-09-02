// Street geometry and names from OpenStreetMap (Overpass) so the map can draw Google-style road lines and
// street labels as crisp vectors instead of baked label tiles. Output: data/inventory/roads.json
// (c) OpenStreetMap contributors, ODbL.
import fs from 'node:fs';
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const AREAS = {
  sf: { roads: '37.748,-122.452,37.808,-122.380', places: '37.70,-122.52,37.83,-122.35' },
  kobe: { roads: '34.635,135.19,34.70,135.25', places: '34.62,135.15,34.72,135.27' },
};
const CLASS: Record<string, number> = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3, residential: 4, unclassified: 4, living_street: 4, pedestrian: 4 };
async function q(query: string) { let last: any; for (let attempt = 0; attempt < 8; attempt++) { const url = MIRRORS[attempt % MIRRORS.length]; try { const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } }); if (!r.ok) throw new Error(`overpass ${r.status} at ${url}`); return await r.json(); } catch (e) { last = e; console.log('retry:', (e as Error).message); await new Promise((res) => setTimeout(res, 4000)); } } throw last; }
const round = (v: number) => Math.round(v * 1e5) / 1e5;
// keep every node that bends the line by more than ~1.5 m (radial distance simplification)
function simplify(pts: number[][], tol = 1.5e-5) { const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = out[out.length - 1], b = pts[i], c = pts[i + 1]; const d = Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / Math.hypot(c[0] - a[0], c[1] - a[1] || 1e-9); if (d > tol || Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.002) out.push(b); } out.push(pts[pts.length - 1]); return out; }
(async () => {
  const out: Record<string, unknown> = {};
  for (const [id, box] of Object.entries(AREAS)) {
    const roads = await q(`[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"]["name"](${box.roads});out geom;`);
    const ways = roads.elements.filter((w: any) => w.geometry?.length > 1).map((w: any) => ({ n: w.tags['name:en'] || w.tags.name, c: CLASS[w.tags.highway] ?? 4, p: simplify(w.geometry.map((g: any) => [round(g.lon), round(g.lat)])) }));
    const places = await q(`[out:json][timeout:60];node["place"~"^(neighbourhood|suburb|quarter|city|town)$"]["name"](${box.places});out;`);
    const pts = places.elements.map((n: any) => ({ n: n.tags['name:en'] || n.tags.name, k: n.tags.place, lat: round(n.lat), lng: round(n.lon) }));
    out[id] = { roads: ways, places: pts };
    console.log(`${id}: ${ways.length} named ways, ${pts.length} places`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  fs.writeFileSync('data/inventory/roads.json', JSON.stringify(out));
  console.log(`roads.json ${(fs.statSync('data/inventory/roads.json').size / 1024).toFixed(0)} KB`);
})();
