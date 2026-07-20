import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGmailSearchQuery,
  buildCrossSourceTransactionIdentity,
  canonicalizeBankReference,
  buildGmailOAuthConsentUrl,
  extractAttachmentsFromEml,
  getBillingPeriodForDate,
  getBillingWindowForPeriod,
  getGmailIntegrationStatus,
  isExcludedBankAccount,
  isExcludedNonRentCredit,
  parseBankStatementCsv,
  parseBankStatementText,
  parseCapitecAccountMovementText,
  parseCapitecTransactionText,
  resolveImportContext,
} from './bank-import';

test('internal bank accounts are excluded from every import source', () => {
  assert.equal(isExcludedBankAccount({ destinationAccountSuffix: '7467' }), true);
  assert.equal(isExcludedBankAccount({ destinationAccountSuffix: '6088' }), false);
});

test('interest received is excluded from payment ingestion', () => {
  assert.equal(isExcludedNonRentCredit({ reference: 'Interest Received' }), true);
  assert.equal(isExcludedNonRentCredit({ reference: 'Payment Received: Interest Room 1' }), false);
  const rows = parseBankStatementCsv([
    'Account,Transaction Date,Description,Amount,Balance',
    '4001807904,2026-07-01 01:05,Interest Received,224.44,107473.87',
  ].join('\n'));
  assert.equal(rows.length, 0);
});

test('cross-source transaction identity ignores source-specific IDs and references', () => {
  const identity = buildCrossSourceTransactionIdentity({
    organizationId: 'org-1', transactionDate: '2026-07-07', transactionTime: '12:08:00',
    destinationAccountSuffix: '7904', amount: 4200,
  });
  assert.equal(identity, 'org-1|2026-07-07|12:08:00|7904|4200.00');
});

test('canonical bank references remove statement-only payment prefixes', () => {
  assert.equal(canonicalizeBankReference('Payment Received: EssexRoom10'), 'ESSEXROOM10');
  assert.equal(canonicalizeBankReference('External Immediate Payment Received: ESSEX ROOM 1'), 'ESSEXROOM1');
});

test('outgoing Capitec notifications expose their paid-from account before import', () => {
  assert.deepEqual(
    parseCapitecAccountMovementText('Account Paid From : ****7467\nPayment Amount : R 1,250.00'),
    { direction: 'outgoing', accountSuffix: '7467' }
  );
});

test('reserved merchant notifications expose their account before import', () => {
  assert.deepEqual(
    parseCapitecAccountMovementText('Account : ****7467\nReserved Amount : R 537.00\nMerchant : ISP'),
    { direction: 'outgoing', accountSuffix: '7467' }
  );
});

function withGmailEnv<T>(values: Record<string, string | undefined>, run: () => T) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('parseCapitecTransactionText extracts incoming-funds fields from a Capitec PDF text sample', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 22/06/2026 13:35:29
    Transaction ID : 002062530
    Account Paid To : ****6088
    Amount Received : R 2,200.00
    Reference : S LUTHULI
    Available Balance : R 24,461.14
  `);

  assert.ok(parsed);
  assert.equal(parsed?.transactionType, 'Incoming Funds');
  assert.equal(parsed?.transactionDate, '2026-06-22');
  assert.equal(parsed?.transactionTime, '13:35:29');
  assert.equal(parsed?.transactionId, '002062530');
  assert.equal(parsed?.destinationAccountSuffix, '6088');
  assert.equal(parsed?.amount, 2200);
  assert.equal(parsed?.reference, 'S LUTHULI');
  assert.equal(parsed?.availableBalance, 24461.14);
});

test('parseCapitecTransactionText preserves non-incoming transaction types for filtering', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Transfer
    Date Time Actioned : 22/06/2026 13:35:29
    Transaction ID : 002062530
    Account Paid To : ****7904
    Amount Received : R 500.00
    Reference : TEST TRANSFER
    Available Balance : R 24,461.14
  `);

  assert.ok(parsed);
  assert.equal(parsed?.transactionType, 'Transfer');
  assert.equal(parsed?.destinationAccountSuffix, '7904');
});

