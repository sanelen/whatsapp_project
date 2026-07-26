import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceNaturalHambaFlow } from '@/lib/channels/hamba-harness';
import { startHambaFlow, type HambaFlowCatalog } from '@/lib/channels/hamba-flow';

const catalog: HambaFlowCatalog = {
  locations: [
    {
      id: 'quarry-heights',
      name: 'Quarry Heights',
      area: 'Newlands East',
      units: [{ id: 'unit-4', label: 'Unit 4', summary: 'Studio · En-suite', isAvailable: true }],
    },
  ],
};

test('uses a short prospect greeting rather than a brochure dump or caveat', () => {
  const result = advanceNaturalHambaFlow(startHambaFlow().state, 'hello', catalog);
  assert.equal(result.state.step, 'prospect.entry');
  assert.match(result.reply, /looking for a unit to rent/i);
  assert.doesNotMatch(result.reply, /33 Essex|Westrich|Quarry Heights|photos|pamphlet/i);
  assert.equal(result.quickReplies?.length, 1);
  assert.ok(result.reply.length < 220);
  assert.doesNotMatch(result.reply.split('\n').slice(0, 5).join(' '), /no verified|not available/i);
});

test('treats generic help and property enquiries as prospect discovery', () => {
  for (const message of ['Can you help me?', 'What properties do you have?', 'I need a room']) {
    const result = advanceNaturalHambaFlow(startHambaFlow().state, message, catalog);
    assert.equal(result.state.step, 'prospect.location');
    assert.match(result.reply, /33 Essex/);
    assert.equal(result.quickReplies?.length, 3);
    assert.doesNotMatch(result.reply, /maintenance|payment or statement|lease or notice/i);
  }
});

test('understands natural variations asking where properties are located', () => {
  for (const message of [
    'Where are the units?',
    'Where are these units situated?',
    'What locations do you have?',
    'Which areas do you cover?',
    'Do you have anything near Pinetown?',
  ]) {
    const result = advanceNaturalHambaFlow(startHambaFlow().state, message, catalog);
    assert.equal(result.interpretation.intent, 'property_search', message);
    assert.equal(result.state.step, 'prospect.location', message);
    assert.match(result.reply, /33 Essex — .*Berea/, message);
    assert.match(result.reply, /Westrich — Newlands West/, message);
    assert.match(result.reply, /Quarry Heights — Newlands East/, message);
    assert.equal(result.quickReplies?.length, 3, message);
    assert.doesNotMatch(result.reply, /maintenance|choose your unit or room/i, message);
  }
});

test('lets a prospect ask for other locations in different words', () => {
  const selectedState = {
    step: 'prospect.property_action' as const,
    propertyInterest: 'Quarry Heights',
    locationId: 'quarry-heights',
  };

  for (const message of [
    'Do you have anything in other locations?',
    'Anything elsewhere?',
    'Can you show me another location?',
    'What other areas do you cover?',
    'Do you have units somewhere else?',
  ]) {
    const result = advanceNaturalHambaFlow(selectedState, message, catalog);
    assert.equal(result.interpretation.intent, 'property_search', message);
    assert.equal(result.state.step, 'prospect.location', message);
    assert.match(result.reply, /33 Essex — .*Berea/, message);
    assert.match(result.reply, /Westrich — Newlands West/, message);
    assert.match(result.reply, /Quarry Heights — Newlands East/, message);
    assert.equal(result.quickReplies?.length, 3, message);
    assert.doesNotMatch(result.reply, /which unit|maintenance|payment or statement/i, message);
  }
});

test('recognizes property and area aliases then shows only that property', () => {
  const westridge = advanceNaturalHambaFlow(startHambaFlow().state, 'I like Westridge', catalog);
  assert.equal(westridge.state.step, 'prospect.property_action');
  assert.equal(westridge.state.propertyInterest, 'Westrich');
  assert.match(westridge.reply, /Westrich — Newlands West/i);
  assert.match(westridge.reply, /hambatrading\.co\.za\/go\/westrich-pamphlet/i);
  assert.doesNotMatch(westridge.reply, /\/go\/(?:33-essex|quarry-heights)(?:-|$)/i);
  assert.equal(westridge.quickReplies?.length, 3);
});

