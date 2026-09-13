import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReferencePoolViewRow, UnitTableRow } from './monthly-payments';
import { filterUnitRows, filterUnmatchedRows, summarizeUnmatchedLocations } from './reconciliation-workspace';

const reference = (overrides: Partial<ReferencePoolViewRow> = {}): ReferencePoolViewRow => ({
  id: 'ref-1', reference: 'ROOM 2', amount: 2200, transactionDate: '2026-08-01',
  billingPeriodKey: '2026-08', billingPeriodLabel: 'August 2026', isCarryover: false,
  accountSuffix: '6088', payerName: null, propertyId: null, propertyName: 'Property A',
  signedOff: false, ...overrides,
});

test('unassigned import metadata never becomes a confirmed property bucket', () => {
  const rows = [reference(), reference({ id: 'ref-2', propertyId: 'property-a' })];
  const summaries = summarizeUnmatchedLocations(rows);
  assert.equal(summaries.length, 2);
  assert.equal(summaries.find((row) => row.id === 'unassigned')?.propertyId, null);
  assert.equal(summaries.find((row) => row.id === 'property-a')?.referenceCount, 1);
  assert.equal(summaries.reduce((sum, row) => sum + row.totalAmount, 0), 4400);
  assert.equal(rows[0].propertyId, null);
});

test('unmatched search retains individual older payments and original billing periods', () => {
  const rows = [reference(), reference({ id: 'older', isCarryover: true, billingPeriodKey: '2026-02' })];
  const matches = filterUnmatchedRows(rows, ' room   2 ', 'unassigned');
  assert.equal(matches.length, 2);
  assert.equal(matches[1].billingPeriodKey, '2026-02');
  assert.equal(filterUnmatchedRows(rows, '6088', 'all').length, 2);
  assert.equal(filterUnmatchedRows(rows, '2026-02', 'all')[0].id, 'older');
  assert.equal(filterUnmatchedRows(rows, '', 'property-a').length, 0);
});

test('unit filters leave paid rooms accessible and do not alter the underlying list', () => {
  const rows = [
    { unitId: 'one', label: 'Room 1', contacts: [], expectedReference: 'UNIT ONE', reference: 'Payment A', status: 'paid' },
    { unitId: 'two', label: 'Room 2', contacts: [], expectedReference: 'UNIT TWO', reference: 'Payment B', status: 'pending' },
    { unitId: 'three', label: 'Room 3', contacts: [], expectedReference: 'UNIT THREE', reference: null, status: 'blocked' },
  ] satisfies Array<Pick<UnitTableRow, 'unitId' | 'label' | 'contacts' | 'expectedReference' | 'reference' | 'status'>>;
  assert.equal(filterUnitRows(rows, '', 'all').length, 3);
  assert.deepEqual(filterUnitRows(rows, '', 'attention').map((row) => row.unitId), ['two']);
  assert.equal(filterUnitRows(rows, 'unit one', 'paid')[0].unitId, 'one');
  assert.equal(filterUnitRows(rows, 'payment b', 'pending')[0].unitId, 'two');
  assert.equal(filterUnitRows(rows, 'not present', 'all').length, 0);
  assert.equal(rows.length, 3);
  const multiPayment = { ...rows[1], matchedReferences: [{ reference: 'SECOND PAYMENT' }] };
  assert.equal(filterUnitRows([multiPayment], 'second payment', 'all').length, 1);
});