test('parseCapitecTransactionText reads transaction IDs when the PDF text places the label after the value', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 28/04/2026 13:10:00
    : 002501559 Transaction ID
    Account Paid To : ****7904
    Amount Received : R 5,000.00
    Reference : ESSEX ROOM 1
    Available Balance : R 23,511.29
  `);

  assert.ok(parsed);
  assert.equal(parsed?.transactionId, '002501559');
  assert.equal(parsed?.transactionDate, '2026-04-28');
  assert.equal(parsed?.reference, 'ESSEX ROOM 1');
});

test('parseBankStatementCsv extracts incoming credits from exported statement rows', () => {
  const parsed = parseBankStatementCsv(
    [
      'Transaction Date,Description,Money In,Money Out,Balance',
      '22/07/2026,QHRoom14,"R 2,200.00",,"R 10,000.00"',
      '23/07/2026,Bank fee,,"R 75.00","R 9,925.00"',
    ].join('\n')
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.transactionDate, '2026-07-22');
  assert.equal(parsed[0]?.amount, 2200);
  assert.equal(parsed[0]?.reference, 'QHRoom14');
  assert.equal(parsed[0]?.transactionType, 'Incoming Funds');
});

test('statement CSV prefers the timestamped transaction date over posting date', () => {
  const [entry] = parseBankStatementCsv([
    'Account,Posting Date,Transaction Date,Description,Amount,Balance',
    '4001807904,2026-07-07,2026-07-07 12:08,Payment Received: Room 4,4200.00,120723.87',
  ].join('\n'));
  assert.equal(entry.transactionDate, '2026-07-07');
  assert.equal(entry.transactionTime, '12:08:00');
  assert.equal(entry.destinationAccountSuffix, '7904');
});

test('mixed legacy account accepts payment receipts but rejects transfers and small personal credits', () => {
  const rows = parseBankStatementCsv([
    'Account,Transaction Date,Description,Money In,Money Out,Balance',
    '1444696570,2026-06-01 10:00,Payment Received: Qhroom10,2200.00,,2200.00',
    '1444696570,2026-06-01 10:05,Banking App Transfer Received from Qh: Transfer,2000.00,,4200.00',
    '1444696570,2026-06-01 10:10,PayShap Payment Received: Friend,300.00,,4500.00',
  ].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, 'Payment Received: Qhroom10');
});

test('parseBankStatementText extracts statement-like PDF credit lines', () => {
  const parsed = parseBankStatementText(`
    22/07/2026 EFT CREDIT QHRoom14 R 2,200.00 R 10,000.00
    23/07/2026 FEE Monthly account fee R 75.00 R 9,925.00
  `);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.transactionDate, '2026-07-22');
  assert.equal(parsed[0]?.amount, 2200);
  assert.equal(parsed[0]?.reference, 'QHRoom14');
});

test('buildGmailSearchQuery combines attachment, subject, label, and after filters', () => {
  const query = buildGmailSearchQuery({
    subject_filter: 'Capitec Business Transaction Notification',
    label_filter: 'bank-imports',
    last_synced_at: '2026-06-29T20:00:00.000Z',
  });

  assert.match(query, /has:attachment/);
  assert.match(query, /subject:"Capitec Business Transaction Notification"/);
  assert.match(query, /label:bank-imports/);
  assert.match(query, /after:2026\/06\/29/);
});

test('getBillingWindowForPeriod maps a month to the 9th-through-8th working window', () => {
  const window = getBillingWindowForPeriod('2026-06');

  assert.equal(window.startDate, '2026-05-09');
  assert.equal(window.endDate, '2026-06-08');
  assert.equal(window.gmailAfterDate, '2026-05-08');
  assert.equal(window.gmailBeforeDate, '2026-06-09');
});

test('buildGmailSearchQuery uses a generous after floor and no before guard for billing windows', () => {
  const query = buildGmailSearchQuery(
    {
      subject_filter: 'Capitec Business Transaction Notification',
      label_filter: '',
      last_synced_at: '2026-06-29T20:00:00.000Z',
    },
    getBillingWindowForPeriod('2026-05')
  );

  // Forwarded Capitec mail arrives after the transaction, so the Gmail search must
  // keep only a lower `after:` floor and rely on transaction-date filtering. A tight
  // `before:` received-date guard would drop the forwarded notifications entirely.
  assert.match(query, /after:2026\/04\/08/);
  assert.doesNotMatch(query, /before:/);
  // The billing window overrides the last_synced_at after-filter.
  assert.doesNotMatch(query, /after:2026\/06\/29/);
});

test('getGmailIntegrationStatus prefers OAuth refresh-token credentials', () => {
  withGmailEnv(
    {
      GMAIL_OAUTH_CLIENT_ID: 'client-id',
      GMAIL_OAUTH_CLIENT_SECRET: 'client-secret',
      GMAIL_OAUTH_REFRESH_TOKEN: 'refresh-token',
      GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL: 'service@example.com',
      GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY: 'private-key',
    },
    () => {
      const status = getGmailIntegrationStatus();

      assert.equal(status.configured, true);
      assert.equal(status.preferredAuthMode, 'oauth_refresh_token');
      assert.equal(status.hasOAuthClient, true);
      assert.equal(status.hasOAuthRefreshToken, true);
      assert.equal(status.hasServiceAccount, true);
    }
  );
});

test('buildGmailOAuthConsentUrl requests Gmail readonly offline consent', () => {
  withGmailEnv(
    {
      GMAIL_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    },
    () => {
      const url = new URL(
        buildGmailOAuthConsentUrl({
          redirectUri: 'http://localhost:3001/api/monthly-payments/import/google-cloud',
          state: 'monthly-payments-bank-import',
          loginHint: 'info.hambatrading@gmail.com',
        })
      );

      assert.equal(url.origin, 'https://accounts.google.com');
      assert.equal(url.searchParams.get('client_id'), 'client-id.apps.googleusercontent.com');
      assert.equal(url.searchParams.get('response_type'), 'code');
      assert.equal(
        url.searchParams.get('scope'),
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly'
      );
      assert.equal(url.searchParams.get('access_type'), 'offline');
      assert.equal(url.searchParams.get('prompt'), 'consent select_account');
      assert.equal(url.searchParams.get('login_hint'), 'info.hambatrading@gmail.com');
      assert.equal(url.searchParams.get('state'), 'monthly-payments-bank-import');
    }
  );
});

test('extractAttachmentsFromEml recovers nested PDF attachments from a forwarded mail body', () => {
  const pdfBytes = Buffer.from('%PDF-1.4 mock');
  const raw = [
    'From: sender@example.com',
    'To: info.hambatrading@gmail.com',
    'Subject: Forwarded transaction',
    'Content-Type: multipart/mixed; boundary="frontier"',
    '',
    '--frontier',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'Please see attached.',
    '--frontier',
    'Content-Type: application/pdf; name="70006Capitec.pdf"',
    'Content-Disposition: attachment; filename="70006Capitec.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    pdfBytes.toString('base64'),
    '--frontier--',
    '',
  ].join('\r\n');

  const attachments = extractAttachmentsFromEml(Buffer.from(raw, 'utf8'), 'forwarded.eml');

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, '70006Capitec.pdf');
  assert.equal(attachments[0].mimeType, 'application/pdf');
  assert.match(attachments[0].sourceId, /^eml:forwarded\.eml:70006Capitec\.pdf:/);
  assert.equal(attachments[0].nestedFrom, 'forwarded.eml');
  assert.deepEqual(attachments[0].data, pdfBytes);
});

// ─── Billing period / window edge cases (discovered during July 1 import debugging) ───

test('getBillingPeriodForDate: day 1-8 belongs to the current calendar month', () => {
  assert.equal(getBillingPeriodForDate('2026-07-01'), '2026-07');
  assert.equal(getBillingPeriodForDate('2026-07-08'), '2026-07');
});

test('getBillingPeriodForDate: day 9+ belongs to the next calendar month', () => {
  assert.equal(getBillingPeriodForDate('2026-07-09'), '2026-08');
  assert.equal(getBillingPeriodForDate('2026-07-31'), '2026-08');
});

test('getBillingPeriodForDate: December 9+ rolls into the next year', () => {
  assert.equal(getBillingPeriodForDate('2026-12-09'), '2027-01');
  assert.equal(getBillingPeriodForDate('2026-12-31'), '2027-01');
});

test('getBillingWindowForPeriod: July 2026 window spans June 9 to July 8', () => {
  const window = getBillingWindowForPeriod('2026-07');
  assert.equal(window.startDate, '2026-06-09');
  assert.equal(window.endDate, '2026-07-08');
});

test('getBillingWindowForPeriod: January window crosses year boundary', () => {
  const window = getBillingWindowForPeriod('2027-01');
  assert.equal(window.startDate, '2026-12-09');
  assert.equal(window.endDate, '2027-01-08');
});

test('a July 1 transaction is inside the July 2026 billing window', () => {
  const window = getBillingWindowForPeriod('2026-07');
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 14:30:00
    Transaction ID : 003000001
    Account Paid To : ****6088
    Amount Received : R 2,200.00
    Reference : QHRoom14
    Available Balance : R 30,000.00
  `);
  assert.ok(parsed);
  assert.equal(parsed!.transactionDate, '2026-07-01');
  // July 1 is inside June 9 – July 8
  assert.ok(parsed!.transactionDate! >= window.startDate);
  assert.ok(parsed!.transactionDate! <= window.endDate);
});

