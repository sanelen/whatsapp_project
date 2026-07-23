import assert from 'node:assert/strict';
import test from 'node:test';
import { isFirstPendingConversationEvent, resolveHambaPilotTurn } from '@/lib/channels/channel-dispatch';
import { mapHambaCatalog } from '@/lib/channels/hamba-catalog';
import { startHambaFlow } from '@/lib/channels/hamba-flow';

const catalog = mapHambaCatalog(
  [{ id: 'property-1', name: 'Quarry Heights', location: 'Newlands East' }],
  [{
    id: 'unit-1',
    property_id: 'property-1',
    label: 'Unit 4',
    occupancy_status: 'vacant',
    is_blocked: false,
    is_available: true,
    ensuite: true,
    features: ['Wi-Fi'],
    display_order: 1,
  }]
);

test('maps only verified vacant and unblocked units as available', () => {
  assert.equal(catalog.locations[0].units[0].isAvailable, true);
  assert.match(catalog.locations[0].units[0].summary, /En-suite/);
  assert.doesNotMatch(catalog.locations[0].units[0].summary, /rent|deposit/i);
});

test('treats a natural help request as the service overview', () => {
  const turn = resolveHambaPilotTurn(startHambaFlow().state, 'Can you help me?', catalog);
  assert.equal(turn.interpretation.intent, 'services');
  assert.match(turn.reply, /finding a rental/i);
  assert.match(turn.reply, /tenant maintenance/i);
});

test('does not invent an answer for an ungrounded property question', () => {
  const turn = resolveHambaPilotTurn(startHambaFlow().state, 'How much is the deposit?', catalog);
  assert.match(turn.reply, /do not want to guess/i);
  assert.match(turn.reply, /Quarry Heights/);
});

test('serializes rapid messages by event time and deterministic event id', () => {
  const now = Date.parse('2026-07-23T18:02:00.000Z');
  const rows = [
    {
      event_id: 'wamid.second',
      occurred_at: '2026-07-23T18:01:00.000Z',
      processing_status: 'processing' as const,
      updated_at: '2026-07-23T18:01:01.000Z',
    },
    {
      event_id: 'wamid.first',
      occurred_at: '2026-07-23T18:00:59.000Z',
      processing_status: 'processing' as const,
      updated_at: '2026-07-23T18:01:01.000Z',
    },
  ];

  assert.equal(isFirstPendingConversationEvent('wamid.first', rows, now), true);
  assert.equal(isFirstPendingConversationEvent('wamid.second', rows, now), false);
});

test('quarantines a sufficiently stale processing event from the active conversation queue', () => {
  const now = Date.parse('2026-07-23T18:05:00.000Z');
  const rows = [
    {
      event_id: 'wamid.stale',
      occurred_at: '2026-07-23T17:40:00.000Z',
      processing_status: 'processing' as const,
      updated_at: '2026-07-23T17:40:01.000Z',
    },
    {
      event_id: 'wamid.current',
      occurred_at: '2026-07-23T18:04:59.000Z',
      processing_status: 'processing' as const,
      updated_at: '2026-07-23T18:04:59.000Z',
    },
  ];

  assert.equal(isFirstPendingConversationEvent('wamid.current', rows, now), true);
});
