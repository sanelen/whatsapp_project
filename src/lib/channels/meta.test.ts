import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMetaTextRequest, normalizeMetaWebhook, summarizeMetaWebhook } from '@/lib/channels/meta';

test('normalizes Meta WhatsApp text messages into provider-neutral events', () => {
  const events = normalizeMetaWebhook({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-123' },
          contacts: [{ profile: { name: 'Test Prospect' }, wa_id: '27820000000' }],
          messages: [{
            from: '27820000000',
            id: 'wamid.message-1',
            timestamp: '1784368800',
            type: 'text',
            text: { body: 'I am interested in Quarry Heights' },
          }],
        },
      }],
    }],
  });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    provider: 'meta',
    channel: 'whatsapp',
    eventId: 'wamid.message-1',
    eventType: 'message.received',
    direction: 'inbound',
    connectionExternalId: 'phone-123',
    senderExternalId: '27820000000',
    recipientExternalId: 'phone-123',
    providerMessageId: 'wamid.message-1',
    occurredAt: new Date(1784368800 * 1000).toISOString(),
    contactName: 'Test Prospect',
    message: { type: 'text', text: 'I am interested in Quarry Heights' },
    raw: {
      metadata: { phone_number_id: 'phone-123' },
      contact: { profile: { name: 'Test Prospect' }, wa_id: '27820000000' },
      message: {
        from: '27820000000',
        id: 'wamid.message-1',
        timestamp: '1784368800',
        type: 'text',
        text: { body: 'I am interested in Quarry Heights' },
      },
    },
  });
});

test('normalizes delivery statuses with status-specific idempotency keys', () => {
  const events = normalizeMetaWebhook({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-123' },
          statuses: [{
            id: 'wamid.message-1',
            status: 'delivered',
            timestamp: '1784368810',
            recipient_id: '27820000000',
          }],
        },
      }],
    }],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 'wamid.message-1:delivered:1784368810');
  assert.equal(events[0].eventType, 'message.status');
  assert.equal(events[0].deliveryStatus, 'delivered');
});

test('ignores unsupported Meta objects and malformed message identifiers', () => {
  assert.deepEqual(normalizeMetaWebhook({ object: 'page', entry: [] }), []);
  assert.deepEqual(normalizeMetaWebhook({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { messages: [{ type: 'text' }] } }] }],
  }), []);
});

test('summarizes non-message Meta webhooks without logging private payload content', () => {
  assert.deepEqual(summarizeMetaWebhook({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'account_update', value: { event: 'PARTNER_APP_INSTALLED' } }] }],
  }), {
    object: 'whatsapp_business_account',
    entryCount: 1,
    changeCount: 1,
    fields: ['account_update'],
    messageCount: 0,
    statusCount: 0,
  });
});

test('builds a Meta Graph API text request without sending it', () => {
  const request = buildMetaTextRequest({
    to: '27820000000',
    body: 'Hello from Hamba',
    phoneNumberId: 'phone/123',
    graphVersion: 'v25.0',
  });

  assert.equal(request.url, 'https://graph.facebook.com/v25.0/phone%2F123/messages');
  assert.deepEqual(request.body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '27820000000',
    type: 'text',
    text: { preview_url: false, body: 'Hello from Hamba' },
  });
});
