import assert from 'node:assert/strict';
import test from 'node:test';
import { isReconciliationDue, reconciliationPeriods, summarizeMailboxCoverage } from './bank-import-reconciliation';

test('reconciliation cadence is a true 72 hours across month boundaries', () => {
  const now = new Date('2026-08-01T05:00:00Z');
  assert.equal(isReconciliationDue('2026-07-29T05:00:01Z', now), false);
  assert.equal(isReconciliationDue('2026-07-29T05:00:00Z', now), true);
});

test('reconciliation scans the current and previous two rent periods', () => {
  assert.deepEqual(reconciliationPeriods(new Date('2026-07-20T10:00:00Z')), ['2026-07', '2026-06', '2026-05']);
});

test('mailbox coverage compares stable file hashes instead of Gmail message ids', () => {
  const summary = summarizeMailboxCoverage({
    sourceMailbox: 'sanele.ngcobo@gmail.com',
    destinationMailbox: 'info.hambatrading@gmail.com',
    occurrences: [
      { mailboxEmail: 'sanele.ngcobo@gmail.com', fileSha256: 'a' },
      { mailboxEmail: 'sanele.ngcobo@gmail.com', fileSha256: 'b' },
      { mailboxEmail: 'info.hambatrading@gmail.com', fileSha256: 'b' },
      { mailboxEmail: 'info.hambatrading@gmail.com', fileSha256: 'c' },
    ],
  });
  assert.deepEqual(summary, {
    sourceMailbox: 'sanele.ngcobo@gmail.com',
    destinationMailbox: 'info.hambatrading@gmail.com',
    sourceFiles: 2,
    destinationFiles: 2,
    presentInBoth: 1,
    missingFromDestination: 1,
    destinationOnly: 1,
    comparisonReady: true,
  });
});
