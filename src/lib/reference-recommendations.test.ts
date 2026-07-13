import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreReferenceForUnit, sortReferencesForUnit } from './reference-recommendations';
import type { ReferencePoolRow, UnitTableMatchRule } from './monthly-payments';

const rule: UnitTableMatchRule = {
  id: 'rule-7',
  matcherType: 'reference_contains',
  matcherValue: 'Room7,QHROOM7 ,07 QH07',
  amountValue: null,
  isActive: true,
};
const room7 = {
  label: 'Room 07',
  expectedAmount: 2200,
  expectedReference: 'QHROOM7,QHRoom07',
  matchKeywords: [],
  matchRules: [rule],
};
const reference = (id: string, value: string): ReferencePoolRow => ({
  id,
  reference: value,
  amount: 2200,
  transactionDate: '2026-06-25',
  accountSuffix: '2815',
  payerName: value,
  signedOff: false,
});

test('Room 07 zero-padded primary reference is a strong recommendation', () => {
  const score = scoreReferenceForUnit(room7, reference('qh-07', 'Payment Received: Qhroom07'));
  assert.ok(score >= 90, `expected a strong recommendation, received score ${score}`);
});

test('Room 07 candidate ranks above another equal-amount room reference', () => {
  const ranked = sortReferencesForUnit(room7, [
    reference('qh-08', 'Payment Received: Qhroom08'),
    reference('qh-07', 'Payment Received: Qhroom07'),
  ]);
  assert.equal(ranked[0].reference.id, 'qh-07');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('bare short room number is not enough for a strong recommendation', () => {
  const score = scoreReferenceForUnit(
    { ...room7, expectedReference: '', matchRules: [] },
    reference('generic', 'Payment 07')
  );
  assert.ok(score < 90);
});
