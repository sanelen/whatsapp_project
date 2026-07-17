import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicPath } from '@/proxy';

test('Meta can reach only the exact WhatsApp webhook API without a user session', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/api/whatsapp/webhook'), true);
  assert.equal(isPublicPath('/api/whatsapp/webhook/anything'), false);
  assert.equal(isPublicPath('/api/chat'), false);
});
