import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handoffPersistencePatch,
  isFirstPendingConversationEvent,
  resolveConversationEntry,
  resolveHambaPilotTurn,
} from '@/lib/channels/channel-dispatch';
import { mapHambaCatalog } from '@/lib/channels/hamba-catalog';
import { startHambaFlow } from '@/lib/channels/hamba-flow';

const catalog = mapHambaCatalog(
  [{ id: 'property-1', name: 'Quarry Heights', location: 'Newlands East' }],
  [
    {
      id: 'unit-1',
      property_id: 'property-1',
      label: 'Unit 4',
      occupancy_status: 'vacant',
      is_blocked: false,
      is_available: true,
      ensuite: true,
      features: ['Wi-Fi'],
      display_order: 1,
      is_test: false,
    },
    {
      id: 'test-unit-1',
      property_id: 'property-1',
      label: 'TEST ROOM 1',
      occupancy_status: 'vacant',
      is_blocked: false,
      is_available: true,
      ensuite: false,
      features: [],
      display_order: 2,
      is_test: true,
    },
  ]
);

test('excludes internal test rooms from every customer-facing catalogue path', () => {
  assert.deepEqual(catalog.locations[0].units.map((unit) => unit.label), ['Unit 4']);
  assert.match(catalog.locations[0].units[0].summary, /En-suite/);
  assert.doesNotMatch(catalog.locations[0].units[0].summary, /availability must/i);
});

test('treats a natural help request as a concise location choice', () => {
  const turn = resolveHambaPilotTurn(startHambaFlow().state, 'Can you help me?', catalog);
  assert.equal(turn.state.step, 'prospect.location');
  assert.match(turn.reply, /33 Essex/i);
  assert.match(turn.reply, /Where would you like to stay/i);
  assert.doesNotMatch(turn.reply, /photos\.app\.goo\.gl|pamphlet/i);
  assert.ok(turn.reply.length < 300);
  assert.doesNotMatch(turn.reply, /tenant maintenance/i);
});

test('uses a concise safe fallback for a selected-property question', () => {
  const turn = resolveHambaPilotTurn(
    {
      step: 'prospect.property_action',
      propertyInterest: 'Quarry Heights',
      locationId: 'property-1',
    },
    'How much is the deposit?',
    catalog
  );
  assert.match(turn.reply, /staff (?:can|will) confirm/i);
  assert.match(turn.reply, /apply\/check availability/i);
  assert.doesNotMatch(turn.reply, /33 Essex|Westrich|photos\.app\.goo\.gl/i);
  assert.doesNotMatch(turn.reply.split('\n').slice(0, 3).join(' '), /do not want to guess|no verified/i);
});

test('answers a common free-text property question from verified facts without a model key', () => {
  const turn = resolveHambaPilotTurn(
    {
      step: 'prospect.property_action',
      propertyInterest: 'Quarry Heights',
      locationId: 'quarry',
    },
    'Does it have parking?',
    catalog
  );
  assert.match(turn.reply, /No tenant or guest parking is available/i);
  assert.match(turn.reply, /apply\/check availability/i);
  assert.doesNotMatch(turn.reply, /33 Essex|Westrich/i);
});

test('defaults a missing conversation state to prospect intake', () => {
  assert.deepEqual(resolveConversationEntry(null), {
    outcome: 'active',
    state: { step: 'prospect.entry' },
  });
});

test('pilot-only rollout ignores unknown contacts while preserving an approved conversation', () => {
  assert.deepEqual(
    resolveConversationEntry(null, { allowUnknownContacts: false }),
    { outcome: 'not-in-pilot' }
  );

  assert.deepEqual(
    resolveConversationEntry({
      flow_state: { step: 'menu' },
      bot_paused: false,
      pilot_enabled: true,
    }, { allowUnknownContacts: false }),
    {
      outcome: 'active',
      state: { step: 'prospect.location' },
    }
  );
});

test('preserves explicit pilot disablement and human pause as stronger controls', () => {
  const disabled = resolveConversationEntry({
    flow_state: { step: 'tenant.unit' },
    bot_paused: false,
    pilot_enabled: false,
  });
  assert.deepEqual(disabled, { outcome: 'not-in-pilot' });

  const paused = resolveConversationEntry({
    flow_state: { step: 'prospect.budget' },
    bot_paused: true,
    pilot_enabled: true,
  });
  assert.deepEqual(paused, { outcome: 'bot-paused' });
});

test('persists a staff handoff reason and pending audit state', () => {
  assert.deepEqual(
    handoffPersistencePatch(
      { type: 'handoff', reason: 'Customer requested a person' },
      '2026-07-25T21:30:00.000Z'
    ),
    {
      handoff_requested_at: '2026-07-25T21:30:00.000Z',
      handoff_reason: 'Customer requested a person',
      handoff_status: 'pending',
    }
  );
});

test('does not invent a handoff audit record for an ordinary prospect action', () => {
  assert.deepEqual(
    handoffPersistencePatch({
      type: 'answer_property_question',
      query: 'What is nearby?',
      locationId: 'property-1',
    }),
    {
      handoff_requested_at: null,
      handoff_reason: '',
      handoff_status: 'none',
    }
  );
});

test('normalizes a stale enabled tenant state to prospect intake', () => {
  const entry = resolveConversationEntry({
    flow_state: { step: 'tenant.category', locationId: 'property-1' },
    bot_paused: false,
    pilot_enabled: true,
  });
  assert.deepEqual(entry, { outcome: 'active', state: { step: 'prospect.location' } });
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
