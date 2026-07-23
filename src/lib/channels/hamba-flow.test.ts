import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceHambaFlow, resumeHambaFlowState, startHambaFlow, type HambaFlowCatalog } from '@/lib/channels/hamba-flow';

const catalog: HambaFlowCatalog = {
  locations: [
    {
      id: 'quarry-heights',
      name: 'Quarry Heights',
      area: 'Durban',
      units: [
        { id: 'qh-1', label: 'Room 1', summary: 'Studio, R3 200 per month', isAvailable: true },
        { id: 'qh-2', label: 'Room 2', summary: 'En-suite, R3 600 per month', isAvailable: false },
      ],
    },
    {
      id: 'westrich',
      name: 'Westrich',
      area: 'Durban',
      units: [{ id: 'w-4', label: 'Unit 4', summary: 'One bedroom, R4 500 per month', isAvailable: true }],
    },
  ],
};

test('uses the configured shared greeting when a conversation starts', () => {
  const result = startHambaFlow('Hello from the shared assistant settings.');
  assert.equal(result.reply, 'Hello from the shared assistant settings.');
  assert.equal(result.state.step, 'menu');
});

test('resuming clears terminal handoff states but preserves an active journey', () => {
  assert.deepEqual(resumeHambaFlowState({ step: 'handoff' }), { step: 'menu' });
  assert.deepEqual(resumeHambaFlowState({ step: 'stopped' }), { step: 'menu' });
  assert.deepEqual(
    resumeHambaFlowState({ step: 'prospect.unit', locationId: 'quarry-heights' }),
    { step: 'prospect.unit', locationId: 'quarry-heights' }
  );
});

test('guides a prospect from location to a confirmed viewing request', () => {
  let result = startHambaFlow();
  result = advanceHambaFlow(result.state, '1', catalog);
  assert.equal(result.state.step, 'prospect.location');
  assert.match(result.reply, /Quarry Heights/);

  result = advanceHambaFlow(result.state, 'Quarry Heights', catalog);
  assert.equal(result.state.step, 'prospect.unit');
  assert.match(result.reply, /Room 1/);
  assert.doesNotMatch(result.reply, /Room 2/);

  result = advanceHambaFlow(result.state, '1', catalog);
  result = advanceHambaFlow(result.state, '1', catalog);
  result = advanceHambaFlow(result.state, 'Saturday after 10:00', catalog);
  assert.equal(result.state.step, 'prospect.confirm');
  assert.match(result.reply, /staff member must confirm/i);

  result = advanceHambaFlow(result.state, 'CONFIRM', catalog);
  assert.equal(result.action?.type, 'create_viewing_request');
  assert.deepEqual(result.action, {
    type: 'create_viewing_request',
    locationId: 'quarry-heights',
    unitId: 'qh-1',
    viewingPreference: 'Saturday after 10:00',
  });
});

test('organises a unit-specific tenant maintenance request', () => {
  let result = startHambaFlow();
  result = advanceHambaFlow(result.state, '2', catalog);
  result = advanceHambaFlow(result.state, '2', catalog);
  result = advanceHambaFlow(result.state, 'Unit 4', catalog);
  result = advanceHambaFlow(result.state, 'maintenance', catalog);
  result = advanceHambaFlow(result.state, 'The kitchen tap has leaked since this morning.', catalog);

  assert.deepEqual(result.action, {
    type: 'create_tenant_support_request',
    locationId: 'westrich',
    unitId: 'w-4',
    category: 'maintenance',
    details: 'The kitchen tap has leaked since this morning.',
  });
});

test('routes urgent safety issues to a person without automated decision-making', () => {
  let result = startHambaFlow();
  result = advanceHambaFlow(result.state, '2', catalog);
  result = advanceHambaFlow(result.state, '1', catalog);
  result = advanceHambaFlow(result.state, '1', catalog);
  result = advanceHambaFlow(result.state, '5', catalog);

  assert.equal(result.state.step, 'handoff');
  assert.deepEqual(result.action, { type: 'handoff', reason: 'Tenant selected urgent safety issue' });
  assert.match(result.reply, /emergency service/i);
});

test('honours global HUMAN, STOP and MENU commands', () => {
  const initial = startHambaFlow();
  const stopped = advanceHambaFlow(initial.state, 'STOP', catalog);
  assert.equal(stopped.state.step, 'stopped');
  assert.equal(stopped.action?.type, 'opt_out');

  const paused = advanceHambaFlow(stopped.state, 'anything', catalog);
  assert.match(paused.reply, /paused/i);

  const restarted = advanceHambaFlow(paused.state, 'MENU', catalog);
  const handedOff = advanceHambaFlow(restarted.state, 'HUMAN', catalog);
  assert.equal(handedOff.state.step, 'handoff');
  assert.equal(handedOff.action?.type, 'handoff');
});

test('falls back to staff when no verified availability exists', () => {
  const emptyCatalog: HambaFlowCatalog = {
    locations: [{ id: 'full', name: 'Full Property', area: 'Durban', units: [] }],
  };
  const result = advanceHambaFlow(startHambaFlow().state, '1', emptyCatalog);
  assert.equal(result.state.step, 'menu');
  assert.equal(result.action?.type, 'handoff');
  assert.match(result.reply, /still ask me/i);

  const followUp = advanceHambaFlow(result.state, 'Can you share the property locations?', emptyCatalog);
  assert.equal(followUp.action?.type, 'answer_property_question');
});

test('routes natural property questions to verified retrieval without losing journey context', () => {
  let result = advanceHambaFlow(startHambaFlow().state, 'How much is the deposit?', catalog);
  assert.deepEqual(result.action, {
    type: 'answer_property_question',
    query: 'How much is the deposit?',
    locationId: undefined,
    unitId: undefined,
  });

  result = advanceHambaFlow(startHambaFlow().state, '1', catalog);
  result = advanceHambaFlow(result.state, '1', catalog);
  result = advanceHambaFlow(result.state, 'Does Room 1 have parking?', catalog);
  assert.equal(result.state.step, 'prospect.unit');
  assert.deepEqual(result.action, {
    type: 'answer_property_question',
    query: 'Does Room 1 have parking?',
    locationId: 'quarry-heights',
    unitId: undefined,
  });
});
