// One-time: mint a Gmail refresh token for housing@biopunk.house.
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npx tsx refresh/gmail-auth.ts
// Opens a consent URL; sign in AS housing@biopunk.house; the local callback prints GMAIL_REFRESH_TOKEN for .env / GitHub secrets.
import 'dotenv/config';
import http from 'node:http';
import { google } from 'googleapis';

const o = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, 'http://localhost:8765/oauth2callback');
const url = o.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'] });
console.log(`\nOpen this URL and sign in as the housing@ mailbox:\n\n${url}\n`);
http.createServer(async (req, res) => {
  const code = new URL(req.url!, 'http://localhost:8765').searchParams.get('code');
  if (!code) { res.end('no code'); return; }
  const { tokens } = await o.getToken(code);
  res.end('Done - you can close this tab.');
  console.log(`\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`); process.exit(0);
}).listen(8765);
