import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStayOwnership, type StayOwnershipRow } from './stay-ownership';

function stay(overrides: Partial<StayOwnershipRow> & Pick<StayOwnershipRow, 'id'>): StayOwnershipRow {
  return {
    id: overrides.id,
    status: overrides.status ?? 'active',
    startsOn: overrides.startsOn ?? null,
    endsOn: overrides.endsOn ?? null,
    closedAt: overrides.closedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

test('first-ever tenant is valid without inventing a previous stay', () => {
  const firstTenant = stay({ id: 'first', startsOn: '2026-02-01' });
  const result = resolveStayOwnership({
    stays: [firstTenant],
    billingPeriodStart: '2026-04-01',
    transactionDates: ['2026-03-29'],
  });

  assert.equal(result.kind, 'resolved');
  if (result.kind === 'resolved') {
    assert.equal(result.stay.id, 'first');
    assert.equal(result.basis, 'billing_period');
  }
});

test('retrospective billing period resolves the ended tenant instead of the current tenant', () => {
  const result = resolveStayOwnership({
    stays: [
      stay({ id: 'previous', status: 'ended', startsOn: '2026-01-01', endsOn: '2026-06-30' }),
      stay({ id: 'current', startsOn: '2026-07-01', createdAt: '2026-07-01T00:00:00.000Z' }),
    ],
    billingPeriodStart: '2026-04-01',
    transactionDates: ['2026-03-30'],
  });

  assert.equal(result.kind, 'resolved');
  if (result.kind === 'resolved') assert.equal(result.stay.id, 'previous');
});

test('assigned future billing period owns an early payment made before move-in', () => {
  const result = resolveStayOwnership({
    stays: [
      stay({ id: 'departing', status: 'ended', startsOn: '2026-01-01', endsOn: '2026-04-30' }),
      stay({ id: 'incoming', startsOn: '2026-05-01', createdAt: '2026-05-01T00:00:00.000Z' }),
    ],
    billingPeriodStart: '2026-05-01',
    transactionDates: ['2026-04-28'],
  });

  assert.equal(result.kind, 'resolved');
  if (result.kind === 'resolved') {
    assert.equal(result.stay.id, 'incoming');
    assert.equal(result.basis, 'billing_period');
  }
});

test('overlapping stay boundaries require an operator correction', () => {
  const result = resolveStayOwnership({
    stays: [
      stay({ id: 'one', startsOn: '2026-01-01', endsOn: '2026-05-10' }),
      stay({ id: 'two', startsOn: '2026-05-01', createdAt: '2026-05-01T00:00:00.000Z' }),
    ],
    billingPeriodStart: '2026-05-01',
  });

  assert.deepEqual(result, {
    kind: 'ambiguous',
    candidateIds: ['two', 'one'],
    date: '2026-05-01',
    basis: 'billing_period',
  });
});

test('dated stays with no coverage do not silently absorb historical money', () => {
  const result = resolveStayOwnership({
    stays: [stay({ id: 'current', startsOn: '2026-07-01' })],
    billingPeriodStart: '2026-04-01',
    transactionDates: ['2026-03-30'],
  });

  assert.equal(result.kind, 'none');
});
