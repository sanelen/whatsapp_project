import assert from 'node:assert/strict';
import test from 'node:test';
import { toChannelEventRows } from '@/lib/channels/event-store';

test('maps normalized events to idempotent protected event rows', () => {
  const rows = toChannelEventRows([{
    provider: 'meta',
    channel: 'whatsapp',
    eventId: 'wamid.1',
    eventType: 'message.received',
    direction: 'inbound',
    connectionExternalId: 'phone-1',
    senderExternalId: 'prospect-1',
    recipientExternalId: 'phone-1',
    providerMessageId: 'wamid.1',
    occurredAt: '2026-07-18T10:00:00.000Z',
    message: { type: 'text', text: 'Hello' },
    raw: { message: { id: 'wamid.1' } },
  }]);

  assert.deepEqual(rows, [{
    provider: 'meta',
    channel: 'whatsapp',
    event_id: 'wamid.1',
    event_type: 'message.received',
    direction: 'inbound',
    external_connection_id: 'phone-1',
    external_sender_id: 'prospect-1',
    external_recipient_id: 'phone-1',
    provider_message_id: 'wamid.1',
    processing_status: 'received',
    processed_at: null,
    occurred_at: '2026-07-18T10:00:00.000Z',
    payload: {
      message: { id: 'wamid.1' },
      normalized_message: { type: 'text', text: 'Hello' },
    },
  }]);
});

test('marks non-actionable status events processed at ingestion', () => {
  const rows = toChannelEventRows([{
    provider: 'meta',
    channel: 'whatsapp',
    eventId: 'wamid.status:delivered',
    eventType: 'message.status',
    direction: 'status',
    connectionExternalId: 'phone-id',
    senderExternalId: 'phone-id',
    recipientExternalId: 'tester',
    providerMessageId: 'wamid.status',
    occurredAt: '2026-07-23T18:00:00.000Z',
    deliveryStatus: 'delivered',
    raw: { status: 'delivered' },
  }]);

  assert.equal(rows[0].processing_status, 'processed');
  assert.ok(rows[0].processed_at);
});
