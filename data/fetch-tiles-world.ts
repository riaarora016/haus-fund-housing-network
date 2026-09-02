// World-to-city imagery so the map reads like a globe: world z0-z2, California and Kansai z4-z7,
// Bay Area and Kobe region z8-z13. Esri World Imagery (+ Boundaries and Places labels at a few levels).
import fs from 'node:fs';
import path from 'node:path';
const LAYERS: Record<string, { url: (z: number, x: number, y: number) => string; ext: string }> = {
  sat: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, ext: 'jpg' },
  place: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`, ext: 'png' },
};
const WORLD = { lngMin: -179.9, lngMax: 179.9, latMin: -80, latMax: 84 };
const CAL = { lngMin: -125, lngMax: -114, latMin: 32.3, latMax: 42.2 };
const BAY = { lngMin: -122.9, lngMax: -121.6, latMin: 37.1, latMax: 38.4 };
const SFC = { lngMin: -122.56, lngMax: -122.33, latMin: 37.68, latMax: 37.86 };
const KANSAI = { lngMin: 134.2, lngMax: 136.2, latMin: 33.9, latMax: 35.4 };
const KOBE = { lngMin: 134.95, lngMax: 135.45, latMin: 34.55, latMax: 34.8 };
const LEVELS: { z: number; box: typeof WORLD; layers: string[] }[] = [
  { z: 0, box: WORLD, layers: ['sat'] }, { z: 1, box: WORLD, layers: ['sat'] }, { z: 2, box: WORLD, layers: ['sat', 'place'] },
  ...[4, 5, 6, 7].map((z) => ({ z, box: CAL, layers: z >= 6 ? ['sat', 'place'] : ['sat'] })),
  ...[4, 5, 6, 7].map((z) => ({ z, box: KANSAI, layers: z >= 6 ? ['sat', 'place'] : ['sat'] })),
  ...[8, 9, 10, 11].map((z) => ({ z, box: BAY, layers: z >= 9 ? ['sat', 'place'] : ['sat'] })),
  ...[8, 9, 10, 11].map((z) => ({ z, box: KOBE, layers: z >= 9 ? ['sat', 'place'] : ['sat'] })),
  ...[12, 13].map((z) => ({ z, box: SFC, layers: ['sat', 'place'] })),
  ...[12, 13].map((z) => ({ z, box: KOBE, layers: ['sat', 'place'] })),
];
const dir = path.join('data', 'tiles-sat'); fs.mkdirSync(dir, { recursive: true });
(async () => {
  let all = 0;
  for (const { z, box, layers } of LEVELS) {
    const n = 2 ** z; const tx = (lng: number) => Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)));
    const ty = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n))); };
    const x0 = tx(box.lngMin), x1 = tx(box.lngMax), y0 = ty(box.latMax), y1 = ty(box.latMin);
    for (const key of layers) {
      const L = LAYERS[key]; let fetched = 0, failed = 0; const total = (x1 - x0 + 1) * (y1 - y0 + 1); all += total;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const f = path.join(dir, `w-${key}-${z}-${x}-${y}.${L.ext}`);
        if (fs.existsSync(f) && fs.statSync(f).size > 0) continue;
        try { const r = await fetch(L.url(z, x, y), { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } }); if (!r.ok) throw new Error(`http ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); fetched++; }
        catch (e) { failed++; if (failed < 4) console.log(`! ${key} ${z}/${x}/${y}: ${(e as Error).message}`); }
        await new Promise((res) => setTimeout(res, 30));
      }
      console.log(`w-${key} z${z}: ${fetched} fetched, ${failed} failed (${total} total)`);
    }
  }
  console.log('total tiles in plan:', all);
})();
