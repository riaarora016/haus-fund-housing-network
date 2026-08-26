// Satellite basemap for the Housing Inventory map: Esri World Imagery (satellite) + Transportation
// (roads and street names) + Boundaries and Places (neighborhood names) overlays, the hybrid look.
// Free to use with attribution: Esri, Maxar, Earthstar Geographics. Cached in data/tiles-sat/.
import fs from 'node:fs';
import path from 'node:path';

const LAYERS = [
  { key: 'sat', url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, ext: 'jpg' },
  { key: 'road', url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`, ext: 'png' },
  { key: 'place', url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`, ext: 'png' },
];
const LEVELS = [
  { z: 15, box: { lngMin: -122.487, lngMax: -122.371, latMin: 37.723, latMax: 37.817 }, layers: ['sat', 'road', 'place'] },
  { z: 16, box: { lngMin: -122.443, lngMax: -122.388, latMin: 37.752, latMax: 37.802 }, layers: ['sat', 'road'] },
];
const dir = path.join('data', 'tiles-sat');
fs.mkdirSync(dir, { recursive: true });
(async () => {
  for (const { z, box, layers } of LEVELS) {
    const n = 2 ** z;
    const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
    const ty = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n); };
    const x0 = tx(box.lngMin), x1 = tx(box.lngMax), y0 = ty(box.latMax), y1 = ty(box.latMin);
    for (const key of layers) {
      const L = LAYERS.find((l) => l.key === key)!;
      let fetched = 0, failed = 0, done = 0;
      const total = (x1 - x0 + 1) * (y1 - y0 + 1);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        done++;
        const f = path.join(dir, `${key}-${z}-${x}-${y}.${L.ext}`);
        if (fs.existsSync(f) && fs.statSync(f).size > 0) continue;
        try {
          const r = await fetch(L.url(z, x, y), { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } });
          if (!r.ok) throw new Error(`http ${r.status}`);
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
          fetched++;
        } catch (e) { failed++; if (failed < 5) console.log(`! ${key} ${z}/${x}/${y}: ${(e as Error).message}`); }
        await new Promise((res) => setTimeout(res, 40));
        if (done % 120 === 0) console.log(`${key} z${z}: ${done}/${total}`);
      }
      console.log(`${key} z${z}: ${fetched} fetched, ${failed} failed (${total} total)`);
    }
  }
  const files = fs.readdirSync(dir);
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`tiles-sat: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB on disk`);
})();
