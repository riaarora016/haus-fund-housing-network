// Extra imagery for the Housing Network map: sharper SF core (z17), a z14 city frame, and Kobe (Port Island / KBIC).
// Esri World Imagery + Boundaries and Places + Transportation, attribution required. Cached in data/tiles-sat/.
import fs from 'node:fs';
import path from 'node:path';
const LAYERS: Record<string, { url: (z: number, x: number, y: number) => string; ext: string }> = {
  sat: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, ext: 'jpg' },
  road: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`, ext: 'png' },
  place: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`, ext: 'png' },
};
const LEVELS = [
  { prefix: '', z: 14, box: { lngMin: -122.487, lngMax: -122.371, latMin: 37.723, latMax: 37.817 }, layers: ['sat', 'place'] },
  { prefix: '', z: 17, box: { lngMin: -122.425, lngMax: -122.398, latMin: 37.777, latMax: 37.796 }, layers: ['sat'] },
  { prefix: '', z: 17, box: { lngMin: -122.425, lngMax: -122.398, latMin: 37.777, latMax: 37.796 }, layers: ['road'] },
  { prefix: '', z: 18, box: { lngMin: -122.418, lngMax: -122.402, latMin: 37.780, latMax: 37.792 }, layers: ['sat'] },
  { prefix: 'kobe-', z: 14, box: { lngMin: 135.15, lngMax: 135.27, latMin: 34.62, latMax: 34.72 }, layers: ['sat', 'place'] },
  { prefix: 'kobe-', z: 15, box: { lngMin: 135.195, lngMax: 135.245, latMin: 34.64, latMax: 34.69 }, layers: ['sat', 'road'] },
  { prefix: 'kobe-', z: 16, box: { lngMin: 135.205, lngMax: 135.235, latMin: 34.65, latMax: 34.672 }, layers: ['sat', 'road'] },
];
const dir = path.join('data', 'tiles-sat'); fs.mkdirSync(dir, { recursive: true });
(async () => {
  for (const { prefix, z, box, layers } of LEVELS) {
    const n = 2 ** z; const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
    const ty = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n); };
    const x0 = tx(box.lngMin), x1 = tx(box.lngMax), y0 = ty(box.latMax), y1 = ty(box.latMin);
    for (const key of layers) {
      const L = LAYERS[key]; let fetched = 0, failed = 0; const total = (x1 - x0 + 1) * (y1 - y0 + 1);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const f = path.join(dir, `${prefix}${key}-${z}-${x}-${y}.${L.ext}`);
        if (fs.existsSync(f) && fs.statSync(f).size > 0) continue;
        try { const r = await fetch(L.url(z, x, y), { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } }); if (!r.ok) throw new Error(`http ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); fetched++; }
        catch (e) { failed++; if (failed < 5) console.log(`! ${prefix}${key} ${z}/${x}/${y}: ${(e as Error).message}`); }
        await new Promise((res) => setTimeout(res, 40));
      }
      console.log(`${prefix}${key} z${z}: ${fetched} fetched, ${failed} failed (${total} total)`);
    }
  }
})();
