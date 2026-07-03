import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyPaymentsDashboardSnapshot,
  computeDepositSplitSuggestion,
  computeUnitStatus,
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

// ---------------------------------------------------------------------------
// Functional decision-rule tests (owner rulings, 2026-07-02).
// Each test protects a business outcome, not an element. If one fails, the
// failure message says which decision rule broke and what the operator impact
// is — fix the rule, don't weaken the test. Map: docs/testing/functional-test-map.md
// ---------------------------------------------------------------------------

const unitStatusBase = {
  occupancyStatus: 'occupied' as const,
  isBlocked: false,
  expectedAmount: 4500,
  dueDate: '2026-06-08',
  now: new Date('2026-06-05T12:00:00.000Z'),
};

test('FR-2.5 [decision: paid = signed-off only] a full match awaiting sign-off is pending, not paid', () => {
  const unsigned = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [{ amount: 4500, signed_off: false }],
  });
  assert.equal(
    unsigned.status,
    'pending',
    'BROKEN RULE: matched-but-unsigned money is being reported as paid. Operator impact: dashboard overstates collected rent and San chases nobody. Action: restore sign-off gate in computeUnitStatus.'
  );
  assert.equal(unsigned.pendingAmount, 4500);
  assert.equal(unsigned.signedOffAmount, 0);

  const signed = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [{ amount: 4500, signed_off: true }],
  });
  assert.equal(
    signed.status,
    'paid',
    'BROKEN RULE: signed-off full rent is not reading as paid. Operator impact: paid units appear on the chase list. Action: check signed-off detection in computeUnitStatus.'
  );
  assert.equal(signed.signedOffAmount, 4500);
});

test('FR-2.5/FR-2.8 [decision: period truth aggregates all matched refs] two smaller matches that sum to rent are pending until all are signed off', () => {
  const pending = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [
      { amount: 2000, signed_off: false },
      { amount: 2500, signed_off: false },
    ],
  });
  assert.equal(
    pending.status,
    'pending',
    'BROKEN RULE: multiple refs that cover the rent are still being judged one-by-one. Operator impact: a fully covered month still looks unpaid until someone inspects raw refs. Action: aggregate all matched references before deciding row status.'
  );

  const signed = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [
      { amount: 2000, signed_off: true },
      { amount: 2500, signed_off: true },
    ],
  });
  assert.equal(
    signed.status,
    'paid',
    'BROKEN RULE: full coverage across several signed-off refs is not settling as paid. Operator impact: split-pay months never leave the chase list. Action: use the aggregate matched amount in computeUnitStatus.'
  );
});

test('FR-2.8 [decision: under-payment = partial + outstanding] a short payment shows exactly what is still owed', () => {
  const result = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [{ amount: 3000, signed_off: false }],
  });
  assert.equal(
    result.status,
    'partial',
    'BROKEN RULE: under-payments are not classified partial. Operator impact: San cannot see who is short vs who mismatched. Action: restore partial branch in computeUnitStatus.'
  );
  assert.equal(
    result.outstandingAmount,
    1500,
    'BROKEN RULE: outstanding balance is wrong. Operator impact: wrong arrears amount quoted to tenant. Action: outstanding = expected - received.'
  );
});

test('FR-2.8 [decision: overpayment = rent + deposit split] an overpayment with a configured deposit reads overpaid with a split, not mismatch', () => {
  const withDeposit = computeUnitStatus({
    ...unitStatusBase,
    depositAmount: 4500,
    matchedReferences: [{ amount: 5000, signed_off: false }],
  });
  assert.equal(
    withDeposit.status,
    'overpaid',
    'BROKEN RULE: overpayment with deposit configured fell back to plain mismatch. Operator impact: deposit contributions get lost in the review pile. Action: check computeDepositSplitSuggestion wiring.'
  );
  assert.deepEqual(withDeposit.depositSplit, { rentPortion: 4500, depositPortion: 500, surplusAmount: 0 });

  // RULING CHANGED 2026-07-03 (supersedes 2026-07-02 "stay mismatch"): with no
  // deposit headroom the overage is offered as HELD CREDIT instead of dead-ending
  // as mismatch — surplus never blocks (REQUIREMENTS FR-2.8 surplus rule).
  const withoutDeposit = computeUnitStatus({
    ...unitStatusBase,
    depositAmount: 0,
    matchedReferences: [{ amount: 5000, signed_off: false }],
  });
  assert.equal(
    withoutDeposit.status,
    'overpaid',
    'BROKEN RULE: overpayment with no deposit headroom must offer an all-credit split (owner ruling 2026-07-03), not dead-end as mismatch. Operator impact: overpaid rows get stuck with no action.'
  );
  assert.deepEqual(withoutDeposit.depositSplit, { rentPortion: 4500, depositPortion: 0, surplusAmount: 500 });
});

