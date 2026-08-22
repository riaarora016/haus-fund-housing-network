// Google Sheets access shared by push-to-sheet / pull-from-sheet / refresh jobs.
// Auth: a service-account JSON in .env (GOOGLE_SERVICE_ACCOUNT_JSON — the raw JSON string — or
// GOOGLE_APPLICATION_CREDENTIALS — a path). SHEET_ID = the id in the sheet URL.
// The service account's client_email must be shared on the Sheet as Editor.
import 'dotenv/config';
import fs from 'node:fs';
import { google, sheets_v4 } from 'googleapis';
import { SHEET_COLUMNS, type Property } from '../schema';

export const TABS = { pipeline: 'Pipeline', inventory: 'Inventory', log: 'Outreach log', changelog: 'Changelog' } as const;

export function sheetConfigured(): boolean {
  return !!process.env.SHEET_ID && !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

let _client: sheets_v4.Sheets | null = null;
export function sheets(): sheets_v4.Sheets {
  if (_client) return _client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials: raw, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  _client = google.sheets({ version: 'v4', auth });
  return _client;
}
const SHEET_ID = () => process.env.SHEET_ID!;

export { toCell, rowToCells, cellsToRow } from './csv';
import { rowToCells, cellsToRow } from './csv';

export async function ensureTab(title: string) {
  const meta = await sheets().spreadsheets.get({ spreadsheetId: SHEET_ID() });
  if (!meta.data.sheets?.some((s) => s.properties?.title === title)) {
    await sheets().spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID(), requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
  }
}

export async function readTab(title: string): Promise<Record<string, string>[]> {
  const res = await sheets().spreadsheets.values.get({ spreadsheetId: SHEET_ID(), range: `'${title}'!A1:ZZ` });
  const rows = res.data.values ?? [];
  if (!rows.length) return [];
  const [h, ...body] = rows as string[][];
  return body.filter((r) => r.some((c) => c !== '')).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

export async function writeTab(title: string, header: string[], rows: string[][]) {
  await ensureTab(title);
  await sheets().spreadsheets.values.clear({ spreadsheetId: SHEET_ID(), range: `'${title}'!A1:ZZ` });
  await sheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID(), range: `'${title}'!A1`, valueInputOption: 'RAW',
    requestBody: { values: [header, ...rows] },
  });
}

export async function appendRows(title: string, rows: string[][]) {
  await ensureTab(title);
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID(), range: `'${title}'!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/** Read both property tabs from the Sheet as Property objects. */
export async function readProperties(): Promise<Property[]> {
  const [a, b] = await Promise.all([readTab(TABS.pipeline), readTab(TABS.inventory)]);
  return [...a, ...b].map(cellsToRow).sort((x, y) => x.id.localeCompare(y.id));
}
/** Write property rows to the two tabs (split by audience). */
export async function writeProperties(props: Property[]) {
  const header = SHEET_COLUMNS as string[];
  await writeTab(TABS.pipeline, header, props.filter((p) => p.audience === 'pipeline').map(rowToCells));
  await writeTab(TABS.inventory, header, props.filter((p) => p.audience === 'inventory').map(rowToCells));
}
