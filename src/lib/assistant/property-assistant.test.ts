import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProspectAssistantReply } from '@/lib/assistant/property-assistant';

test('accepts a concise prospect answer with a staff availability check', () => {
  assert.equal(
    validateProspectAssistantReply('Quarry Heights is in Newlands East. Hamba staff will check and confirm current availability for you.'),
    'Quarry Heights is in Newlands East. Hamba staff will check and confirm current availability for you.'
  );
});

test('rejects model replies that attempt to enter an existing-tenant journey', () => {
  assert.throws(
    () => validateProspectAssistantReply('Which unit or room are you in? Choose maintenance or repairs.'),
    /existing-tenant workflow/
  );
});

test('rejects model replies that attempt to collect ID or payslip documents', () => {
  assert.throws(
    () => validateProspectAssistantReply('Please upload your ID and payslip here.'),
    /collect documents/
  );
});

test('rejects unguarded live availability language', () => {
  assert.throws(
    () => validateProspectAssistantReply('Quarry Heights has vacant rooms available now.'),
    /staff-confirmation guardrail/
  );
});

test('rejects an unguarded final-price statement', () => {
  assert.throws(
    () => validateProspectAssistantReply('The rent is R3,800 per month.'),
    /price without a staff-confirmation/
  );
});

test('accepts structured price guidance when final terms remain staff-confirmed', () => {
  assert.equal(
    validateProspectAssistantReply('The recorded rent guidance is R3,800 per month; Hamba staff will check and confirm the final terms.'),
    'The recorded rent guidance is R3,800 per month; Hamba staff will check and confirm the final terms.'
  );
});

test('rejects a model-created viewing confirmation', () => {
  assert.throws(
    () => validateProspectAssistantReply('Your viewing is booked and confirmed for Friday.'),
    /viewing was confirmed/
  );
});
