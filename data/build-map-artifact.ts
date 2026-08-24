// Assembles the shareable housing map into data/exports/biopunk-housing-map.html with the data inlined
// (Artifact CSP blocks external tiles, so the SF map is drawn from coordinates in SVG). Single self-contained file.
import fs from 'node:fs';
const data = fs.readFileSync('web/public/housing-map-data.json', 'utf8');
const tpl = fs.readFileSync('data/map-template.html', 'utf8');
const out = tpl.replace('/*__DATA__*/', () => data);
fs.writeFileSync('data/exports/biopunk-housing-map.html', out);
console.log(`biopunk-housing-map.html: ${(out.length/1024).toFixed(0)} KB`);
