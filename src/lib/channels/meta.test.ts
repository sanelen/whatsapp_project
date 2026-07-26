import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetaReplyRequest,
  buildMetaTextRequest,
  normalizeMetaWebhook,
  summarizeMetaWebhook,
} from '@/lib/channels/meta';
import { resolveHambaPilotTurn } from '@/lib/channels/channel-dispatch';
import { mapHambaCatalog } from '@/lib/channels/hamba-catalog';
import { startHambaFlow } from '@/lib/channels/hamba-flow';

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

test('normalizes inbound interactive property reply buttons', () => {
  const events = normalizeMetaWebhook({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-123' },
          messages: [{
            from: '27820000000',
            id: 'wamid.button-1',
            timestamp: '1784368800',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'property:quarry', title: 'Quarry Heights' },
            },
          }],
        },
      }],
    }],
  });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0].message, {
    type: 'interactive',
    text: 'Quarry Heights',
  });
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

test('builds a Meta reply-button request while retaining free-text input', () => {
  const request = buildMetaReplyRequest({
    to: '27820000000',
    body: 'Choose a property, or type its name.',
    phoneNumberId: 'phone-123',
    graphVersion: 'v25.0',
    quickReplies: [
      { id: 'property:essex', title: '33 Essex' },
      { id: 'property:westridge', title: 'Westrich' },
      { id: 'property:quarry', title: 'Quarry Heights' },
    ],
  });

  assert.deepEqual(request.body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '27820000000',
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Choose a property, or type its name.' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'property:essex', title: '33 Essex' } },
          { type: 'reply', reply: { id: 'property:westridge', title: 'Westrich' } },
          { type: 'reply', reply: { id: 'property:quarry', title: 'Quarry Heights' } },
        ],
      },
    },
  });
});

test('rejects an oversized Meta reply-button body before any send attempt', () => {
  assert.throws(
    () => buildMetaReplyRequest({
      to: '27820000000',
      body: 'x'.repeat(1025),
      phoneNumberId: 'phone-123',
      quickReplies: [{ id: 'property:essex', title: '33 Essex' }],
    }),
    /1024 characters or fewer/
  );
});

test('converts the guarded free-text prospect journey into valid Meta reply payloads', () => {
  const catalog = mapHambaCatalog(
    [
      { id: 'property-quarry', name: 'Quarry Heights', location: 'Newlands East' },
      { id: 'property-westrich', name: 'West Rich', location: 'Newlands West' },
      { id: 'property-berea', name: 'berea', location: '33' },
    ],
    []
  );

  const greeting = resolveHambaPilotTurn(startHambaFlow().state, 'Hi', catalog);
  const locations = resolveHambaPilotTurn(greeting.state, 'Where are the units?', catalog);
  const selected = resolveHambaPilotTurn(locations.state, 'Quarry Heights', catalog);
  const parking = resolveHambaPilotTurn(selected.state, 'Does it have parking?', catalog);
  const elsewhere = resolveHambaPilotTurn(parking.state, 'Do you have anything in other locations?', catalog);

  const turns = [greeting, locations, selected, parking, elsewhere];
  const requests = turns.map((turn) => buildMetaReplyRequest({
    to: '27820000000',
    body: turn.reply,
    phoneNumberId: '1175570092310287',
    graphVersion: 'v25.0',
    quickReplies: turn.quickReplies,
  }));

  for (const [index, request] of requests.entries()) {
    const payload = JSON.stringify(request.body);
    assert.match(request.url, /graph\.facebook\.com\/v25\.0\/1175570092310287\/messages/);
    assert.match(payload, /"type":"interactive"/, `turn ${index + 1}`);
    assert.ok(turns[index].reply.length <= 1024, `turn ${index + 1} exceeds Meta's button-body limit`);
    assert.doesNotMatch(payload, /choose your unit or room|maintenance or repairs|payment or statement/i);
  }

  assert.match(JSON.stringify(requests[1].body), /33 Essex/);
  assert.match(JSON.stringify(requests[1].body), /Westrich/);
  assert.match(JSON.stringify(requests[1].body), /Quarry Heights/);
  assert.match(JSON.stringify(requests[2].body), /photos\.app\.goo\.gl/);
  assert.match(JSON.stringify(requests[3].body), /No tenant or guest parking is available/);
  assert.match(JSON.stringify(requests[4].body), /"title":"33 Essex"/);
});
