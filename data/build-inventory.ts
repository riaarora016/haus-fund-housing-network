// Assembles the Haus Fund Inventory artifact: template + concatenated src modules + inlined data and tiles.
// Output: data/exports/haus-fund-inventory.html (single self-contained file for the artifact viewer).
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const data = read('data/inventory/inventory.json');
const srcDir = 'data/inventory/src';
const app = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort().map((f) => `// ==== ${f} ====\n` + read(path.join(srcDir, f))).join('\n');
// tiles: satellite base + hi (labels layered), street z14 for Map mode
const sat = path.join('data', 'tiles-sat'), osm = path.join('data', 'tiles');
const group = (dir: string, re: RegExp, mime: string) => { const files = fs.readdirSync(dir).filter((f) => re.test(f)); if (!files.length) return null; const tiles = files.map((f) => { const m = f.match(/(\d+)-(\d+)-(\d+)\.(png|jpg)$/)!; return { x: +m[2], y: +m[3], d: fs.readFileSync(path.join(dir, f)).toString('base64') }; }); const z = +files[0].match(/(\d+)-\d+-\d+\.(png|jpg)$/)![1]; return { z, mime, tiles }; };
const sat15 = group(sat, /^sat-15-/, 'image/jpeg')!, place15 = group(sat, /^place-15-/, 'image/png'), sat16 = group(sat, /^sat-16-/, 'image/jpeg'), road16 = group(sat, /^road-16-/, 'image/png');
const osm14 = fs.existsSync(osm) ? group(osm, /^14-/, 'image/png') : null;
const xs = sat15.tiles.map((t) => t.x), ys = sat15.tiles.map((t) => t.y);
const tileset = { z: 15, x0: Math.min(...xs), y0: Math.min(...ys), cols: Math.max(...xs) - Math.min(...xs) + 1, rows: Math.max(...ys) - Math.min(...ys) + 1, base: [sat15, place15].filter(Boolean), hi: [sat16, road16].filter(Boolean), street: [osm14].filter(Boolean) };
const NB = { 'SoMa': [37.7785, -122.4056], 'Nob Hill': [37.7930, -122.4160], 'Civic Center': [37.7795, -122.4180], 'FiDi': [37.7940, -122.4000], 'Union Square': [37.7880, -122.4075], 'NoPa/Panhandle': [37.7750, -122.4430] };
const tpl = read('data/inventory/template.html');
const out = tpl.replace('/*__DATA__*/', () => data).replace('/*__TILES__*/', () => JSON.stringify(tileset)).replace('/*__NB__*/', () => JSON.stringify(NB)).replace('/*__APP__*/', () => app);
fs.mkdirSync('data/exports', { recursive: true });
fs.writeFileSync('data/exports/haus-fund-inventory.html', out);
console.log(`haus-fund-inventory.html: ${(out.length / 1048576).toFixed(1)} MB (sat ${sat15.tiles.length}+${sat16?.tiles.length ?? 0}, labels ${place15?.tiles.length ?? 0}+${road16?.tiles.length ?? 0}, street ${osm14?.tiles.length ?? 0})`);
