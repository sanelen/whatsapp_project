import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCapitecStatement, scopedStatementQuery, statementReferenceKey } from './capitec-statement';
import { getBillingPeriodForDate } from './bank-import';

const header = (month: string, end: string) => `Capitec Bank Limited\nBusiness Flexible Savings\nAccount Statement\nAccount: Business Flexible Savings Account 0000004079\nFrom Date: 01/${month}/2026 Opening Balance:\nTo Date: ${end}/${month}/2026 Closing Balance:\nTransaction History\nDate Description Category Money In Money Out Fee* Balance\n`;
const august = header('08', '31') + `13/08/2026 Payment Received: WRROOM5 Payments Received 700.00 23 871.28
29/08/2026 Payment Received: WRoom10 Payments Received 1 900.00 25 771.28
30/08/2026 Payment Received: WRRoom8 Payments Received 1 900.00 27 671.28
31/08/2026 Interest Received Interest 38.31 27 709.59`;
const september = header('09', '30') + `01/09/2026 ATM Cash Deposit: NWROOM5 Cash Deposit 1 900.00 -26.60 29 582.99
07/09/2026 ATM Cash Deposit: TENANT ROOM2 Cash Deposit 3 800.00 -53.20 33 329.79
30/09/2026 Interest Received Interest 81.70 33 411.49`;
const october = header('10', '31') + `01/10/2026 Payment Received: WRRoom8 Payments Received 1 900.00 35 311.49
02/10/2026 Payment Received: NW RM 5 Payments Received 1 900.00 37 211.49
06/10/2026 ATM Cash Deposit: TENANT ROOM2 Cash Deposit 1 900.00 -26.60 39 084.89
30/10/2026 Payment Received: A EXAMPLE Account Payment Received 1 900.00 40 984.89
31/10/2026 Payment Received: Room 1 Rental Income 3 800.00 44 784.89
31/10/2026 Interest Received Interest 107.56 44 892.45`;

test('verified monthly layouts yield ten gross rent credits and the correct billing periods', () => {
  const statements = [august, september, october].map(text => parseCapitecStatement(text));
  const rows = statements.flatMap(statement => statement.entries);
  assert.equal(rows.length, 10);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 21600);
  assert.equal(statements.reduce((sum, statement) => sum + statement.ignoredRows, 0), 3);
  assert.equal(rows.filter(row => row.transactionType === 'Cash Deposit').reduce((sum, row) => sum + row.amount, 0), 7600);
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const period = getBillingPeriodForDate(row.transactionDate!);
    totals[period] = (totals[period] ?? 0) + row.amount;
    assert.equal(row.destinationAccountSuffix, '4079');
    assert.equal(row.transactionTime, '');
  }
  assert.deepEqual(totals, { '2026-09': 10200, '2026-10': 5700, '2026-11': 5700 });
});

test('account validation does not trust filenames, subjects or unrelated account text', () => {
  assert.throws(() => parseCapitecStatement(august.replace('0000004079', '0000007467') + '\n4079'), /account does not match/);
  assert.throws(() => parseCapitecStatement(august + '\nAccount: Flexible Savings Account 0000006088'), /account does not match/);
});

test('bad money columns and unrecognized activity fail before any rows are imported', () => {
  assert.throws(() => parseCapitecStatement(september.replace('-53.20', '-53.21')), /balance does not reconcile/);
  assert.throws(() => parseCapitecStatement(september.replace('Cash Deposit 1 900.00', 'Cash Deposit -1 900.00')), /Invalid statement credit/);
  assert.throws(() => parseCapitecStatement(august.replace('Payment Received: WRROOM5', 'Transfer Received: OWN ACCOUNT')), /unsupported transaction/);
  assert.throws(() => parseCapitecStatement(august.replace('13/08/2026 Payment', '13/07/2026 Payment')), /outside statement/);
});

test('same-day identical date-only credits require review; overlaps keep stable transaction IDs', () => {
  const repeated = header('08', '31') + `13/08/2026 Payment Received: WRROOM5 Payments Received 700.00 23 871.28
13/08/2026 Payment Received: WRROOM5 Payments Received 700.00 24 571.28`;
  assert.throws(() => parseCapitecStatement(repeated), /manual review/);
  const first = parseCapitecStatement(august).entries[0];
  const overlap = parseCapitecStatement(header('08', '31') + '13/08/2026 Payment Received: WRROOM5 Payments Received 700.00 23 871.28').entries[0];
  assert.equal(first.transactionId, overlap.transactionId);
  assert.equal(statementReferenceKey('Payment Received: WR Room 5'), statementReferenceKey('WRROOM5'));
  assert.equal(statementReferenceKey('ATM Cash Deposit: NWROOM5'), statementReferenceKey('NWROOM5'));
});

test('source search restricts account, statement type, attachment and date', () => {
  assert.match(scopedStatementQuery(), /4079/);
  assert.match(scopedStatementQuery(), /subject:"Capitec Business Account Statement"/);
  assert.match(scopedStatementQuery(), /after:2026\/09\/01/);
});

test('4079 stays in West Rich and only clear room references match', async () => {
  const { resolveImportContext } = await import('./bank-import');
  const { resolveAutoMatch } = await import('./auto-match');
  const hints = Array.from({ length: 12 }, (_, index) => ({
    id: `hint-${index + 1}`, unit_id: `room-${index + 1}`, property_id: 'west',
    matcher_type: 'reference_contains' as const, matcher_value: `Room${index + 1},WRROOM${index + 1}`,
    amount_value: null, priority: 10, is_active: true,
  }));
  const allHints = [...hints, { ...hints[4], id: 'exact-nw', matcher_type: 'reference_equals' as const, matcher_value: 'NW RM 5' },
    { ...hints[0], id: 'other-property', property_id: 'quarry', unit_id: 'quarry-room-1' }];
  const entries = [august, september, october].flatMap(text => parseCapitecStatement(text).entries);
  const matches = entries.map(entry => {
    const context = resolveImportContext({ entry, organizationId: 'org',
      propertyMappings: [{ id: 'mapping', organization_id: 'org', property_id: 'west', account_number_suffix: '4079', property_name: 'West Rich', is_active: true }],
      unitMatchHints: allHints });
    assert.equal(context.propertyId, 'west');
    assert.equal(context.matchedBy, 'account_suffix:4079');
    const result = resolveAutoMatch({ id: entry.transactionId, property_id: context.propertyId, reference: entry.reference, payerName: entry.payerName, amount: entry.amount }, allHints);
    return result.kind === 'match' ? result.unitId : null;
  });
  assert.deepEqual(matches, ['room-5', 'room-10', 'room-8', 'room-5', 'room-2', 'room-8', 'room-5', 'room-2', null, 'room-1']);
});
