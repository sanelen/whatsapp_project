import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGmailSearchQuery,
  extractAttachmentsFromEml,
  getBillingWindowForPeriod,
  parseCapitecTransactionText,
} from './bank-import';

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

test('buildGmailSearchQuery adds billing-window date guards', () => {
  const query = buildGmailSearchQuery(
    {
      subject_filter: 'Capitec Business Transaction Notification',
      label_filter: '',
      last_synced_at: '2026-06-29T20:00:00.000Z',
    },
    getBillingWindowForPeriod('2026-05')
  );

  assert.match(query, /after:2026\/04\/08/);
  assert.match(query, /before:2026\/05\/09/);
  assert.doesNotMatch(query, /after:2026\/06\/29/);
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
  assert.equal(attachments[0].nestedFrom, 'forwarded.eml');
  assert.deepEqual(attachments[0].data, pdfBytes);
});
