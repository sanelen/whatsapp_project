import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { isReleaseCheckRequest, releaseRequestAllowed } from './release-check';
const secret = 'test-only-release-secret-with-32-characters';
const env = { RELEASE_CHECK_SECRET: secret, RELEASE_TEST_PROPERTY_ID: 'test-property' };
function signed(method: string, path: string, body?: unknown, timestamp = String(Date.now())) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const signature = createHmac('sha256', secret).update(`${timestamp}\n${method}\n${path}\n${createHash('sha256').update(raw).digest('hex')}`).digest('hex');
  return new Request(`https://test.invalid${path}`, { method, body: raw || undefined, headers: { 'x-hamba-check-time': timestamp, 'x-hamba-check-signature': signature } });
}
test('release identity authenticates only a signed, bounded dry-run import', async () => {
  assert.equal(await isReleaseCheckRequest(signed('POST', '/api/monthly-payments/import', { billingPeriod: '2026-12', source: 'both', dryRun: true }), env), true);
  assert.equal(await isReleaseCheckRequest(signed('POST', '/api/monthly-payments/import', { billingPeriod: '2026-12', source: 'both' }), env), false);
  assert.equal(await isReleaseCheckRequest(signed('POST', '/api/monthly-payments/import', { billingPeriod: '2026-12', source: 'both', dryRun: true, pullAll: true }), env), false);
});
test('signed requests cannot sign off, edit rent, send messages, change settings or exchange OAuth codes', async () => {
  for (const [path, body] of [
    ['/api/monthly-payments/references', { action: 'sign_off', paymentReferenceId: 'real' }],
    ['/api/monthly-payments/rooms', { propertyId: 'test-property', rentAmount: 1 }],
    ['/api/settings/prompt', { temperature: 1 }],
    ['/api/workspace', { action: 'createOrganization', payload: { name: 'test' } }],
    ['/api/whatsapp/webhook', { entry: [{ changes: [] }] }],
  ] as const) assert.equal(await isReleaseCheckRequest(signed('POST', path, body), env), false);
  assert.equal(await isReleaseCheckRequest(signed('GET', '/api/monthly-payments/import/google-cloud?code=secret'), env), false);
  assert.equal(await isReleaseCheckRequest(signed('GET', '/api/monthly-payments/import/reconcile'), env), false);
});
test('signature binds method, path, body and freshness; missing credentials fail closed', async () => {
  const request = signed('GET', '/api/models');
  assert.equal(await isReleaseCheckRequest(request, env), true);
  assert.equal(await isReleaseCheckRequest(new Request('https://test.invalid/api/workspace', { headers: request.headers }), env), false);
  assert.equal(await isReleaseCheckRequest(signed('GET', '/api/models', undefined, '1'), env), false);
  assert.equal(await isReleaseCheckRequest(request, {}), false);
  assert.equal(releaseRequestAllowed('GET', new URL('https://test.invalid/api/kb/list?propertyId=another-property'), undefined, 'test-property'), false);
});
