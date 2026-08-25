// Assembles the shareable housing map into data/exports/biopunk-housing-map.html: inlines the property
// data and the OSM raster tiles from data/tiles (fetched once by data/fetch-tiles.ts), since the artifact
// sandbox blocks remote tile servers. Two zoom levels: z15 city frame + z16 core. © OpenStreetMap contributors.
import fs from 'node:fs';
import path from 'node:path';

const data = fs.readFileSync('web/public/housing-map-data.json', 'utf8');
const dir = path.join('data', 'tiles');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
if (!files.length) throw new Error('no tiles in data/tiles - run: npx tsx data/fetch-tiles.ts');
const byZ: Record<number, { z: number; x: number; y: number; d: string }[]> = {};
for (const f of files) {
  const [z, x, y] = f.replace('.png', '').split('-').map(Number);
  (byZ[z] ??= []).push({ z, x, y, d: fs.readFileSync(path.join(dir, f)).toString('base64') });
}
const level = (z: number) => {
  const tiles = byZ[z] ?? [];
  if (!tiles.length) return null;
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  return { z, x0: Math.min(...xs), y0: Math.min(...ys), cols: Math.max(...xs) - Math.min(...xs) + 1, rows: Math.max(...ys) - Math.min(...ys) + 1, tiles };
};
const tileset = { base: level(15), hi: level(16) };
const tpl = fs.readFileSync('data/map-template.html', 'utf8');
const out = tpl.replace('/*__DATA__*/', () => data).replace('/*__TILES__*/', () => JSON.stringify(tileset));
fs.writeFileSync('data/exports/biopunk-housing-map.html', out);
console.log(`biopunk-housing-map.html: ${(out.length / 1048576).toFixed(1)} MB, z15 ${tileset.base?.tiles.length} + z16 ${tileset.hi?.tiles.length} tiles`);
