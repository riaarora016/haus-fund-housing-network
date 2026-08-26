// Assembles the shareable Biopunk Housing Inventory into data/exports/biopunk-housing-map.html.
// Basemap: Esri World Imagery satellite with label overlays (neighborhood names at city scale,
// street names when zoomed in), all inlined since the artifact sandbox blocks tile servers.
// Imagery credit: Esri, Maxar, Earthstar Geographics.
import fs from 'node:fs';
import path from 'node:path';

const data = fs.readFileSync('web/public/housing-map-data.json', 'utf8');
const dir = path.join('data', 'tiles-sat');
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f));
if (!files.length) throw new Error('no tiles in data/tiles-sat - run: npx tsx data/fetch-tiles-sat.ts');
const groups: Record<string, { z: number; mime: string; tiles: { x: number; y: number; d: string }[] }> = {};
for (const f of files) {
  const m = f.match(/^(\w+)-(\d+)-(\d+)-(\d+)\.(png|jpg)$/); if (!m) continue;
  const [, layer, z, x, y, ext] = m;
  const key = `${layer}${z}`;
  (groups[key] ??= { z: +z, mime: ext === 'jpg' ? 'image/jpeg' : 'image/png', tiles: [] }).tiles.push({ x: +x, y: +y, d: fs.readFileSync(path.join(dir, f)).toString('base64') });
}
// render order matters: satellite below, labels above
const sat15 = groups.sat15, place15 = groups.place15, sat16 = groups.sat16, road16 = groups.road16;
const xs = sat15.tiles.map((t) => t.x), ys = sat15.tiles.map((t) => t.y);
const tileset = {
  z: 15, x0: Math.min(...xs), y0: Math.min(...ys), cols: Math.max(...xs) - Math.min(...xs) + 1, rows: Math.max(...ys) - Math.min(...ys) + 1,
  base: [sat15, place15], hi: [sat16, road16],
};
const tpl = fs.readFileSync('data/map-template.html', 'utf8');
const out = tpl.replace('/*__DATA__*/', () => data).replace('/*__TILES__*/', () => JSON.stringify(tileset));
fs.writeFileSync('data/exports/biopunk-housing-map.html', out);
console.log(`biopunk-housing-map.html: ${(out.length / 1048576).toFixed(1)} MB (sat ${sat15.tiles.length}+${sat16.tiles.length}, labels ${place15.tiles.length}+${road16.tiles.length})`);
