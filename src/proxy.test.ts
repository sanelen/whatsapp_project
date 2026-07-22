import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicPath } from '@/proxy';

test('Meta can reach only the exact WhatsApp webhook API without a user session', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/privacy'), true);
  assert.equal(isPublicPath('/terms'), true);
  assert.equal(isPublicPath('/data-deletion'), true);
  assert.equal(isPublicPath('/marketing/33-essex'), true);
  assert.equal(isPublicPath('/marketing/quarry-heights'), true);
  assert.equal(isPublicPath('/marketing/westrich'), true);
  assert.equal(isPublicPath('/marketing/hamba-westrich-advert.pdf'), true);
  assert.equal(isPublicPath('/staff'), false);
  assert.equal(isPublicPath('/api/whatsapp/webhook'), true);
  assert.equal(isPublicPath('/api/whatsapp/webhook/anything'), false);
  assert.equal(isPublicPath('/api/chat'), false);
});
