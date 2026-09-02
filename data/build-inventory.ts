// Assembles the Haus Fund Housing Network artifact: template + concatenated src modules + inlined data and tile pyramids.
// One tileset per market with imagery. JPEG tiles are recompressed (sharp, quality 65) and label PNGs quantized so
// the whole page stays under the 16 MB artifact limit. Recompressed tiles are cached in data/tiles-sat/.opt/.
// Output: data/exports/haus-fund-housing-network.html
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const data = read('data/inventory/inventory.json');
const srcDir = 'data/inventory/src';
const app = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort().map((f) => `// ==== ${f} ====\n` + read(path.join(srcDir, f))).join('\n');
const SAT = path.join('data', 'tiles-sat'), OSM = path.join('data', 'tiles'), OPT = path.join(SAT, '.opt');
fs.mkdirSync(OPT, { recursive: true });
const JPEG_Q = 60;

async function optimized(file: string): Promise<Buffer> {
  const out = path.join(OPT, file);
  if (fs.existsSync(out)) return fs.readFileSync(out);
  const src = fs.readFileSync(path.join(SAT, file));
  const buf = file.endsWith('.jpg') ? await sharp(src).jpeg({ quality: JPEG_Q, mozjpeg: true }).toBuffer() : await sharp(src).png({ palette: true, quality: 80, compressionLevel: 9 }).toBuffer();
  const best = buf.length < src.length ? buf : src;
  fs.writeFileSync(out, best); return best;
}
type Layer = { mime: string; tiles: { x: number; y: number; d: string }[] };
async function layer(dir: string, prefix: string, z: number, mime: string, optimize = true): Promise<Layer | null> {
  const re = new RegExp(`^${prefix}${z}-(\\d+)-(\\d+)\\.(png|jpg)$`);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : [];
  if (!files.length) return null;
  const tiles = [];
  for (const f of files) { const m = f.match(re)!; const buf = optimize && dir === SAT ? await optimized(f) : fs.readFileSync(path.join(dir, f)); tiles.push({ x: +m[1], y: +m[2], d: buf.toString('base64') }); }
  return { mime, tiles };
}
const frameOf = (L: Layer, z: number) => { const xs = L.tiles.map((t) => t.x), ys = L.tiles.map((t) => t.y); return { z, x0: Math.min(...xs), y0: Math.min(...ys), cols: Math.max(...xs) - Math.min(...xs) + 1, rows: Math.max(...ys) - Math.min(...ys) + 1 }; };
const maxK = (frameZ: number, z: number) => z <= frameZ ? Infinity : 2 ** (frameZ - z) * 1.8;   // show a level once the coarser one would be stretched past 1.8x
const sizeOf = (L: Layer | null) => (L ? L.tiles.reduce((s, t) => s + t.d.length, 0) : 0);

(async () => {
  // One world tileset. Every level z gathers the tiles we have at that zoom from all regions
  // (w- world/regional, unprefixed SF, kobe- Kobe); imagery first, labels on top.
  const TZ = 16;   // projection zoom: keeps every coordinate under Blink's 33.5M layout-unit ceiling (2^16 * 256 = 16.8M)
  const levels: { z: number; maxK: number | null; layers: Layer[] }[] = []; const report: string[] = [];
  for (let z = 0; z <= 18; z++) {
    const sats: Layer[] = [], labels: Layer[] = [];
    for (const pre of ['w-sat-', 'sat-', 'kobe-sat-']) { const L = await layer(SAT, pre, z, 'image/jpeg'); if (L) sats.push(L); }
    for (const pre of ['w-place-', 'place-', 'kobe-place-', 'road-', 'kobe-road-']) { if (pre === 'road-' && z < 16) continue; const L = await layer(SAT, pre, z, 'image/png'); if (L) labels.push(L); }   // road-15 is heavy and z15 already carries place labels
    const all = [...sats, ...labels]; if (!all.length) continue;
    const n = all.reduce((a, L) => a + L.tiles.length, 0), bytes = all.reduce((a, L) => a + sizeOf(L), 0);
    report.push(`z${z}: ${n} tiles, ${(bytes / 1048576).toFixed(2)} MB`);
    levels.push({ z, maxK: z === 0 ? null : 2 ** (TZ - z) * 1.8, layers: all });
  }
  const world = { z: TZ, x0: 0, y0: 0, cols: 2 ** TZ, rows: 2 ** TZ, minK: 0.125, levels, street: [] };
  const tilesets = { world };
  const NB = { sf: { 'SoMa': [37.7785, -122.4056], 'Nob Hill': [37.7930, -122.4160], 'Civic Center': [37.7795, -122.4180], 'FiDi': [37.7940, -122.4000], 'Union Square': [37.7880, -122.4075], 'NoPa/Panhandle': [37.7750, -122.4430] }, kobe: { 'Port Island': [34.6660, 135.2120], 'Sannomiya': [34.6950, 135.1950], 'KBIC': [34.6575, 135.2235] } };
  const tpl = read('data/inventory/template.html');
  const tilesJson = JSON.stringify(tilesets);
  const out = tpl.replace('/*__DATA__*/', () => data).replace('/*__TILES__*/', () => tilesJson).replace('/*__NB__*/', () => JSON.stringify(NB)).replace('/*__APP__*/', () => app);
  fs.mkdirSync('data/exports', { recursive: true });
  fs.writeFileSync('data/exports/haus-fund-housing-network.html', out);
  const mb = (n: number) => (n / 1048576).toFixed(2);
  console.log(`haus-fund-housing-network.html: ${mb(out.length)} MB total (data ${mb(data.length)}, app ${mb(app.length)})`);
  console.log('  ' + report.join(' · '));
  if (out.length > 15.5 * 1048576) console.warn('WARNING: over 15.5 MB, the artifact limit is 16 MB');
})();
