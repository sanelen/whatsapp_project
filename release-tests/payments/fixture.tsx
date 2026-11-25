import { RentCollectionsDashboard } from '../../src/components/monthly-payments/rent-collections-dashboard';
import { calculateRentBalance, sumRentBalances, type CollectionRoom } from '../../src/lib/rent-collections';
import { createRoot } from 'react-dom/client';
import { ReferencePoolViewPanel } from '../../src/components/monthly-payments/reference-pool-view';
import { UnitsTable } from '../../src/components/monthly-payments/units-table';
import { MonthlyPaymentsHub } from '../../src/components/monthly-payments/monthly-payments-hub';
import type { MonthlyPaymentsDashboardSnapshot, PropertyUnitsTable, ReferencePoolView, UnitTableRow } from '../../src/lib/monthly-payments';
import { summarizeUnmatchedLocations } from '../../src/lib/reconciliation-workspace';
import { ImportAuditViewPanel } from '../../src/components/monthly-payments/import-audit-view';
import type { ImportAuditView } from '../../src/lib/import-audit';

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

const collectionRooms: CollectionRoom[] = [
  { unitId: 'room-1', label: 'Room 1', propertyId: 'test-property', propertyName: 'Test property', periodId: 'period-1',
    ...calculateRentBalance({ period: { expected_amount: 2200, is_blocked: false, due_date: '2026-08-08' }, references: [{ id: 'ref-1', amount: 1000, signed_off: true }], now: new Date('2026-08-20') }) },
  { unitId: 'room-2', label: 'Room 2', propertyId: 'test-property', propertyName: 'Test property', periodId: 'period-2',
    ...calculateRentBalance({ period: { expected_amount: 2200, is_blocked: false, due_date: '2026-08-08' }, references: [{ id: 'ref-2', amount: 2200, signed_off: false }], now: new Date('2026-08-20') }) },
  { unitId: 'room-3', label: 'Room 3', propertyId: 'other-property', propertyName: 'Other property', periodId: 'period-3',
    ...calculateRentBalance({ period: { expected_amount: 1800, is_blocked: false, due_date: '2026-08-08' }, references: [{ id: 'ref-3', amount: 3000, signed_off: true }], now: new Date('2026-08-20') }) },
];
const rollingTotal: MonthlyPaymentsDashboardSnapshot['rollingTotal'] = {
  collectedAmount: 8400, matchedCollectedAmount: 5000, signedOffCollectedAmount: 2800,
  pendingCollectedAmount: 2200, unmatchedCollectedAmount: 2200, expectedAmount: 6200,
  collectionRate: 2800 / 6200, coverageRate: 5000 / 6200, occupiedCount: 3, blockedCount: 0,
  overdueCount: 1, paidCount: 1, pendingCount: 1, dueCount: 1,
};
const collectionLocations = ['test-property', 'other-property'].map(id => {
  const rooms = collectionRooms.filter(room => room.propertyId === id);
  const balances = sumRentBalances(rooms);
  return { id, name: rooms[0].propertyName, location: 'Test location', rooms, balances,
    ...rollingTotal, unitCount: rooms.length, unmatchedReferenceCount: id === 'test-property' ? 1 : 0,
    unmatchedCollectedAmount: id === 'test-property' ? 2200 : 0 };
});
const dashboard: MonthlyPaymentsDashboardSnapshot = {
  asOf: '2026-11-25', setupState: 'ready', organizationLabel: 'Local test portfolio', monthLabel: 'August 2026',
  rollingTotal, locations: collectionLocations, unmatchedReferenceCount: 1,
  recentMonths: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((key) => ({
    key, label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-01`)),
    collectedAmount: 8400, expectedAmount: 6200, collectionRate: 2800 / 6200, coverageRate: 5000 / 6200,
    isCurrent: key === '2026-08', rollingTotal, locations: collectionLocations.map(location => ({ ...location, rooms: location.rooms.map(room => ({ ...room, dueDate: room.dueDate?.replace('2026-08', key) ?? null })) })), unmatchedReferenceCount: 1,
    rooms: collectionRooms.map(room => ({ ...room, dueDate: room.dueDate?.replace('2026-08', key) ?? null })), balances: sumRentBalances(collectionRooms),
  })),
};

const audit: ImportAuditView = {
  periodKey: '2026-07', periodLabel: 'July 2026', billingWindowLabel: '09 Jun - 08 Jul', sourceFilter: 'all', reconciliation: null,
  totals: { files: 2, parsedFiles: 0, transactions: 0, amount: 0, stored: 0, matched: 0, signedOff: 0, unmatched: 0, incomplete: 0, unprocessed: 2 },
  files: [true, false].map((saved, index) => ({
    id: `test-source-${index}`, fileName: saved ? 'saved-evidence.pdf' : 'pending-evidence.pdf', mimeType: 'application/pdf',
    source: 'gmail', sourceLabel: 'Gmail PDF', sourceUrl: saved ? 'https://drive.google.com/file/d/test-file/view' : null,
    importedAt: '2026-09-01T10:00:00Z', receivedAt: null, parserStatus: 'unsupported', importStatus: 'processed',
    driveStatus: saved ? 'archived' : 'not-archived', databaseStatus: 'missing', matchStatus: 'not-applicable',
    reviewStatus: 'unsupported', reviewReason: 'Source requires review', needsOperatorReview: true,
    driveFolderPath: saved ? 'Hamba Trading Bank Files/2026-07/Test property' : null, hashShort: 'test-hash', transactions: [],
  })),
};

const previewParams = new URLSearchParams(location.search);
const previewPeriod = previewParams.get('period') ?? '2026-08';
const previewProperty = location.pathname.split('/').at(-1);
const previewLocation = dashboard.recentMonths.find(month => month.key === previewPeriod)?.locations.find(item => item.id === previewProperty);
const previewTable: PropertyUnitsTable = previewLocation ? {
  ...table, propertyId: previewLocation.id, propertyName: previewLocation.name, periodKey: previewPeriod,
  periodLabel: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${previewPeriod}-01`)),
  billingWindowLabel: previewPeriod === '2026-11' ? '09 Oct - 08 Nov' : table.billingWindowLabel,
  rows: previewLocation.rooms.map(room => makeRoom({
    unitId: room.unitId, label: room.label, periodId: room.periodId, rentBalance: room,
    expectedAmount: room.expectedAmount, receivedAmount: room.confirmedAmount + room.pendingAmount,
    outstandingAmount: room.outstandingAmount, status: room.pendingAmount > 0 ? 'pending' : room.outstandingAmount > 0 ? 'partial' : 'paid',
    signedOff: room.pendingAmount === 0, reference: 'Sample receipt', transactionDate: `${previewPeriod}-01`,
  })),
  totals: { ...table.totals, unitCount: previewLocation.rooms.length, expected: previewLocation.balances.expectedAmount,
    collected: previewLocation.balances.confirmedAmount, pendingAmount: previewLocation.balances.pendingAmount,
    paidCount: previewLocation.rooms.filter(room => room.expectedAmount > 0 && room.outstandingAmount === 0).length,
    dueCount: previewLocation.rooms.filter(room => room.outstandingAmount > room.pendingAmount).length,
    pendingCount: previewLocation.rooms.filter(room => room.pendingAmount > 0).length,
    outstandingAmount: previewLocation.balances.outstandingAmount, overdueCount: previewLocation.rooms.filter(room => room.overdueAmount > 0).length },
} : table;

createRoot(document.getElementById('root')!).render(
  location.pathname === '/audit' || location.pathname.includes('import-audit') ? <ImportAuditViewPanel view={audit} /> :
  (location.pathname === '/dashboard' || location.pathname === '/monthly-payments') ? <MonthlyPaymentsHub dashboard={dashboard} /> :
  location.pathname === '/monthly-payments/follow-up' ? <RentCollectionsDashboard managerRecipientSuffix="0000" dashboard={dashboard} initialPeriod={previewParams.get('period') ?? undefined} initialBuilding={previewParams.get('building') ?? undefined} initialFilter={previewParams.get('filter') ?? undefined} /> :
  (location.pathname === '/units' || previewLocation)
    ? <UnitsTable table={previewLocation ? previewTable : table} initialUnitId={previewParams.get('unitId') ?? 'room-1'} />
    : <ReferencePoolViewPanel view={{ ...view, periodKey: previewPeriod }} initialProperty={previewParams.get('property') ?? undefined} />
);