test('a July 1 transaction is OUTSIDE the June 2026 billing window', () => {
  const window = getBillingWindowForPeriod('2026-06');
  // June window: May 9 – June 8
  assert.equal(window.startDate, '2026-05-09');
  assert.equal(window.endDate, '2026-06-08');
  // July 1 > June 8
  assert.ok('2026-07-01' > window.endDate);
});

// ─── Parser edge cases ───

test('parseCapitecTransactionText returns null for PDFs without Transaction Type', () => {
  const parsed = parseCapitecTransactionText(`
    Some other PDF content
    Date: 01/07/2026
    Amount: R 500.00
  `);
  assert.equal(parsed, null);
});

test('parseCapitecTransactionText handles Quarry Heights room references', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 09:00:00
    Transaction ID : 003000002
    Account Paid To : ****6088
    Amount Received : R 2,200.00
    Reference : QHRoom14
    Available Balance : R 25,000.00
  `);
  assert.ok(parsed);
  assert.equal(parsed!.reference, 'QHRoom14');
  assert.equal(parsed!.destinationAccountSuffix, '6088');
  assert.equal(parsed!.amount, 2200);
});

test('resolveImportContext: unmapped account suffix still resolves with null propertyId', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 10:00:00
    Transaction ID : 003000003
    Account Paid To : ****7467
    Amount Received : R 3,000.00
    Reference : QHROOM08
    Available Balance : R 20,000.00
  `);
  assert.ok(parsed);

  const resolved = resolveImportContext({
    entry: parsed,
    organizationId: 'org-1',
    propertyMappings: [
      {
        id: 'map-1',
        organization_id: 'org-1',
        property_id: 'quarry-heights',
        account_number_suffix: '6088',
        property_name: 'Quarry Heights',
        is_active: true,
      },
    ],
    unitMatchHints: [],
  });

  // Account 7467 has no mapping → propertyId should be null
  assert.equal(resolved.propertyId, null);
});

