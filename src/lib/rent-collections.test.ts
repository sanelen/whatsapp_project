import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyPaymentsDashboardSnapshot, type MonthlyPaymentsPeriodRow, type MonthlyPaymentsReferenceRow } from './monthly-payments';
import { calculateRentBalance, sumRentBalances, buildManagementSummary, managementWhatsAppUrl } from './rent-collections';
import { readAllRows } from './read-all-rows';

const now = new Date('2026-11-25T12:00:00Z');
const period = { expected_amount: 2200, is_blocked: false, due_date: '2026-11-08' };
const ref = (id: string, amount: number, signed_off = true) => ({ id, amount, signed_off });
test('confirmed rent excludes per-reference deposits and held credit; caps excess at each charge', () => {
  const room = calculateRentBalance({ period, references: [ref('a', 4000), ref('b', 1000, false)], depositByReference: { a: 800 }, creditFromReference: { a: 1000 }, creditApplied: 200, now });
  assert.equal(room.confirmedAmount, 2200);
  assert.equal(room.excessAmount, 1200);
  assert.equal(room.pendingAmount, 0);
  const unpaid = calculateRentBalance({ period, references: [], now });
  const total = sumRentBalances([room, unpaid]);
  assert.equal(total.outstandingAmount, 2200);
  assert.equal(total.expectedAmount, total.confirmedAmount + total.outstandingAmount);
});
test('partial and pending receipts stay outstanding until confirmed; both can be overdue', () => {
  const room = calculateRentBalance({ period, references: [ref('a', 500), ref('b', 700, false)], now });
  assert.equal(room.outstandingAmount, 1700);
  assert.equal(room.pendingAmount, 700);
  assert.equal(room.overdueAmount, 1700);
  const pending = calculateRentBalance({ period, references: [ref('a', 2200, false)], now });
  assert.equal(pending.outstandingAmount, 2200);
  assert.equal(pending.confirmedAmount, 0);
});
test('due dates are inclusive calendar dates in South Africa; unknown due date is not invented', () => {
  const onDueDay = calculateRentBalance({ period, references: [], now: new Date('2026-11-08T21:59:00Z') });
  const nextDay = calculateRentBalance({ period, references: [], now: new Date('2026-11-08T22:00:00Z') });
  assert.equal(onDueDay.overdueAmount, 0);
  assert.equal(nextDay.overdueAmount, 2200);
  assert.equal(calculateRentBalance({ period: { ...period, due_date: null }, references: [], now }).overdueAmount, 0);
});
test('credit-only settlement is confirmed, missing charges are flagged and vacant/blocked charges stay zero', () => {
  assert.equal(calculateRentBalance({ period, references: [], creditApplied: 200, now }).outstandingAmount, 2000);
  assert.equal(calculateRentBalance({ period, references: [], creditApplied: 2200, now }).confirmedAmount, 2200);
  assert.equal(calculateRentBalance({ references: [], now }).chargeMissing, true);
  assert.equal(calculateRentBalance({ period: { ...period, is_blocked: true }, references: [ref('a', 2200)], now }).expectedAmount, 0);
});

test('dashboard applies receipts to their linked period regardless of bank date, preserves historical charge for a now-vacant room', () => {
  const periods: MonthlyPaymentsPeriodRow[] = [
    { id: 'nov', unit_id: 'a', period_start: '2026-11-01', ...period, status: 'unpaid' },
    { id: 'dec', unit_id: 'a', period_start: '2026-12-01', ...period, due_date: '2026-12-08', status: 'unpaid' },
    { id: 'nov-b', unit_id: 'b', period_start: '2026-11-01', ...period, status: 'unpaid' },
  ];
  const references: MonthlyPaymentsReferenceRow[] = [
    { ...ref('old', 2200), organization_id: 'org', property_id: 'building', unit_id: 'a', unit_payment_period_id: 'nov', received_at: '2026-01-02', reference: 'late allocation' },
    { ...ref('other-month', 8000), organization_id: 'org', property_id: 'building', unit_id: 'a', unit_payment_period_id: 'dec', received_at: '2026-11-02', reference: 'advance' },
    { ...ref('unapplied', 10000), organization_id: 'org', property_id: 'building', unit_id: 'b', unit_payment_period_id: null, received_at: '2026-11-03', reference: 'unapplied' },
    { ...ref('unknown', 99), organization_id: 'org', property_id: null, unit_id: null, unit_payment_period_id: null, received_at: '2026-11-04', reference: 'unknown' },
  ];
  const snapshot = buildMonthlyPaymentsDashboardSnapshot({ organizations: [{ id: 'org', name: 'Test' }], properties: [{ id: 'building', organization_id: 'org', name: 'Building', location: 'Test' }], units: [
    { id: 'a', property_id: 'building', label: 'Room A', rent_amount: 9999, occupancy_status: 'vacant', is_blocked: true },
    { id: 'b', property_id: 'building', label: 'Room B', rent_amount: 2200, occupancy_status: 'occupied', is_blocked: false },
  ], periods, references }, { currentDate: now });
  const nov = snapshot.recentMonths.find(month => month.key === '2026-11')!;
  assert.equal(nov.balances.expectedAmount, 4400);
  assert.equal(nov.balances.confirmedAmount, 2200);
  assert.equal(nov.balances.outstandingAmount, 2200);
  assert.equal(nov.balances.overdueAmount, 2200);
  assert.equal(nov.rollingTotal.unmatchedCollectedAmount, 10099);
  assert.equal(nov.locations[0].unmatchedCollectedAmount, 10000);
  assert.equal(nov.locations[0].unmatchedReferenceCount, 1);
  assert.deepEqual(nov.balances, sumRentBalances(nov.rooms));
  assert.deepEqual(nov.locations[0].balances, sumRentBalances(nov.locations[0].rooms));
  const earlier = snapshot.recentMonths.find(month => month.key === '2026-10')!;
  assert.equal(earlier.expectedAmount, 0, 'No invented historical rent from today’s room price');
});
test('management draft includes room, amount, due date, pending caveat and scoped URL; recipient is explicit', () => {
  const rooms = [{ ...calculateRentBalance({ period, references: [ref('a', 200, false)], now }), unitId: 'a', propertyId: 'p', propertyName: 'Building', label: 'Room A', periodId: 'nov' }];
  const message = buildManagementSummary({ building: 'Building', period: '2026-11', rooms, asOf: '2026-11-25', unmatchedAmount: 500, unmatchedCount: 1, dashboardUrl: 'https://example.com/monthly-payments?building=p&period=2026-11' });
  assert.match(message, /Room A:.*due 2026-11-08/);
  assert.match(message, /Awaiting sign-off/);
  assert.match(message, /building=p&period=2026-11/);
  assert.equal(managementWhatsAppUrl('', message), null);
  assert.equal(managementWhatsAppUrl('123<script>', message), null);
  assert.equal(new URL(managementWhatsAppUrl('+27 82 000 0000', message)!).searchParams.get('text'), message);
});
test('financial reads fetch beyond the database page limit and fail closed on a later page error', async () => {
  const all = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const result = await readAllRows(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
  assert.equal(result.data?.length, 1203);
  const failed = await readAllRows(async (from, to) => from ? { data: null, error: { message: 'offline' } } : { data: all.slice(from, to + 1), error: null });
  assert.equal(failed.data, null);
});
