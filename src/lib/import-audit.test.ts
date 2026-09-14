import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImportAuditReview, importAuditDriveUrl } from './import-audit';

test('source links open the archived Drive file, never Gmail', () => {
  assert.equal(importAuditDriveUrl('archive-id', { driveFileId: 'original-id' }), 'https://drive.google.com/file/d/archive-id/view');
  assert.equal(importAuditDriveUrl(null, { driveFileId: 'original-id' }), 'https://drive.google.com/file/d/original-id/view');
  assert.equal(importAuditDriveUrl(null, { gmail_message_id: 'email-id' }), null);
  assert.equal(importAuditDriveUrl(null, null), null);
});

test('retains unsupported Capitec PDFs for operator review', () => {
  assert.deepEqual(
    classifyImportAuditReview({
      parserStatus: 'unsupported',
      importStatus: 'processed',
      transactionMatchStatuses: [],
    }),
    {
      status: 'unsupported',
      reason: 'Capitec evidence was retained, but this PDF format did not produce a normalized transaction.',
      needsOperatorReview: true,
    }
  );
});

test('routes normalized but unmatched payments to the unprocessed queue', () => {
  const result = classifyImportAuditReview({
    parserStatus: 'parsed',
    importStatus: 'processed',
    transactionMatchStatuses: ['unmatched'],
  });

  assert.equal(result.status, 'unmatched');
  assert.equal(result.needsOperatorReview, true);
});

test('marks a fully matched file ready regardless of whether references are signed off', () => {
  const result = classifyImportAuditReview({
    parserStatus: 'parsed',
    importStatus: 'processed',
    transactionMatchStatuses: ['matched', 'signed-off'],
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.needsOperatorReview, false);
});

test('retains parsed files that produced no incoming payment record', () => {
  const result = classifyImportAuditReview({
    parserStatus: 'parsed',
    importStatus: 'processed',
    transactionMatchStatuses: [],
  });

  assert.equal(result.status, 'no-payment-record');
  assert.equal(result.needsOperatorReview, true);
});