test('FR-2.1/NFR-2.3 [decision: chase list] due excludes pending — money that arrived only needs sign-off, not follow-up', () => {
  const pending = computeUnitStatus({
    ...unitStatusBase,
    matchedReferences: [{ amount: 4500, signed_off: false }],
  });
  assert.equal(pending.status, 'pending');

  const snapshot = buildMonthlyPaymentsDashboardSnapshot(
    {
      organizations,
      properties,
      units,
      periods,
      // ref-3 (received 10 May) is the reference inside the June billing
      // window (9 May - 8 June); flip it to unsigned to test the gate.
      references: references.map((reference) =>
        reference.id === 'ref-3' ? { ...reference, signed_off: false } : reference
      ),
    },
    { currentDate: new Date('2026-06-20T12:00:00.000Z') }
  );
  const heights = snapshot.locations.find((location) => location.name === 'Query Heights');
  assert.ok(heights);
  assert.equal(
    heights.paidCount,
    0,
    'BROKEN RULE: unsigned match counted as paid on the dashboard. Operator impact: collection progress overstated. Action: dashboard must use the same computeUnitStatus rules as the units table.'
  );
  assert.equal(
    heights.pendingCount,
    1,
    'BROKEN RULE: pending unit not surfaced. Operator impact: sign-off backlog invisible, money sits unconfirmed. Action: expose pendingCount on location summaries.'
  );
  assert.equal(
    heights.dueCount,
    1,
    'BROKEN RULE: due-count drifted. Due must count only units whose money has not fully arrived (here: the overdue unit-2), never pending ones. Action: check due exclusion rules.'
  );
});

test('NFR-2.3 [decision: one money story] signed-off + awaiting sign-off = all matched money, and progress uses signed-off only', () => {
  const snapshot = buildMonthlyPaymentsDashboardSnapshot(
    {
      organizations,
      properties,
      units,
      periods,
      references: references.map((reference) =>
        reference.id === 'ref-3' ? { ...reference, signed_off: false } : reference
      ),
    },
    { currentDate: new Date('2026-06-20T12:00:00.000Z') }
  );
  const heights = snapshot.locations.find((location) => location.name === 'Query Heights');
  assert.ok(heights);
  assert.equal(
    heights.signedOffCollectedAmount + heights.pendingCollectedAmount,
    heights.matchedCollectedAmount,
    'BROKEN RULE: signed-off + pending no longer sum to matched. Operator impact: the dashboard tells two different money stories (the exact contradiction NFR-2.3 exists to prevent). Action: fix the split in buildLocationsForMonth.'
  );
  assert.equal(
    heights.collectionRate,
    heights.expectedAmount > 0 ? heights.signedOffCollectedAmount / heights.expectedAmount : 0,
    'BROKEN RULE: collection progress is not based on signed-off money. Action: collectionRate = signedOff / expected.'
  );
  assert.equal(
    heights.coverageRate,
    heights.expectedAmount > 0 ? heights.matchedCollectedAmount / heights.expectedAmount : 0,
    'BROKEN RULE: operator progress is not based on matched-to-unit money. Operator impact: the dashboard reads 0% even while rows are waiting only for sign-off. Action: coverageRate = matchedCollected / expected.'
  );
  const june = snapshot.recentMonths.find((month) => month.key === '2026-06');
  assert.ok(june);
  assert.equal(
    june.coverageRate,
    june.rollingTotal.expectedAmount > 0 ? june.rollingTotal.matchedCollectedAmount / june.rollingTotal.expectedAmount : 0,
    'BROKEN RULE: month-card progress is not using matched unit money. Operator impact: month chips look empty despite live rows needing sign-off. Action: derive month coverage from rollingTotal.matchedCollectedAmount.'
  );
});

