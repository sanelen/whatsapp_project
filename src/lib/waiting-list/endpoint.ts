import { constants, createCipheriv, createDecipheriv, createHmac, privateDecrypt, randomUUID, timingSafeEqual } from 'node:crypto';
import { verifyMetaWebhookSignature } from '../whatsapp-webhook';
import { FLOW_ID, WABA_ID, InvalidSubmission, parseSubmission, type Outcome, type Submission } from './submission';

type Body = { action?: string; version?: string; screen?: string; flow_token?: string; data?: Record<string, unknown> };
type TokenClaims = { flowId: string; wabaId: string; phoneNumberId: string; nonce: string; exp: number };

// Used by a future authorized Flow launcher. Never exposed as an unauthenticated
// token-minting API and never uses the secondary outbound phone configuration.
export function issueFlowToken(secret: string, phoneNumberId: string, now = Date.now()): string {
  if (secret.length < 32 || !/^\d+$/.test(phoneNumberId)) throw new Error('Flow launch configuration missing.');
  const claims: TokenClaims = { flowId: FLOW_ID, wabaId: WABA_ID, phoneNumberId, nonce: randomUUID(), exp: Math.floor(now / 1000) + 86400 };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}

function validToken(token: unknown, secret: string, phoneNumberId: string): token is string {
  if (typeof token !== 'string' || token.length > 2048) return false;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenClaims;
    return claims.flowId === FLOW_ID && claims.wabaId === WABA_ID && claims.phoneNumberId === phoneNumberId && typeof claims.nonce === 'string' && claims.nonce.length > 10 && claims.exp > Date.now() / 1000;
  } catch { return false; }
}

export function decryptFlow(body: Record<string, unknown>, privateKey: string, passphrase?: string) {
  for (const key of ['encrypted_aes_key', 'encrypted_flow_data', 'initial_vector']) {
    if (typeof body[key] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body[key] as string)) throw new Error('Invalid encrypted envelope.');
  }
  const key = privateDecrypt({ key: privateKey, passphrase, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(body.encrypted_aes_key as string, 'base64'));
  const iv = Buffer.from(body.initial_vector as string, 'base64');
  const data = Buffer.from(body.encrypted_flow_data as string, 'base64');
  if (key.length !== 16 || iv.length !== 16 || data.length <= 16) throw new Error('Invalid encrypted envelope.');
  const cipher = createDecipheriv('aes-128-gcm', key, iv);
  cipher.setAuthTag(data.subarray(-16));
  const decoded = JSON.parse(Buffer.concat([cipher.update(data.subarray(0, -16)), cipher.final()]).toString('utf8')) as Body;
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid flow payload.');
  return { decoded, key, iv };
}

export function encryptFlow(body: unknown, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-128-gcm', key, Buffer.from(iv.map((byte) => byte ^ 255)));
  return Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}

export async function handleFlowRequest(request: Request, save: (id: string, input: Submission) => Promise<Outcome>, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' };
  const reply = (text: string, status: number) => new Response(text, { status, headers });
  // Explicit opt-in only: this deployment's existing webhook was verified in
  // Meta as Hamba Tenant Assistant (1935334950508426). Keep its secret in Vercel.
  const appSecret = env.WAITING_LIST_META_APP_SECRET || (env.WAITING_LIST_USE_EXISTING_META_APP_SECRET === 'true' ? env.META_APP_SECRET : undefined);
  const privateKey = env.WAITING_LIST_PRIVATE_KEY;
  const tokenSecret = env.WAITING_LIST_TOKEN_SECRET;
  const phoneId = env.WAITING_LIST_PRIMARY_PHONE_NUMBER_ID;
  if (env.WAITING_LIST_ENABLED !== 'true' || !appSecret || !privateKey || !tokenSecret || tokenSecret.length < 32 || !phoneId) return reply('Waiting list is not configured.', 503);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32768) return reply('Request too large.', 413);
  if (!verifyMetaWebhookSignature(raw, request.headers.get('x-hub-signature-256'), appSecret)) return reply('Invalid signature.', 432);
  let decrypted: ReturnType<typeof decryptFlow>;
  try { decrypted = decryptFlow(JSON.parse(raw), privateKey.replace(/\\n/g, '\n'), env.WAITING_LIST_PRIVATE_KEY_PASSPHRASE); }
  catch { return reply('Invalid encrypted request.', 421); }
  const { decoded: body, key, iv } = decrypted;
  const encrypted = (value: unknown, status = 200) => reply(encryptFlow(value, key, iv), status);
  if (body.action === 'ping') return encrypted({ data: { status: 'active' } });
  if (!validToken(body.flow_token, tokenSecret, phoneId)) return encrypted({ error_msg: 'This form link has expired. Please ask Hamba for a new waiting list form.' }, 427);
  if (body.data?.error) return encrypted({ data: { acknowledged: true } });
  const emptyForm = { form_values: {}, error_message: '', has_error: false };
  if (body.action === 'INIT') return encrypted({ screen: 'WAITING_LIST', data: emptyForm });
  if (body.action !== 'data_exchange' || body.screen !== 'WAITING_LIST' || body.data?.form_id !== FLOW_ID) return encrypted({ error_msg: 'Please reopen the waiting list form.' }, 400);
  try {
    const input = parseSubmission(body.data);
    const outcome = await save(body.flow_token, input);
    return encrypted({ screen: 'CONFIRMATION', data: {
      result_title: outcome === 'saved' ? 'You are on the list' : 'Already on the list',
      result_message: outcome === 'saved' ? `Your interest in ${input.property} has been saved. Joining the list does not reserve a unit.` : `This WhatsApp number is already on the waiting list for ${input.property}. No duplicate entry was added.`,
      outcome,
    } });
  } catch (error) {
    const retained = Object.fromEntries(['name', 'surname', 'property', 'whatsapp_number'].map((key) => [key, typeof body.data?.[key] === 'string' ? (body.data[key] as string).slice(0, 100) : '']));
    return encrypted({ screen: 'WAITING_LIST', data: { ...emptyForm, form_values: retained, has_error: true, error_message: error instanceof InvalidSubmission ? error.message : 'We could not confirm your save. Please try Join waiting list again. Your retry will not add a duplicate.' } });
  }
}
