import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// A dedicated service identity, deliberately not a staff account. Even possession
// of its key cannot authorize tenant mutations, source imports or outbound sends.
const emptyValidation = new Set(['/api/kb/delete', '/api/kb/update', '/api/kb/upload', '/api/monthly-payments/references', '/api/monthly-payments/rooms', '/api/monthly-payments/management-briefing', '/api/property-content']);
const readRoutes = new Set(['/api/admin/bank-accounts', '/api/analytics/overview', '/api/history', '/api/kb/list', '/api/models', '/api/monthly-payments/import', '/api/monthly-payments/import/google-cloud', '/api/monthly-payments/import/reconcile', '/api/property-content', '/api/settings/prompt', '/api/workspace']);
const allowedMethods: Record<string, string> = { '/api/kb/delete': 'DELETE', '/api/kb/update': 'PATCH', '/api/kb/upload': 'POST', '/api/monthly-payments/references': 'POST', '/api/monthly-payments/rooms': 'POST', '/api/monthly-payments/management-briefing': 'POST', '/api/property-content': 'POST' };
function exact(actual: unknown, expected: unknown) { return JSON.stringify(actual) === JSON.stringify(expected); }
export function releaseRequestAllowed(method: string, url: URL, body: unknown, propertyId: string) {
  const route = url.pathname;
  const keys = [...url.searchParams.keys()];
  const allowedQuery = new Set(['propertyId', 'window', 'channel', 'provider', 'runId', 'status', 'dryRun']);
  if (keys.some(key => !allowedQuery.has(key))) return false;
  if (url.searchParams.has('propertyId') && url.searchParams.get('propertyId') !== propertyId) return false;
  if (route === '/api/release-check') return method === 'POST' && ['configuration', 'webhook-get', 'webhook-post', 'flow-ping'].some(probe => exact(body, { probe }));
  if (method === 'GET') {
    if (!readRoutes.has(route)) return false;
    if (route === '/api/monthly-payments/import') return Boolean(url.searchParams.get('runId'));
    if (route === '/api/monthly-payments/import/reconcile') return url.searchParams.get('status') === 'true' || url.searchParams.get('dryRun') === 'true';
    return true;
  }
  if (emptyValidation.has(route)) return method === allowedMethods[route] && exact(body, {});
  if (route === '/api/history') return method === 'POST' ? exact(body, { dryRun: true, threads: [] }) : method === 'DELETE' && url.searchParams.get('dryRun') === 'true';
  if (route === '/api/settings/prompt') return method === 'PUT' && exact(body, { dryRun: true, temperature: 0.4 });
  if (route === '/api/workspace') return method === 'POST' && exact(body, { action: 'validateOnly', payload: {} });
  if (route === '/api/monthly-payments/import/reconcile') return method === 'POST' && exact(body, { dryRun: true });
  if (route === '/api/monthly-payments/import') {
    const input = body as { billingPeriod?: string } | null;
    return method === 'POST' && /^\d{4}-(0[1-9]|1[0-2])$/.test(input?.billingPeriod ?? '')
      && exact(body, { billingPeriod: input?.billingPeriod, source: 'both', dryRun: true });
  }
  if (route === '/api/kb/search') return method === 'POST' && exact(body, { query: 'Deployment availability check', propertyId, matchCount: 1 });
  if (route === '/api/chat') return method === 'POST' && exact(body, { messages: [{ role: 'user', content: 'Reply with the single word READY.' }], systemPrompt: 'This is a deployment availability test. Reply READY.', retrieval: { memoryMode: 'rolling_window' } });
  return false;
}
export async function isReleaseCheckRequest(request: Request, env: Record<string, string | undefined> = process.env) {
  const secret = env.RELEASE_CHECK_SECRET;
  const timestamp = request.headers.get('x-hamba-check-time') ?? '';
  const signature = request.headers.get('x-hamba-check-signature') ?? '';
  if (!secret || secret.length < 32 || !/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const url = new URL(request.url);
  const raw = ['GET', 'HEAD'].includes(request.method) ? '' : await request.clone().text();
  if (raw.length > 4096) return false;
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : undefined; } catch { return false; }
  if (!releaseRequestAllowed(request.method, url, body, env.RELEASE_TEST_PROPERTY_ID ?? '')) return false;
  const message = `${timestamp}\n${request.method}\n${url.pathname}${url.search}\n${createHash('sha256').update(raw).digest('hex')}`;
  const expected = createHmac('sha256', secret).update(message).digest('hex');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