test('FR-2.8 [decision: deposit ledger] an accepted split makes the payment read as paid, with the contribution out of the rent story', () => {
  const result = computeUnitStatus({
    ...unitStatusBase,
    depositAmount: 4000, // remaining headroom after the accepted 500
    depositContributedAmount: 500,
    matchedReferences: [{ amount: 5000, signed_off: true }],
  });
  assert.equal(
    result.status,
    'paid',
    'BROKEN RULE: an accepted deposit split must settle the row as paid (rent portion matches expected). Operator impact: resolved overpayments keep nagging for review. Action: computeUnitStatus must subtract depositContributedAmount before comparing to rent.'
  );
  assert.equal(result.depositSplit, null, 'No further split should be suggested once one is accepted for the full overpayment.');
});

test('FR-2.8 [decision: deposit ledger] split suggestions are capped by REMAINING deposit headroom, not the raw target', () => {
  const result = computeUnitStatus({
    ...unitStatusBase,
    depositAmount: 300, // ledger nearly full: only R300 headroom left
    matchedReferences: [{ amount: 5000, signed_off: false }],
  });
  assert.equal(result.status, 'overpaid');
  assert.deepEqual(
    result.depositSplit,
    { rentPortion: 4500, depositPortion: 300, surplusAmount: 200 },
    'BROKEN RULE: split suggestion ignored the running deposit balance. Operator impact: deposit over-funds past its target. Action: pass remaining headroom (target - balance) as depositAmount.'
  );
});

