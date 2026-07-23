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
      units: [{ id: 'unit-4', label: 'Unit 4', summary: 'Demo unit; staff confirms live facts.', isAvailable: true }],
    },
  ],
};

test('uses the saved shared greeting for natural WhatsApp greetings and MENU', () => {
  const greeting = 'Welcome to the shared Hamba assistant.';
  const hello = advanceNaturalHambaFlow(startHambaFlow().state, 'hello', catalog, { greeting });
  const menu = advanceNaturalHambaFlow({ step: 'tenant.details' }, 'MENU', catalog, { greeting });
  assert.equal(hello.reply, greeting);
  assert.equal(menu.reply, greeting);
});

test('explains Hamba services without forcing a numbered menu', () => {
  const result = advanceNaturalHambaFlow(startHambaFlow().state, 'What services do you offer?', catalog);
  assert.equal(result.interpretation.intent, 'services');
  assert.match(result.reply, /finding a rental/);
  assert.equal(result.state.step, 'menu');
});

test('uses natural location and unit mentions to reach the viewing step', () => {
  const result = advanceNaturalHambaFlow(
    startHambaFlow().state,
    'I want a viewing for Unit 4 at Quarry Heights',
    catalog
  );
  assert.equal(result.interpretation.intent, 'viewing');
  assert.equal(result.interpretation.confidence, 'high');
  assert.deepEqual(result.interpretation.signals, ['viewing', 'Quarry Heights', 'Unit 4']);
  assert.equal(result.state.step, 'prospect.viewing_time');
  assert.deepEqual(result.routedSteps, ['intent', 'prospect', 'location', 'unit', 'viewing']);
});

test('routes a natural maintenance report into the unit-specific support journey', () => {
  const result = advanceNaturalHambaFlow(
    startHambaFlow().state,
    'The tap is leaking in Unit 4 at Quarry Heights',
    catalog
  );
  assert.equal(result.interpretation.intent, 'maintenance');
  assert.equal(result.state.step, 'tenant.details');
  assert.equal(result.state.tenantCategory, 'maintenance');
});

test('keeps document checks advisory and starts from a property choice', () => {
  const result = advanceNaturalHambaFlow(startHambaFlow().state, 'I only have two payslips to upload', catalog);
  assert.equal(result.interpretation.intent, 'documents');
  assert.match(result.reply, /staff member makes the final housing decision/);
  assert.equal(result.state.step, 'prospect.location');
});

test('preserves the global human handoff command', () => {
  const result = advanceNaturalHambaFlow(startHambaFlow().state, 'human', catalog);
  assert.equal(result.interpretation.intent, 'human');
  assert.equal(result.state.step, 'handoff');
  assert.equal(result.action?.type, 'handoff');
});

test('shares approved pamphlets and locations from inside any journey step', () => {
  const result = advanceNaturalHambaFlow(
    { step: 'tenant.unit', locationId: 'quarry-heights' },
    'Can you please send me pictures',
    catalog
  );

  assert.equal(result.interpretation.intent, 'property_media');
  assert.equal(result.state.step, 'menu');
  assert.match(result.reply, /hamba-essex-advert\.pdf/);
  assert.match(result.reply, /hamba-westrich-advert\.pdf/);
  assert.match(result.reply, /hamba-quarry-heights-advert\.pdf/);
  assert.match(result.reply, /33 Essex Road/);
  assert.match(result.reply, /28 Nkunzana Grove/);
  assert.deepEqual(result.routedSteps, ['global property media']);
});
