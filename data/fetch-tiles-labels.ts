// Cleaner map labels: CARTO "dark_only_labels" (thin white type, light halo) replacing the Esri reference layers.
// Fetches one label tile for every satellite tile we already hold at z >= 2 where Esri labels were used.
// Attribution required: labels (c) CARTO, (c) OpenStreetMap contributors.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join('data', 'tiles-sat');
const want = new Set<string>();
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^(w-place|place|kobe-place|road|kobe-road)-(\d+)-(\d+)-(\d+)\.png$/); if (!m) continue;
  const z = +m[2]; if (z === 15 && m[1] === 'road') continue; // road-15 was never used
  want.add(`${z}-${m[3]}-${m[4]}`);
}
(async () => {
  let fetched = 0, failed = 0; const subs = ['a', 'b', 'c', 'd']; let i = 0;
  for (const key of want) {
    const f = path.join(dir, `c-lab-${key}.png`); if (fs.existsSync(f) && fs.statSync(f).size > 0) continue;
    const [z, x, y] = key.split('-');
    try { const r = await fetch(`https://${subs[i++ % 4]}.basemaps.cartocdn.com/dark_only_labels/${z}/${x}/${y}.png`, { headers: { 'User-Agent': 'biopunk-housing-portal/1.0 (housing@biopunk.house)' } }); if (!r.ok) throw new Error(`http ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); fetched++; }
    catch (e) { failed++; if (failed < 5) console.log(`! ${key}: ${(e as Error).message}`); }
    await new Promise((res) => setTimeout(res, 25));
  }
  console.log(`carto labels: ${want.size} wanted, ${fetched} fetched, ${failed} failed`);
})();
