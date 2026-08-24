// One-time: download OSM raster tiles covering the SF map bbox at z15 into data/tiles/ so the
// shareable map can inline them (the artifact sandbox blocks remote tile servers). ~1 req/75ms,
// identifying UA, cached on disk; re-runs only fetch missing tiles. © OpenStreetMap contributors.
import fs from 'node:fs';
import path from 'node:path';

const B = { lngMin: -122.487, lngMax: -122.371, latMin: 37.723, latMax: 37.817 };
const Z = 15;
const n = 2 ** Z;
const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
const ty = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n); };
const x0 = tx(B.lngMin), x1 = tx(B.lngMax), y0 = ty(B.latMax), y1 = ty(B.latMin);
const dir = path.join('data', 'tiles');
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  console.log(`z${Z} tiles x ${x0}-${x1}, y ${y0}-${y1} → ${total} tiles`);
  let done = 0, fetched = 0, failed = 0;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const f = path.join(dir, `${Z}-${x}-${y}.png`);
    done++;
    if (fs.existsSync(f) && fs.statSync(f).size > 0) continue;
    const sub = 'abc'[(x + y) % 3];
    try {
      const r = await fetch(`https://${sub}.tile.openstreetmap.org/${Z}/${x}/${y}.png`, { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } });
      if (!r.ok) throw new Error(`http ${r.status}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      fetched++;
    } catch (e) { failed++; console.log(`! ${Z}/${x}/${y}: ${(e as Error).message}`); }
    await new Promise((res) => setTimeout(res, 75));
    if (done % 40 === 0) console.log(`${done}/${total}`);
  }
  const bytes = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`done: ${fetched} fetched, ${failed} failed, total ${(bytes / 1048576).toFixed(1)} MB on disk`);
})();
