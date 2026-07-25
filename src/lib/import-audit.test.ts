import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImportAuditReview } from './import-audit';

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
