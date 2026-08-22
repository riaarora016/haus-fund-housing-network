// Write data/properties.json to the Google Sheet (tabs "Pipeline" + "Inventory", split by audience).
//   npx tsx data/push-to-sheet.ts            # overwrite both tabs with the local build
//   npx tsx data/push-to-sheet.ts --merge    # keep Sheet-side edits to human columns (status, outreach_status, notes, contact_*, do_not_email…)
import 'dotenv/config';
import fs from 'node:fs';
import { sheetConfigured, readProperties, writeProperties } from './lib/sheet';
import type { Property } from './schema';

const HUMAN_COLUMNS: (keyof Property)[] = ['status','outreach_status','contacted_by','notes','contact_name','contact_org','contact_phone','contact_email','contact_verify','contact_path','do_not_email','sept15_ready','timeline_tags','beds_available','price_now','price_private_now','min_stay_nights','last_verified','verified_via','confidence','next_check','email_thread_id','last_emailed'];

(async () => {
  if (!sheetConfigured()) { console.error('SHEET_ID + service-account credentials missing in .env — see README "Google Sheet setup".'); process.exit(1); }
  const local = JSON.parse(fs.readFileSync('data/properties.json', 'utf8')) as Property[];
  let out = local;
  if (process.argv.includes('--merge')) {
    const remote = new Map((await readProperties()).map((r) => [r.id, r]));
    out = local.map((p) => { const r = remote.get(p.id); if (!r) return p; const m: any = { ...p }; for (const c of HUMAN_COLUMNS) if (r[c] !== '' && r[c] != null) m[c] = r[c]; return m as Property; });
    console.log(`merged human-edited columns for ${[...remote.keys()].filter((id) => local.some((p) => p.id === id)).length} rows`);
  }
  await writeProperties(out);
  console.log(`pushed ${out.length} rows (${out.filter((p) => p.audience === 'pipeline').length} Pipeline, ${out.filter((p) => p.audience === 'inventory').length} Inventory) to sheet ${process.env.SHEET_ID}`);
})();
