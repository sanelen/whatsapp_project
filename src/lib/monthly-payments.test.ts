import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyPaymentsDashboardSnapshot,
  computeDepositSplitSuggestion,
  type MonthlyPaymentsOrganizationRow,
  type MonthlyPaymentsPeriodRow,
  type MonthlyPaymentsPropertyRow,
  type MonthlyPaymentsReferenceRow,
  type MonthlyPaymentsUnitRow,
} from './monthly-payments';

const organizations: MonthlyPaymentsOrganizationRow[] = [
  { id: 'org-1', name: 'Hamba Trading' },
];

const properties: MonthlyPaymentsPropertyRow[] = [
  { id: 'prop-1', organization_id: 'org-1', name: 'Query Heights', location: 'Durban North' },
  { id: 'prop-2', organization_id: 'org-1', name: 'Berea', location: 'Durban' },
];

const units: MonthlyPaymentsUnitRow[] = [
  {
    id: 'unit-1',
    property_id: 'prop-1',
    label: 'SX',
    rent_amount: 4500,
    occupancy_status: 'occupied',
    is_blocked: false,
  },
  {
    id: 'unit-2',
    property_id: 'prop-1',
    label: 'S2',
    rent_amount: 2200,
    occupancy_status: 'occupied',
    is_blocked: false,
  },
  {
    id: 'unit-3',
    property_id: 'prop-2',
    label: 'R2',
    rent_amount: 1800,
    occupancy_status: 'vacant',
    is_blocked: true,
  },
];

const periods: MonthlyPaymentsPeriodRow[] = [
  {
    id: 'period-1',
    unit_id: 'unit-1',
    period_start: '2026-06-01',
    expected_amount: 4500,
    status: 'paid',
    is_blocked: false,
  },
  {
    id: 'period-2',
    unit_id: 'unit-2',
    period_start: '2026-06-01',
    expected_amount: 2200,
    status: 'overdue',
    is_blocked: false,
  },
  {
    id: 'period-3',
    unit_id: 'unit-3',
    period_start: '2026-06-01',
    expected_amount: 0,
    status: 'blocked',
    is_blocked: true,
  },
  {
    id: 'period-4',
    unit_id: 'unit-1',
    period_start: '2026-05-01',
    expected_amount: 4500,
    status: 'paid',
    is_blocked: false,
  },
];

const references: MonthlyPaymentsReferenceRow[] = [
  {
    id: 'ref-1',
    organization_id: 'org-1',
    property_id: 'prop-1',
    unit_id: 'unit-1',
    unit_payment_period_id: 'period-1',
    reference: 'DEP-4471',
    amount: 4500,
    received_at: '2026-06-12',
    signed_off: true,
  },
  {
    id: 'ref-2',
    organization_id: 'org-1',
    property_id: 'prop-1',
    unit_id: null,
    unit_payment_period_id: null,
    reference: 'UNMATCHED-1',
    amount: 2200,
    received_at: '2026-06-13',
    signed_off: false,
  },
  {
    id: 'ref-3',
    organization_id: 'org-1',
    property_id: 'prop-1',
    unit_id: 'unit-1',
    unit_payment_period_id: 'period-4',
    reference: 'MAY-DEP',
    amount: 4500,
    received_at: '2026-05-10',
    signed_off: true,
  },
];

test('buildMonthlyPaymentsDashboardSnapshot summarizes rolling totals and unmatched references', () => {
  const snapshot = buildMonthlyPaymentsDashboardSnapshot(
    { organizations, properties, units, periods, references },
    { currentDate: new Date('2026-06-20T12:00:00.000Z') }
  );

  assert.equal(snapshot.organizationLabel, 'Hamba Trading');
  assert.equal(snapshot.monthLabel, 'June 2026');
  assert.equal(snapshot.rollingTotal.collectedAmount, 4500);
  assert.equal(snapshot.rollingTotal.expectedAmount, 6700);
  assert.equal(snapshot.rollingTotal.blockedCount, 1);
  assert.equal(snapshot.rollingTotal.overdueCount, 1);
  assert.equal(snapshot.unmatchedReferenceCount, 0);
  assert.equal(snapshot.recentMonths.find((month) => month.key === '2026-06')?.collectedAmount, 4500);
  assert.equal(snapshot.locations[0].name, 'Query Heights');
  assert.equal(snapshot.locations[0].paidCount, 1);
  assert.equal(snapshot.locations[0].dueCount, 1);
  assert.equal(snapshot.recentMonths.find((month) => month.key === '2026-06')?.rollingTotal.paidCount, 1);
});

test('buildMonthlyPaymentsDashboardSnapshot marks missing properties as empty setup', () => {
  const snapshot = buildMonthlyPaymentsDashboardSnapshot(
    { organizations: [], properties: [], units: [], periods: [], references: [] },
    { currentDate: new Date('2026-06-20T12:00:00.000Z') }
  );

  assert.equal(snapshot.setupState, 'empty');
  assert.equal(snapshot.locations.length, 0);
});

test('computeDepositSplitSuggestion splits an overpayment into rent + deposit contribution', () => {
  assert.deepEqual(
    computeDepositSplitSuggestion({ receivedAmount: 5000, expectedAmount: 4500, depositAmount: 4500 }),
    { rentPortion: 4500, depositPortion: 500, surplusAmount: 0 }
  );
});

test('computeDepositSplitSuggestion caps the deposit contribution at the configured deposit', () => {
  assert.deepEqual(
    computeDepositSplitSuggestion({ receivedAmount: 7500, expectedAmount: 4500, depositAmount: 2000 }),
    { rentPortion: 4500, depositPortion: 2000, surplusAmount: 1000 }
  );
});

test('computeDepositSplitSuggestion returns null when there is no overpayment', () => {
  assert.equal(
    computeDepositSplitSuggestion({ receivedAmount: 4500, expectedAmount: 4500, depositAmount: 2000 }),
    null
  );
  assert.equal(
    computeDepositSplitSuggestion({ receivedAmount: 4000, expectedAmount: 4500, depositAmount: 2000 }),
    null
  );
  assert.equal(computeDepositSplitSuggestion({ receivedAmount: null, expectedAmount: 4500, depositAmount: 2000 }), null);
});

test('computeDepositSplitSuggestion returns null when the room has no configured deposit or expected rent', () => {
  assert.equal(
    computeDepositSplitSuggestion({ receivedAmount: 5000, expectedAmount: 4500, depositAmount: 0 }),
    null
  );
  assert.equal(
    computeDepositSplitSuggestion({ receivedAmount: 5000, expectedAmount: 0, depositAmount: 2000 }),
    null
  );
});

test('computeDepositSplitSuggestion rounds portions to cents', () => {
  assert.deepEqual(
    computeDepositSplitSuggestion({ receivedAmount: 4600.555, expectedAmount: 4500.111, depositAmount: 2000 }),
    { rentPortion: 4500.11, depositPortion: 100.44, surplusAmount: 0 }
  );
});