test('resolveImportContext supports regex-based Essex room matching', () => {
  const parsed = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 28/04/2026 09:15:00
    Transaction ID : 002062531
    Account Paid To : ****7904
    Amount Received : R 5,000.00
    Reference : ESSEX ROOM 1
    Available Balance : R 24,461.14
  `);

  assert.ok(parsed);

  const resolved = resolveImportContext({
    entry: parsed,
    organizationId: 'org-1',
    propertyMappings: [
      {
        id: 'map-1',
        organization_id: 'org-1',
        property_id: 'berea-property',
        account_number_suffix: '7904',
        property_name: 'Essex / Berea',
        is_active: true,
      },
    ],
    unitMatchHints: [
      {
        id: 'hint-1',
        property_id: 'berea-property',
        unit_id: 'unit-room-01',
        matcher_type: 'reference_regex',
        matcher_value: 'ESSEX\\s*(?:ROOM|NO\\.?)[\\s-]*0?1\\b',
        amount_value: null,
        priority: 1,
        is_active: true,
      },
    ],
  });

  assert.equal(resolved.propertyId, 'berea-property');
  assert.equal(resolved.unitHints.length, 1);
  assert.equal(resolved.unitHints[0]?.unitId, 'unit-room-01');
  assert.equal(resolved.unitHints[0]?.matcherType, 'reference_regex');
});

test('resolveImportContext lets a reference rule override a shared-account default', () => {
  const entry = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 10:00:00
    Transaction ID : 003000004
    Account Paid To : ****5555
    Amount Received : R 1,900.00
    Reference : WR ROOM 7
    Available Balance : R 20,000.00
  `)!;
  const resolved = resolveImportContext({
    entry,
    organizationId: 'org-1',
    propertyMappings: [{
      id: 'map-main', organization_id: 'org-1', property_id: 'quarry',
      account_number_suffix: '5555', property_name: 'Quarry Heights', is_active: true,
    }],
    unitMatchHints: [{
      id: 'west-reference', property_id: 'west-rich', unit_id: null,
      account_number_suffix: '5555', matcher_type: 'reference_regex', matcher_value: '^WR',
      amount_value: null, priority: 10, is_active: true,
    }],
  });
  assert.equal(resolved.propertyId, 'west-rich');
  assert.equal(resolved.matchedBy, 'reference_regex:west-reference');
});