test('switches the screenshot sentence from stale tenant state to prospect intake', () => {
  const result = advanceNaturalHambaFlow(
    { step: 'tenant.unit', locationId: 'quarry-heights' },
    'I am not in any unit I am looking for one',
    catalog
  );

  assert.equal(result.interpretation.intent, 'property_search');
  assert.equal(result.state.step, 'prospect.location');
  assert.match(result.reply, /Where would you like to stay/);
  assert.equal(result.quickReplies?.length, 3);
  assert.doesNotMatch(result.reply, /choose your unit or room|maintenance|payment|lease/i);
});

test('rechecking availability never enters tenant room selection', () => {
  for (const message of ['One more please check', 'Can you recheck availability?', 'Are you check one more time?']) {
    const result = advanceNaturalHambaFlow(
      { step: 'tenant.category', locationId: 'quarry-heights' },
      message,
      catalog
    );
    assert.notEqual(result.state.step, 'tenant.unit');
    assert.notEqual(result.state.step, 'tenant.category');
    assert.doesNotMatch(result.reply, /which unit|maintenance or repairs|payment or statement/i);
    assert.match(result.reply, /staff recheck|staff confirms|staff should.*recheck/i);
  }
});

test('keeps the LLM hook inside a prospect question without allowing it to choose state', () => {
  const state = { step: 'prospect.budget' as const, propertyInterest: 'Quarry Heights', locationId: 'quarry-heights' };
  const result = advanceNaturalHambaFlow(state, 'Does it have parking?', catalog);
  assert.equal(result.action?.type, 'answer_property_question');
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.routedSteps, ['prospect', 'guardrailed property question']);
});

test('hands existing-tenant requests to staff instead of implementing servicing automation', () => {
  for (const message of ['The tap is leaking in my room', 'I need a rent statement', 'I am locked out']) {
    const result = advanceNaturalHambaFlow(startHambaFlow().state, message, catalog);
    assert.equal(result.state.step, 'handoff');
    assert.equal(result.action?.type, 'handoff');
    assert.match(result.reply, /staff/i);
    assert.doesNotMatch(result.reply, /choose your unit|reply with a number/i);
  }
});

test('hands document and ID requests to staff without collecting sensitive files', () => {
  const result = advanceNaturalHambaFlow(startHambaFlow().state, 'Where do I upload my ID and payslip?', catalog);
  assert.equal(result.state.step, 'handoff');
  assert.equal(result.action?.type, 'handoff');
  assert.match(result.reply, /do not send an ID/i);
});

test('asks which property media is wanted instead of sending every brochure', () => {
  const result = advanceNaturalHambaFlow(
    { step: 'tenant.unit', locationId: 'quarry-heights' },
    'Can you please send me pictures',
    catalog
  );

  assert.equal(result.interpretation.intent, 'property_media');
  assert.equal(result.state.step, 'prospect.location');
  assert.match(result.reply, /which property/i);
  assert.doesNotMatch(result.reply, /https?:\/\//i);
  assert.equal(result.quickReplies?.length, 3);
  assert.deepEqual(result.routedSteps, ['intent', 'prospect', 'location choice']);
});

test('shares only the selected property page, photos and pamphlet', () => {
  const result = advanceNaturalHambaFlow(
    { step: 'prospect.location' },
    'Please send me Quarry Heights pictures',
    catalog
  );

  assert.equal(result.state.step, 'prospect.property_action');
  assert.match(result.reply, /Quarry Heights/i);
  assert.match(result.reply, /hambatrading\.co\.za\/go\/quarry-heights-photos/i);
  assert.match(result.reply, /hambatrading\.co\.za\/go\/quarry-heights-pamphlet/i);
  assert.doesNotMatch(result.reply, /\/go\/(?:33-essex|westrich)(?:-|$)/i);
  assert.deepEqual(result.routedSteps, ['intent', 'prospect', 'selected property media']);
});
