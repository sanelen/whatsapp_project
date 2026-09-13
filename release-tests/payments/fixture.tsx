import { createRoot } from 'react-dom/client';
import { ReferencePoolViewPanel } from '../../src/components/monthly-payments/reference-pool-view';
import { UnitsTable } from '../../src/components/monthly-payments/units-table';
import { MonthlyPaymentsHub } from '../../src/components/monthly-payments/monthly-payments-hub';
import type { MonthlyPaymentsDashboardSnapshot, PropertyUnitsTable, ReferencePoolView, UnitTableRow } from '../../src/lib/monthly-payments';
import { summarizeUnmatchedLocations } from '../../src/lib/reconciliation-workspace';

const makeRoom = (overrides: Partial<UnitTableRow>): UnitTableRow => ({
  unitId: 'room-1', label: 'Room 1', occupancy: 'occupied', contacts: ['Test tenant'],
  expectedAmount: 2200, expectedReference: 'ROOM 1', matchKeywords: [], matchRules: [],
  periodId: 'period-1', reference: 'ROOM 1', referenceId: 'reference-1',
  referencePayerName: null, referenceAccountSuffix: '0000', transactionDate: '2026-08-01',
  matchedReferences: [], recentPayments: [], receivedAmount: 2200, signedOff: false,
  locked: false, status: 'pending', overdueDays: null, outstandingAmount: null,
  depositAmount: 2200, depositBalance: 0, depositContributedAmount: 0, depositSplit: null,
  creditBalance: 0, heldCreditSources: [], creditAppliedAmount: 0,
  creditFromMatchedReferencesAmount: 0, overpaymentOptions: null, creditOptions: null,
  creditAllocations: [], depositLifecycle: {
    mode: 'occupancy', occupancyId: 'stay-1', status: 'active', startsOn: '2026-01-01',
    endsOn: null, closedAt: null, tenantDisplayName: 'Test tenant', depositTargetAmount: 2200,
    depositBalance: 0, previousOccupancyCount: 0, previousOccupancies: [],
  }, ...overrides,
});

const table: PropertyUnitsTable = {
  setupState: 'ready', organizationLabel: 'Local test portfolio', propertyId: 'test-property',
  propertyName: 'Test property', periodKey: '2026-08', periodLabel: 'August 2026',
  billingWindowLabel: '09 Jul - 08 Aug', activityHint: null, referencePool: [], priorReferencePool: [],
  rows: [makeRoom({ recentPayments: [{ id: 'old-payment', periodStart: '2026-03-01', reference: 'ROOM 1 MARCH', payerName: null, accountSuffix: '0000', transactionDate: '2026-02-28', amount: 2200, rentAmount: 2200, depositAmount: 0, creditAmount: 0, signedOff: true }] }),
    makeRoom({ unitId: 'room-2', label: 'Room 2', status: 'paid', signedOff: true, reference: 'ROOM 2', expectedReference: 'ROOM 2' })],
  totals: { unitCount: 2, blockedCount: 0, paidCount: 1, pendingCount: 1, dueCount: 0,
    overdueCount: 0, collected: 2200, pendingAmount: 2200, outstandingAmount: 0,
    expected: 4400, unmatchedCount: 0, unmatchedAmount: 0, priorUnmatchedCount: 0, priorUnmatchedAmount: 0 },
};

const rows: ReferencePoolView['rows'] = [
  { id: 'current', reference: 'ROOM 2', amount: 2200, transactionDate: '2026-08-01', billingPeriodKey: '2026-08', billingPeriodLabel: 'August 2026', isCarryover: false, accountSuffix: '0000', payerName: null, propertyId: null, propertyName: 'Test property', signedOff: false },
  { id: 'older', reference: 'ROOM 2', amount: 2200, transactionDate: '2026-02-28', billingPeriodKey: '2026-03', billingPeriodLabel: 'March 2026', isCarryover: true, accountSuffix: '0000', payerName: null, propertyId: 'test-property', propertyName: 'Test property', signedOff: false },
  { id: 'other', reference: 'OTHER ROOM', amount: 1000, transactionDate: '2026-07-22', billingPeriodKey: '2026-08', billingPeriodLabel: 'August 2026', isCarryover: false, accountSuffix: '0001', payerName: null, propertyId: 'other-property', propertyName: 'Other property', signedOff: false },
];
const view: ReferencePoolView = {
  setupState: 'ready', organizationLabel: 'Local test portfolio', periodKey: '2026-08',
  periodLabel: 'August 2026', billingWindowLabel: '09 Jul - 08 Aug', rows,
  locations: summarizeUnmatchedLocations(rows),
  totals: { unmatchedCount: 3, totalAmount: 5400, currentUnmatchedCount: 2, currentAmount: 3200, carryoverUnmatchedCount: 1, carryoverAmount: 2200 },
};

const rollingTotal: MonthlyPaymentsDashboardSnapshot['rollingTotal'] = {
  collectedAmount: 4400, matchedCollectedAmount: 2200, signedOffCollectedAmount: 0,
  pendingCollectedAmount: 2200, unmatchedCollectedAmount: 2200, expectedAmount: 4400,
  collectionRate: 0, coverageRate: 0.5, occupiedCount: 2, blockedCount: 0,
  overdueCount: 0, paidCount: 0, pendingCount: 1, dueCount: 1,
};
const dashboard: MonthlyPaymentsDashboardSnapshot = {
  setupState: 'ready', organizationLabel: 'Local test portfolio', monthLabel: 'August 2026',
  rollingTotal, locations: [], unmatchedReferenceCount: 1,
  recentMonths: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((key) => ({
    key, label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-01`)),
    collectedAmount: 4400, expectedAmount: 4400, collectionRate: 0, coverageRate: 0.5,
    isCurrent: key === '2026-08', rollingTotal, locations: [], unmatchedReferenceCount: 1,
  })),
};

createRoot(document.getElementById('root')!).render(
  location.pathname === '/dashboard' ? <MonthlyPaymentsHub dashboard={dashboard} /> :
  location.pathname === '/units'
    ? <UnitsTable table={table} initialUnitId="room-1" />
    : <ReferencePoolViewPanel view={view} />
);