test('resolveImportContext uses an account-scoped amount rule after reference rules', () => {
  const entry = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 10:00:00
    Transaction ID : 003000005
    Account Paid To : ****5555
    Amount Received : R 2,200.00
    Reference : PAYMENT
    Available Balance : R 20,000.00
  `)!;
  const resolved = resolveImportContext({
    entry,
    organizationId: 'org-1',
    propertyMappings: [],
    unitMatchHints: [{
      id: 'quarry-amount', property_id: 'quarry', unit_id: null,
      account_number_suffix: '5555', matcher_type: 'amount_equals', matcher_value: '',
      amount_value: 2200, priority: 20, is_active: true,
    }],
  });
  assert.equal(resolved.propertyId, 'quarry');
  assert.equal(resolved.matchedBy, 'amount_equals:quarry-amount');
});

test('resolveImportContext leaves conflicting strongest property rules unresolved', () => {
  const entry = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 01/07/2026 10:00:00
    Transaction ID : 003000006
    Account Paid To : ****5555
    Amount Received : R 2,200.00
    Reference : SHARED PAYMENT
    Available Balance : R 20,000.00
  `)!;
  const baseHint = {
    unit_id: null, account_number_suffix: '5555', matcher_type: 'reference_contains' as const,
    matcher_value: 'SHARED', amount_value: null, priority: 10, is_active: true,
  };
  const resolved = resolveImportContext({
    entry,
    organizationId: 'org-1',
    propertyMappings: [{
      id: 'map-main', organization_id: 'org-1', property_id: 'quarry',
      account_number_suffix: '5555', property_name: 'Quarry Heights', is_active: true,
    }],
    unitMatchHints: [
      { ...baseHint, id: 'quarry-rule', property_id: 'quarry' },
      { ...baseHint, id: 'west-rule', property_id: 'west-rich' },
    ],
  });
  assert.equal(resolved.propertyId, null);
  assert.equal(resolved.matchedBy, null);
});

test('a property-locked old account ignores generic hints from other properties', () => {
  const entry = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 07/07/2026 09:00:00
    Transaction ID : old-west-account
    Account Paid To : ****9613
    Amount Received : R 1,900.00
    Reference : Wr Room11
  `);
  assert.ok(entry);
  const resolved = resolveImportContext({
    entry,
    organizationId: 'org-1',
    propertyMappings: [{
      id: 'west-old', organization_id: 'org-1', property_id: 'west-rich',
      account_number_suffix: '9613', property_name: 'West Rich', is_active: true,
    }],
    unitMatchHints: [
      { id: 'qh-11', property_id: 'quarry', unit_id: 'qh-room-11', matcher_type: 'reference_contains', matcher_value: 'Room11', amount_value: null, priority: 10, is_active: true },
      { id: 'wr-11', property_id: 'west-rich', unit_id: 'wr-room-11', matcher_type: 'reference_contains', matcher_value: 'Room11', amount_value: null, priority: 10, is_active: true },
    ],
  });
  assert.equal(resolved.propertyId, 'west-rich');
  assert.deepEqual(resolved.unitHints.map((hint) => hint.unitId), ['wr-room-11']);
});

test('mixed legacy account uses an account-scoped amount rule to resolve generic room conflicts', () => {
  const entry = parseCapitecTransactionText(`
    Transaction Type : Incoming Funds
    Date Time Actioned : 25/06/2026 09:00:00
    Transaction ID : mixed-west
    Account Paid To : ****6570
    Amount Received : R 1,900.00
    Reference : Mzimela Room12
  `);
  assert.ok(entry);
  const common = { amount_value: null, priority: 10, is_active: true };
  const resolved = resolveImportContext({
    entry,
    organizationId: 'org-1',
    propertyMappings: [],
    unitMatchHints: [
      { ...common, id: 'qh-room', property_id: 'quarry', unit_id: 'qh-12', matcher_type: 'reference_contains', matcher_value: 'Room12' },
      { ...common, id: 'wr-room', property_id: 'west', unit_id: 'wr-12', matcher_type: 'reference_contains', matcher_value: 'Room12' },
      { ...common, id: 'wr-amount', property_id: 'west', unit_id: null, account_number_suffix: '6570', matcher_type: 'amount_equals', matcher_value: '', amount_value: 1900, priority: 50 },
    ],
  });
  assert.equal(resolved.propertyId, 'west');
  assert.deepEqual(resolved.unitHints.map((hint) => hint.unitId), ['wr-12', null]);
});
