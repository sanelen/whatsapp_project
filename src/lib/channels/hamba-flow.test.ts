import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceHambaFlow,
  resumeHambaFlowState,
  startHambaFlow,
  type HambaFlowCatalog,
} from '@/lib/channels/hamba-flow';

const catalog: HambaFlowCatalog = {
  locations: [
    {
      id: 'quarry-heights',
      name: 'Quarry Heights',
      area: 'Newlands East',
      units: [{ id: 'qh-1', label: 'Room 1', summary: 'Studio · En-suite', isAvailable: false }],
    },
    {
      id: 'westrich',
      name: 'Westrich',
      area: 'Newlands West',
      units: [],
    },
  ],
};

test('starts every unknown contact with one short rental question', () => {
  const result = startHambaFlow();
  assert.equal(result.state.step, 'prospect.entry');
  assert.match(result.reply, /Welcome to Hamba Trading Property Rentals/i);
  assert.match(result.reply, /looking for a unit to rent/i);
  assert.deepEqual(result.quickReplies, [
    { id: 'prospect:start', title: 'Yes, find me a unit' },
  ]);
  assert.doesNotMatch(result.reply, /33 Essex|Westrich|Quarry Heights|photos|pamphlet/i);
  assert.ok(result.reply.length < 220);
  assert.doesNotMatch(result.reply.split('\n').slice(0, 4).join(' '), /no verified|unavailable|caveat/i);
});

test('normalizes stale tenant and unit states back to prospect intake', () => {
  assert.deepEqual(resumeHambaFlowState({ step: 'tenant.unit', locationId: 'quarry-heights' }), {
    step: 'prospect.location',
  });
  assert.deepEqual(
    resumeHambaFlowState({ step: 'prospect.budget', propertyInterest: '33 Essex' }),
    { step: 'prospect.budget', propertyInterest: '33 Essex' }
  );
});

test('collects property, budget and move-in date before creating a staff follow-up lead', () => {
  let result = advanceHambaFlow(startHambaFlow().state, 'Quarry Heights', catalog);
  assert.deepEqual(result.state, {
    step: 'prospect.property_action',
    propertyInterest: 'Quarry Heights',
    locationId: 'quarry-heights',
  });
  assert.match(result.reply, /R2,200 per month/i);
  assert.match(result.reply, /hambatrading\.co\.za\/go\/qh-photos/i);
  assert.match(result.reply, /staff will confirm/i);
  assert.equal(result.quickReplies?.length, 3);

  result = advanceHambaFlow(result.state, 'Apply / availability', catalog);
  assert.equal(result.state.step, 'prospect.budget');
  assert.match(result.reply, /monthly rental budget/i);

  result = advanceHambaFlow(result.state, 'around R2,500 per month', catalog);
  assert.equal(result.state.step, 'prospect.move_in');
  assert.match(result.reply, /move in/i);

  result = advanceHambaFlow(result.state, '1 August', catalog);
  assert.equal(result.state.step, 'prospect.complete');
  assert.deepEqual(result.action, {
    type: 'create_prospect_lead',
    locationId: 'quarry-heights',
    propertyInterest: 'Quarry Heights',
    budget: 'around R2,500 per month',
    moveInDate: '1 August',
  });
  assert.match(result.reply, /staff will check current availability and follow up/i);
  assert.match(result.reply, /Nothing is reserved or confirmed/i);
});

test('accepts both a quick-reply property id and a typed property name', () => {
  const quickReply = advanceHambaFlow(startHambaFlow().state, 'property:quarry', catalog);
  assert.equal(quickReply.state.step, 'prospect.property_action');
  assert.equal(quickReply.state.propertyInterest, 'Quarry Heights');

  const freeText = advanceHambaFlow(startHambaFlow().state, 'Westridge', catalog);
  assert.equal(freeText.state.step, 'prospect.property_action');
  assert.equal(freeText.state.propertyInterest, 'Westrich');
});

test('invites a free-text question without letting the model choose the next step', () => {
  const selected = advanceHambaFlow(startHambaFlow().state, 'Quarry Heights', catalog);
  const invited = advanceHambaFlow(selected.state, 'Ask a question', catalog);
  assert.equal(invited.state.step, 'prospect.question');
  assert.match(invited.reply, /what would you like to know/i);

  const question = advanceHambaFlow(invited.state, 'parking', catalog);
  assert.equal(question.state.step, 'prospect.question');
  assert.equal(question.action?.type, 'answer_property_question');
  assert.equal(
    question.action?.type === 'answer_property_question' ? question.action.query : '',
    'parking'
  );
  assert.equal(question.quickReplies?.length, 3);
});

test('answers questions conversationally without letting the model advance deterministic intake', () => {
  const state = {
    step: 'prospect.budget' as const,
    propertyInterest: 'Westrich',
    locationId: 'westrich',
  };
  const result = advanceHambaFlow(state, 'Does it have parking?', catalog);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.action, {
    type: 'answer_property_question',
    query: 'Does it have parking?',
    propertyInterest: 'Westrich',
    locationId: 'westrich',
  });
});

test('never gates the prospect welcome on a database availability flag', () => {
  const emptyCatalog: HambaFlowCatalog = {
    locations: [{ id: 'full', name: 'Full Property', area: 'Durban', units: [] }],
  };
  const result = advanceHambaFlow(startHambaFlow().state, '33 Essex', emptyCatalog);
  assert.equal(result.state.step, 'prospect.property_action');
  assert.match(result.reply, /staff will confirm/i);
  assert.doesNotMatch(result.reply, /no verified available|no vacancy/i);
});

test('honours HUMAN, STOP and MENU without exposing another automated journey', () => {
  const initial = startHambaFlow();
  const stopped = advanceHambaFlow(initial.state, 'STOP', catalog);
  assert.equal(stopped.state.step, 'stopped');
  assert.equal(stopped.action?.type, 'opt_out');

  const paused = advanceHambaFlow(stopped.state, 'anything', catalog);
  assert.match(paused.reply, /paused/i);

  const restarted = advanceHambaFlow(paused.state, 'MENU', catalog);
  assert.equal(restarted.state.step, 'prospect.entry');
  const handedOff = advanceHambaFlow(restarted.state, 'HUMAN', catalog);
  assert.equal(handedOff.state.step, 'handoff');
  assert.equal(handedOff.action?.type, 'handoff');
});
