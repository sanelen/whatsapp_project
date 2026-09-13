import assert from 'node:assert/strict';
import test from 'node:test';
import { isReconciliationDue, reconciliationPeriods, summarizeMailboxCoverage } from './bank-import-reconciliation';

test('reconciliation cadence is a true 72 hours across month boundaries', () => {
  const now = new Date('2026-08-01T05:00:00Z');
  assert.equal(isReconciliationDue('2026-07-29T05:00:01Z', now), false);
  assert.equal(isReconciliationDue('2026-07-29T05:00:00Z', now), true);
});

test('reconciliation scans the six-month rent window around the active period', () => {
  assert.deepEqual(reconciliationPeriods(new Date('2026-07-08T10:00:00Z')), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(reconciliationPeriods(new Date('2026-07-20T10:00:00Z')), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
});

test('mailbox coverage compares stable file hashes instead of Gmail message ids', () => {
  const summary = summarizeMailboxCoverage({
    sourceMailbox: 'source@example.com',
    destinationMailbox: 'info.hambatrading@gmail.com',
    occurrences: [
      { mailboxEmail: 'source@example.com', fileSha256: 'a' },
      { mailboxEmail: 'source@example.com', fileSha256: 'b' },
      { mailboxEmail: 'info.hambatrading@gmail.com', fileSha256: 'b' },
      { mailboxEmail: 'info.hambatrading@gmail.com', fileSha256: 'c' },
    ],
  });
  assert.deepEqual(summary, {
    sourceMailbox: 'source@example.com',
    destinationMailbox: 'info.hambatrading@gmail.com',
    sourceFiles: 2,
    destinationFiles: 2,
    presentInBoth: 1,
    missingFromDestination: 1,
    destinationOnly: 1,
    comparisonReady: true,
  });
});
