import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAutoMatch, type AutoMatchHint, type AutoMatchReference } from './auto-match';

// Functional decision-rule tests for the auto-match job (owner request
// 2026-07-02). Map: docs/testing/functional-test-map.md

const hint = (over: Partial<AutoMatchHint>): AutoMatchHint => ({
  id: 'h1',
  unit_id: 'unit-1',
  property_id: 'prop-1',
  matcher_type: 'reference_contains',
  matcher_value: 'QHROOM1',
  amount_value: null,
  priority: 10,
  is_active: true,
  ...over,
});

const ref = (over: Partial<AutoMatchReference>): AutoMatchReference => ({
  id: 'r1',
  property_id: 'prop-1',
  reference: 'QHROOM1 JULY',
  payerName: '',
  amount: 2200,
  ...over,
});

test('FR-2.4 [decision: auto-match, never auto-sign-off] a unique rule hit resolves to a match', () => {
  const result = resolveAutoMatch(ref({}), [hint({})]);
  assert.deepEqual(
    result,
    { kind: 'match', unitId: 'unit-1', hintId: 'h1' },
    'BROKEN RULE: a reference matching exactly one unit was not auto-matched. Operator impact: San matches every import by hand. Action: check resolveAutoMatch.'
  );
});

test('FR-2.4 [decision: specificity wins] "QHROOM15" matches Room 15, not Room 1, despite the substring overlap', () => {
  const result = resolveAutoMatch(ref({ reference: 'QHROOM15' }), [
    hint({ matcher_value: 'Room1,QHROOM1 ,01 QH01' }),
    hint({ id: 'h15', unit_id: 'unit-15', matcher_value: 'Room15,QHROOM15 ,15 QH15' }),
  ]);
  assert.deepEqual(
    result,
    { kind: 'match', unitId: 'unit-15', hintId: 'h15' },
    'BROKEN RULE: substring collision (Room1 inside Room15) beat token specificity. Operator impact: rent lands on the wrong room. Action: exact/longest-token dominance in resolveAutoMatch.'
  );
});

test('FR-2.4 [decision: ambiguity stays human] equally-specific hits on different units mean NO auto-match', () => {
  const result = resolveAutoMatch(ref({ reference: 'ROOMA ROOMB TRANSFER' }), [
    hint({ matcher_value: 'ROOMA' }),
    hint({ id: 'h2', unit_id: 'unit-2', matcher_value: 'ROOMB' }),
  ]);
  assert.equal(
    result.kind,
    'ambiguous',
    'BROKEN RULE: an ambiguous reference was auto-matched to one of several equal candidates. Operator impact: money lands on the wrong room silently. Action: ties must fall back to operator review.'
  );
});

test('FR-2.4 [decision: rules are token lists] comma/space separated rule values match on any token', () => {
  // "Reference: QHRoom14" must hit the Room 14 rule written as a token list.
  const result = resolveAutoMatch(ref({ reference: 'Reference: QHRoom14' }), [
    hint({ matcher_value: 'Room1,QHROOM1 ,01 QH01' }),
    hint({ id: 'h14', unit_id: 'unit-14', matcher_value: 'Room14,QHROOM14 ,14 QH14' }),
  ]);
  assert.deepEqual(
    result,
    { kind: 'match', unitId: 'unit-14', hintId: 'h14' },
    'BROKEN RULE: rule values are being treated as one literal string instead of a token list. Operator impact: hand-written rules never fire and every import needs manual matching. Action: tokenizeMatcherValue must split on commas/spaces.'
  );
});

test('FR-2.4 [decision: short tokens are noise] tokens under 4 characters never fire', () => {
  const result = resolveAutoMatch(ref({ reference: 'PAYMENT 01' }), [hint({ matcher_value: '01,QH' })]);
  assert.equal(
    result.kind,
    'none',
    'BROKEN RULE: a 2-character token matched. Operator impact: half the bank statement auto-matches to one room. Action: enforce minimum token length in tokenizeMatcherValue.'
  );
});

test('FR-2.4 [decision: rules stay scoped] a rule from another property never claims the reference', () => {
  const result = resolveAutoMatch(ref({}), [hint({ property_id: 'prop-OTHER' })]);
  assert.equal(
    result.kind,
    'none',
    'BROKEN RULE: cross-property rule leakage. Operator impact: rent lands on another building. Action: enforce property scoping in resolveAutoMatch.'
  );
});

test('FR-2.4 [decision: no empty-token matches] blank or inactive rules never fire', () => {
  assert.equal(resolveAutoMatch(ref({}), [hint({ matcher_value: '   ' })]).kind, 'none');
  assert.equal(resolveAutoMatch(ref({}), [hint({ is_active: false })]).kind, 'none');
  assert.equal(resolveAutoMatch(ref({}), [hint({ unit_id: null })]).kind, 'none');
});

test('FR-2.4 [decision: several rules, one unit] multiple rules agreeing on the same unit still auto-match', () => {
  const result = resolveAutoMatch(ref({}), [
    hint({}),
    hint({ id: 'h2', matcher_type: 'amount_equals', matcher_value: '', amount_value: 2200 }),
  ]);
  assert.deepEqual(result, { kind: 'match', unitId: 'unit-1', hintId: 'h1' });
});
