// Read the Sheet's PUBLISHED CSV (no credentials needed) — the same thing the web app reads — and
// write it to data/sheet-snapshot.json so you can diff what the team edited vs the local build.
//   PIPELINE_CSV_URL=... INVENTORY_CSV_URL=... npx tsx data/pull-from-sheet.ts
import 'dotenv/config';
import fs from 'node:fs';
import Papa from 'papaparse';
import { cellsToRow } from './lib/sheet';

(async () => {
  const urls = [process.env.PIPELINE_CSV_URL ?? process.env.VITE_PIPELINE_CSV_URL, process.env.INVENTORY_CSV_URL ?? process.env.VITE_INVENTORY_CSV_URL].filter(Boolean) as string[];
  if (!urls.length) { console.error('Set PIPELINE_CSV_URL / INVENTORY_CSV_URL (File → Share → Publish to web → CSV, one per tab).'); process.exit(1); }
  const rows = [];
  for (const u of urls) {
    const text = await (await fetch(u)).text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    rows.push(...parsed.data.map(cellsToRow));
    console.log(`${u.slice(0, 60)}… → ${parsed.data.length} rows`);
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync('data/sheet-snapshot.json', JSON.stringify(rows, null, 2) + '\n');
  const local = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as any[];
  const lm = new Map(local.map((p) => [p.id, p]));
  let diffs = 0;
  for (const r of rows) { const l = lm.get(r.id); if (!l) { console.log(`+ sheet-only row ${r.id}`); diffs++; continue; }
    for (const k of ['status','outreach_status','notes','beds_available','price_now','last_verified'] as const) if (String(l[k] ?? '') !== String((r as any)[k] ?? '')) { console.log(`~ ${r.id}.${k}: local=${JSON.stringify(l[k])} sheet=${JSON.stringify((r as any)[k])}`); diffs++; } }
  console.log(`${rows.length} rows pulled → data/sheet-snapshot.json; ${diffs} differences vs local build`);
})();
