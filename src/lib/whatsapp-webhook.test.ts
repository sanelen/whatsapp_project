import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyMetaWebhookSignature, verifyWhatsAppChallenge } from '@/lib/whatsapp-webhook';

test('WhatsApp webhook challenge requires the expected subscribe token', () => {
  assert.equal(verifyWhatsAppChallenge('subscribe', 'expected', '12345', 'expected'), '12345');
  assert.equal(verifyWhatsAppChallenge('subscribe', 'wrong', '12345', 'expected'), null);
  assert.equal(verifyWhatsAppChallenge('unsubscribe', 'expected', '12345', 'expected'), null);
});

test('Meta webhook signatures are checked against the unmodified request body', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const appSecret = 'test-app-secret';
  const signature = createHmac('sha256', appSecret).update(body).digest('hex');

  assert.equal(verifyMetaWebhookSignature(body, `sha256=${signature}`, appSecret), true);
  assert.equal(verifyMetaWebhookSignature(`${body} `, `sha256=${signature}`, appSecret), false);
  assert.equal(verifyMetaWebhookSignature(body, 'sha256=invalid', appSecret), false);
});
