import assert from 'node:assert/strict';
import test from 'node:test';
import { isCronAuthorizedPath, isPublicPath } from '@/proxy';

test('Meta can reach only the exact WhatsApp webhook API without a user session', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/privacy'), true);
  assert.equal(isPublicPath('/terms'), true);
  assert.equal(isPublicPath('/data-deletion'), true);
  assert.equal(isPublicPath('/staff'), false);
  assert.equal(isPublicPath('/api/whatsapp/webhook'), true);
  assert.equal(isPublicPath('/api/whatsapp/webhook/anything'), false);
  assert.equal(isPublicPath('/api/chat'), false);
});

test('only the reconciliation cron route bypasses the proxy with an exact bearer secret', () => {
  assert.equal(
    isCronAuthorizedPath('/api/monthly-payments/import/reconcile', 'Bearer scheduler-secret', 'scheduler-secret'),
    true
  );
  assert.equal(
    isCronAuthorizedPath('/api/monthly-payments/import/reconcile', 'Bearer wrong-secret', 'scheduler-secret'),
    false
  );
  assert.equal(
    isCronAuthorizedPath('/api/monthly-payments/import', 'Bearer scheduler-secret', 'scheduler-secret'),
    false
  );
  assert.equal(isCronAuthorizedPath('/api/monthly-payments/import/reconcile', null, 'scheduler-secret'), false);
});
