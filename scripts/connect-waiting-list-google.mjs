// One-time local authorization. Uses the already registered localhost callback.
// Run with the existing client ID/secret in the environment. Never prints tokens.
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const sheetId = '185I2dzEuc-spUeifJlSVDILXBuKIFcFubdcfhbN_a-k';
const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Existing Google client configuration required.');
const redirect = 'http://localhost:3002/api/monthly-payments/import/google-cloud';
const state = randomBytes(32).toString('hex');
const verifier = randomBytes(32).toString('base64url');
const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', trigger_onepick: 'true', file_ids: sheetId, mimetypes: 'application/vnd.google-apps.spreadsheet', login_hint: 'info.hambatrading@gmail.com', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', include_granted_scopes: 'false' })) url.searchParams.set(key, value);
let completed = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const incoming = new URL(req.url, 'http://localhost:3002');
  if (incoming.pathname === '/start') { res.writeHead(302, { Location: url.toString() }); res.end(); return; }
  if (incoming.pathname !== new URL(redirect).pathname || completed || incoming.searchParams.get('state') !== state) { res.writeHead(400); res.end('Invalid authorization state.'); return; }
  if (incoming.searchParams.get('error')) { res.writeHead(400); res.end('Authorization was not completed. Reopen /start to retry.'); return; }
  if (incoming.searchParams.get('picked_file_ids') !== sheetId) { res.writeHead(400); res.end('Select only the Hamba Property Waiting List sheet.'); return; }
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: incoming.searchParams.get('code') ?? '', redirect_uri: redirect, client_id: clientId, client_secret: clientSecret, code_verifier: verifier }) });
    const token = await response.json();
    if (!response.ok || !token.refresh_token || token.scope !== 'https://www.googleapis.com/auth/drive.file') throw new Error('Could not obtain a file-scoped refresh token.');
    const vars = { WAITING_LIST_GOOGLE_CLIENT_ID: clientId, WAITING_LIST_GOOGLE_CLIENT_SECRET: clientSecret, WAITING_LIST_GOOGLE_REFRESH_TOKEN: token.refresh_token };
    await writeFile('.env.waiting-list-writer', Object.entries(vars).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n')+'\n', { mode: 0o600, flag: 'wx' });
    completed = true;
    res.end('Waiting list file authorization saved securely. No customer messages sent. Backend write verification is next.');
    console.log('File-specific authorization completed; credentials saved locally, not deployed.');
  } catch { res.writeHead(500); res.end('Could not store authorization. No existing credentials were replaced.'); }
});
server.listen(3002, '127.0.0.1', () => console.log('Open http://localhost:3002/start to authorize only the waiting list Sheet.'));
