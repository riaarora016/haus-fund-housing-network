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
const JPEG_Q = 65;

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
  // San Francisco: z15 frame with places, z16 imagery + road labels, z17 imagery in the core; OSM z14 for street mode
  const sat15 = (await layer(SAT, 'sat-', 15, 'image/jpeg'))!, place15 = await layer(SAT, 'place-', 15, 'image/png'), sat16 = await layer(SAT, 'sat-', 16, 'image/jpeg'), road16 = await layer(SAT, 'road-', 16, 'image/png'), sat17 = await layer(SAT, 'sat-', 17, 'image/jpeg'), road17 = await layer(SAT, 'road-', 17, 'image/png'), sat18 = await layer(SAT, 'sat-', 18, 'image/jpeg');
  const osm14 = await layer(OSM, '', 14, 'image/png', false);
  const sf = { ...frameOf(sat15, 15), minK: 0.0625, levels: [
    { z: 15, maxK: null, layers: [sat15, place15].filter(Boolean) },
    { z: 16, maxK: maxK(15, 16), layers: [sat16, road16].filter(Boolean) },
    { z: 17, maxK: maxK(15, 17), layers: [sat17, road17].filter(Boolean) },
    { z: 18, maxK: maxK(15, 18), layers: [sat18].filter(Boolean) },
  ].filter((l) => l.layers.length), street: osm14 ? [{ z: 14, ...osm14 }] : [] };
  // Kobe: z14 frame with places, z15 imagery + roads on Port Island, z16 imagery around KBIC
  const k14 = await layer(SAT, 'kobe-sat-', 14, 'image/jpeg'), kp14 = await layer(SAT, 'kobe-place-', 14, 'image/png'), k15 = await layer(SAT, 'kobe-sat-', 15, 'image/jpeg'), kr15 = await layer(SAT, 'kobe-road-', 15, 'image/png'), k16 = await layer(SAT, 'kobe-sat-', 16, 'image/jpeg'), kr16 = await layer(SAT, 'kobe-road-', 16, 'image/png');
  const kobe = k14 ? { ...frameOf(k14, 14), minK: 0.125, levels: [
    { z: 14, maxK: null, layers: [k14, kp14].filter(Boolean) },
    { z: 15, maxK: maxK(14, 15), layers: [k15, kr15].filter(Boolean) },
    { z: 16, maxK: maxK(14, 16), layers: [k16, kr16].filter(Boolean) },
  ].filter((l) => l.layers.length), street: [] } : null;
  const tilesets: Record<string, unknown> = { sf }; if (kobe) tilesets.kobe = kobe;
  const NB = { sf: { 'SoMa': [37.7785, -122.4056], 'Nob Hill': [37.7930, -122.4160], 'Civic Center': [37.7795, -122.4180], 'FiDi': [37.7940, -122.4000], 'Union Square': [37.7880, -122.4075], 'NoPa/Panhandle': [37.7750, -122.4430] }, kobe: { 'Port Island': [34.6660, 135.2120], 'Sannomiya': [34.6950, 135.1950], 'KBIC': [34.6575, 135.2235] } };
  const tpl = read('data/inventory/template.html');
  const tilesJson = JSON.stringify(tilesets, (k, v) => (v === Infinity ? null : v));
  const out = tpl.replace('/*__DATA__*/', () => data).replace('/*__TILES__*/', () => tilesJson).replace('/*__NB__*/', () => JSON.stringify(NB)).replace('/*__APP__*/', () => app);
  fs.mkdirSync('data/exports', { recursive: true });
  fs.writeFileSync('data/exports/haus-fund-housing-network.html', out);
  const mb = (n: number) => (n / 1048576).toFixed(2);
  console.log(`haus-fund-housing-network.html: ${mb(out.length)} MB total (data ${mb(data.length)}, app ${mb(app.length)})`);
  console.log(`  SF: z15 ${mb(sizeOf(sat15) + sizeOf(place15))} MB (${sat15.tiles.length} tiles), z16 ${mb(sizeOf(sat16) + sizeOf(road16))} MB, z17 ${mb(sizeOf(sat17) + sizeOf(road17))} MB (${sat17?.tiles.length ?? 0} tiles), z18 ${mb(sizeOf(sat18))} MB (${sat18?.tiles.length ?? 0} tiles), street ${mb(sizeOf(osm14))} MB`);
  if (kobe) console.log(`  Kobe: z14 ${mb(sizeOf(k14) + sizeOf(kp14))} MB, z15 ${mb(sizeOf(k15) + sizeOf(kr15))} MB, z16 ${mb(sizeOf(k16) + sizeOf(kr16))} MB`);
  if (out.length > 15.5 * 1048576) console.warn('WARNING: over 15.5 MB, the artifact limit is 16 MB');
})();