test('NFR-2.3 [decision: no invisible money] every rand that arrived is signed-off, pending, or unmatched — never hidden', () => {
  const snapshot = buildMonthlyPaymentsDashboardSnapshot(
    { organizations, properties, units, periods, references },
    { currentDate: new Date('2026-06-20T12:00:00.000Z') }
  );
  // July window (9 Jun - 8 Jul) holds ref-1 (matched+signed 4500) and ref-2 (unmatched 2200).
  const july = snapshot.recentMonths.find((month) => month.key === '2026-07');
  assert.ok(july);
  assert.equal(
    july.rollingTotal.signedOffCollectedAmount +
      july.rollingTotal.pendingCollectedAmount +
      july.rollingTotal.unmatchedCollectedAmount,
    july.rollingTotal.collectedAmount,
    'BROKEN RULE: money arrived that is neither signed-off, pending, nor unmatched — it has vanished from the operator. Operator impact: "where did the data go?" (2026-07-02 owner report). Action: fix unmatchedCollectedAmount derivation in buildMonthlyPaymentsDashboardSnapshot.'
  );
  assert.equal(
    july.rollingTotal.unmatchedCollectedAmount,
    2200,
    'BROKEN RULE: unmatched imported money is not reported in rand. Operator impact: imports look like they disappeared. Action: expose unmatched money on the rolling total.'
  );
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

// ─── FR-2.8 surplus credit (owner rulings 2026-07-03) ────────────────────────

import { computeCreditAllocationOptions, computeOverpaymentAllocation } from './payment-allocation';

test('FR-2.8 [decision: surplus never blocks — rent, then deposit headroom, remainder held as credit]', () => {
  const split = computeOverpaymentAllocation({ receivedAmount: 9067, expectedAmount: 3800, depositHeadroom: 2533 });
  assert.ok(split, 'Overpayment must produce an allocation');
  assert.equal(split.rentPortion, 3800);
  assert.equal(split.depositPortion, 2533);
  assert.equal(
    split.creditAmount,
    2734,
    'BROKEN RULE: surplus beyond deposit headroom must become HELD CREDIT, not an error. Operator impact: overpaid rows stay stuck. Fix computeOverpaymentAllocation.'
  );
});

test('FR-2.8 [decision: deposit fully funded — entire overage becomes credit]', () => {
  const split = computeOverpaymentAllocation({ receivedAmount: 5067, expectedAmount: 3800, depositHeadroom: 0 });
  assert.ok(split);
  assert.equal(split.depositPortion, 0);
  assert.equal(split.creditAmount, 1267, 'With no headroom, everything above rent is credit');
});

test('FR-2.8 [decision: arrears offered only within the last 3 months]', () => {
  const options = computeCreditAllocationOptions({
    creditBalance: 1000,
    selectedPeriodStart: '2026-07-01',
    arrearsCandidates: [
      { periodId: 'p-jun', periodStart: '2026-06-01', outstandingAmount: 900 },
      { periodId: 'p-apr', periodStart: '2026-04-01', outstandingAmount: 400 },
      { periodId: 'p-mar', periodStart: '2026-03-01', outstandingAmount: 700 }, // > 3 months back
      { periodId: 'p-paid', periodStart: '2026-05-01', outstandingAmount: 0 }, // nothing owed
    ],
    depositHeadroom: 0,
  });
  assert.ok(options);
  assert.deepEqual(
    options.arrears.map((option) => option.periodId),
    ['p-apr', 'p-jun'],
    'BROKEN RULE: arrears window is the LAST 3 MONTHS only (owner ruling 2026-07-03). Months older than the window or with nothing owed must not be offered.'
  );
});

test('FR-2.8 [decision: allocation caps — arrears by outstanding, deposit by headroom, all by balance]', () => {
  const options = computeCreditAllocationOptions({
    creditBalance: 500,
    selectedPeriodStart: '2026-07-01',
    arrearsCandidates: [{ periodId: 'p-jun', periodStart: '2026-06-01', outstandingAmount: 900 }],
    depositHeadroom: 5000,
  });
  assert.ok(options);
  assert.equal(options.arrears[0].maxAmount, 500, 'Arrears allocation capped at credit balance');
  assert.equal(options.advance.maxAmount, 500);
  assert.equal(options.deposit?.maxAmount, 500, 'Deposit allocation capped at credit balance');

  const capped = computeCreditAllocationOptions({
    creditBalance: 5000,
    selectedPeriodStart: '2026-07-01',
    arrearsCandidates: [{ periodId: 'p-jun', periodStart: '2026-06-01', outstandingAmount: 900 }],
    depositHeadroom: 300,
  });
  assert.ok(capped);
  assert.equal(capped.arrears[0].maxAmount, 900, 'Arrears allocation capped at the month\'s outstanding');
  assert.equal(capped.deposit?.maxAmount, 300, 'Deposit allocation capped at remaining headroom');
});

test('FR-2.8 [decision: advance is exactly one month ahead; fully-funded deposit not offered]', () => {
  const options = computeCreditAllocationOptions({
    creditBalance: 1200,
    selectedPeriodStart: '2026-07-01',
    arrearsCandidates: [],
    depositHeadroom: 0,
  });
  assert.ok(options);
  assert.equal(options.advance.periodStart, '2026-08-01', 'Advance target is the NEXT month only');
  assert.equal(options.deposit, null, 'No deposit destination once fully funded');
});

test('FR-2.8 [decision: no credit, no options — allocation UI must not render]', () => {
  assert.equal(
    computeCreditAllocationOptions({
      creditBalance: 0,
      selectedPeriodStart: '2026-07-01',
      arrearsCandidates: [{ periodId: 'p', periodStart: '2026-06-01', outstandingAmount: 100 }],
      depositHeadroom: 100,
    }),
    null
  );
});

test('FR-2.8 [decision: credit applied to a period counts toward paid, like operator-approved money]', () => {
  const covered = computeUnitStatus({
    occupancyStatus: 'occupied',
    isBlocked: false,
    expectedAmount: 1900,
    creditAppliedAmount: 1900,
    matchedReferences: [],
    dueDate: '2026-07-08',
    now: new Date('2026-07-20T00:00:00Z'),
  });
  assert.equal(covered.status, 'paid', 'A period fully covered by allocated credit reads paid, not overdue');

  const partial = computeUnitStatus({
    occupancyStatus: 'occupied',
    isBlocked: false,
    expectedAmount: 1900,
    creditAppliedAmount: 400,
    matchedReferences: [{ amount: 1000, signed_off: true }],
    dueDate: '2026-07-08',
    now: new Date('2026-07-20T00:00:00Z'),
  });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.outstandingAmount, 500, 'Outstanding = expected − bank money − credit applied');
});
