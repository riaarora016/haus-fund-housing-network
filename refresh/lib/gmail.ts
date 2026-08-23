// Gmail API (housing@biopunk.house). OAuth2 refresh-token flow - run `npx tsx refresh/gmail-auth.ts` once to mint it.
// Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM (e.g. "Biopunk Housing <housing@biopunk.house>").
import 'dotenv/config';
import { google, gmail_v1 } from 'googleapis';

export const gmailConfigured = () => !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
let _g: gmail_v1.Gmail | null = null;
export function gmail(): gmail_v1.Gmail {
  if (_g) return _g;
  const o = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, 'http://localhost:8765/oauth2callback');
  o.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return (_g = google.gmail({ version: 'v1', auth: o }));
}
const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sendEmail(opts: { to: string; subject: string; text: string; threadId?: string; inReplyTo?: string; cc?: string }): Promise<{ id: string; threadId: string }> {
  const from = process.env.GMAIL_FROM ?? 'housing@biopunk.house';
  const headers = [`From: ${from}`, `To: ${opts.to}`, opts.cc ? `Cc: ${opts.cc}` : '', `Subject: ${opts.subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '', opts.inReplyTo ? `References: ${opts.inReplyTo}` : ''].filter(Boolean);
  const raw = b64url(headers.join('\r\n') + '\r\n\r\n' + opts.text);
  const res = await gmail().users.messages.send({ userId: 'me', requestBody: { raw, threadId: opts.threadId } });
  return { id: res.data.id!, threadId: res.data.threadId! };
}

export type InboundMsg = { id: string; threadId: string; from: string; fromEmail: string; subject: string; date: string; text: string; messageIdHeader: string };
function decodeBody(p: gmail_v1.Schema$MessagePart | undefined): string {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return Buffer.from(p.body.data, 'base64').toString('utf8');
  const parts = p.parts ?? []; for (const x of parts) { const t = decodeBody(x); if (t) return t; }
  if (p.mimeType === 'text/html' && p.body?.data) return Buffer.from(p.body.data, 'base64').toString('utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return '';
}
export async function listInbound(query = 'in:inbox -from:me newer_than:10d', max = 100): Promise<InboundMsg[]> {
  const list = await gmail().users.messages.list({ userId: 'me', q: query, maxResults: max });
  const out: InboundMsg[] = [];
  for (const m of list.data.messages ?? []) {
    const full = await gmail().users.messages.get({ userId: 'me', id: m.id!, format: 'full' });
    const h = (n: string) => full.data.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value ?? '';
    const from = h('from'); const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).toLowerCase().trim();
    let text = decodeBody(full.data.payload!);
    text = text.split(/\r?\n(On .{10,120} wrote:|-----Original Message-----|From: )/)[0]; // strip quoted history
    out.push({ id: m.id!, threadId: full.data.threadId!, from, fromEmail, subject: h('subject'), date: h('date'), text: text.trim(), messageIdHeader: h('message-id') });
  }
  return out;
}
export async function ensureLabel(name: string): Promise<string> {
  const ls = await gmail().users.labels.list({ userId: 'me' });
  const f = ls.data.labels?.find((l) => l.name === name); if (f) return f.id!;
  const c = await gmail().users.labels.create({ userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
  return c.data.id!;
}
export async function labelMessage(id: string, labelId: string) { await gmail().users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId] } }); }
