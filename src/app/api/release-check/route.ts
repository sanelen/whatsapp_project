import { NextResponse } from 'next/server';
import { constants, createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { requireApiAuth } from '@/lib/auth/api-guard';

export const maxDuration = 60;
// Provider credentials never leave Vercel. Only fixed empty events and encrypted
// pings can be signed here; arbitrary payloads/recipients/URLs are not accepted.
export async function POST(request: Request) {
  const denied = await requireApiAuth(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || !['webhook-get', 'webhook-post', 'flow-ping'].includes(body.probe)) return NextResponse.json({ error: 'Unsupported release probe' }, { status: 400 });
  try {
    const origin = new URL(process.env.APP_URL || 'https://hambatrading.co.za');
    if (origin.protocol !== 'https:' || origin.hostname !== 'hambatrading.co.za') throw new Error('Production probe origin is not configured');
    const target = new URL(body.probe === 'flow-ping' ? '/api/whatsapp/flows/waiting-list' : '/api/whatsapp/webhook', origin);
    let method = 'POST';
    let payload: string | undefined;
    const headers: Record<string, string> = {};
    let key: Buffer | undefined, iv: Buffer | undefined;
    if (body.probe === 'webhook-get') {
      method = 'GET';
      const token = process.env.WHATSAPP_VERIFY_TOKEN;
      if (!token) throw new Error('WHATSAPP_VERIFY_TOKEN is missing');
      target.searchParams.set('hub.mode', 'subscribe'); target.searchParams.set('hub.verify_token', token); target.searchParams.set('hub.challenge', 'release-check');
    } else {
      let secret = process.env.META_APP_SECRET;
      if (body.probe === 'flow-ping') {
        if (process.env.WAITING_LIST_ENABLED !== 'true') return NextResponse.json({ success: true, probe: body.probe, state: 'disabled', limitation: 'Waiting-list feature is disabled; submission and Sheets access are not verified.' });
        secret = process.env.WAITING_LIST_META_APP_SECRET || (process.env.WAITING_LIST_USE_EXISTING_META_APP_SECRET === 'true' ? secret : undefined);
        const privateKey = process.env.WAITING_LIST_PRIVATE_KEY?.replace(/\\n/g, '\n');
        if (!privateKey) throw new Error('WAITING_LIST_PRIVATE_KEY is missing');
        key = randomBytes(16); iv = randomBytes(16);
        const cipher = createCipheriv('aes-128-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ action: 'ping', version: '3.0' })), cipher.final(), cipher.getAuthTag()]);
        const publicKey = createPublicKey(createPrivateKey({ key: privateKey, passphrase: process.env.WAITING_LIST_PRIVATE_KEY_PASSPHRASE }));
        payload = JSON.stringify({ encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'), encrypted_flow_data: encrypted.toString('base64'), initial_vector: iv.toString('base64') });
      } else payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      if (!secret) throw new Error('Provider app secret is missing');
      headers['content-type'] = 'application/json';
      headers['x-hub-signature-256'] = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    }
    const started = Date.now();
    const response = await fetch(target, { method, body: payload, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    if (response.status !== 200) throw new Error(`Provider route returned HTTP ${response.status}`);
    if (response.headers.get('x-hamba-revision') !== process.env.VERCEL_GIT_COMMIT_SHA) throw new Error('Provider route is serving another revision');
    if (key && iv) {
      const bytes = Buffer.from(text, 'base64');
      const decipher = createDecipheriv('aes-128-gcm', key, Buffer.from(iv.map(byte => byte ^ 255)));
      decipher.setAuthTag(bytes.subarray(-16));
      const decoded = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString());
      if (decoded.data?.status !== 'active') throw new Error('Encrypted ping did not report active');
    } else if (text !== (method === 'GET' ? 'release-check' : 'EVENT_RECEIVED')) throw new Error('Provider response semantics failed');
    return NextResponse.json({ success: true, probe: body.probe, state: 'verified', route: target.pathname, method, status: response.status, durationMs: Date.now() - started,
      limitation: 'No real inbound event, sheet submission, or outbound message is generated.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Provider verification failed' }, { status: 503 });
  }
}
