import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledImportDue, countCurrentProblemFiles, sourceCheckState } from './bank-import-automation';

const currentCycle = { period: '2026-12', sources: ['gmail', 'drive'], checkedAt: '2026-11-25T05:50:00Z', failedOrPendingFiles: 0, entriesMissingPaymentReference: 0 };
const run = { status: 'completed', startedAt: '2026-11-25T05:48:00Z', summary: { currentCycle } };
test('daily cadence tolerates cron jitter and does not postpone tomorrow after an evening run', () => {
  assert.equal(scheduledImportDue(run, new Date('2026-11-26T05:00:00Z')), true);
  assert.equal(scheduledImportDue(run, new Date('2026-11-25T17:00:00Z')), false);
  assert.equal(scheduledImportDue({ ...run, startedAt: '2026-11-25T20:00:00Z' }, new Date('2026-11-26T05:00:00Z')), true);
  assert.equal(scheduledImportDue({ ...run, summary: {} }), true, 'Legacy Gmail-only run needs current-cycle coverage');
});
test('current evidence gate retains unknown and in-window files while separating proven historical backlog', () => {
  const file = (...dates: Array<string | null>) => ({ bank_import_entries: dates.map(transaction_date => ({ transaction_date })) });
  assert.equal(countCurrentProblemFiles([file('2026-11-08'), file('2026-11-09'), file('2026-12-08'), file('2026-12-09'), file(null), file(), file('2026-11-01', '2026-11-10')], { startDate: '2026-11-09', endDate: '2026-12-08' }), 5);
});
test('monitor distinguishes fresh, stale, failed, stalled and unverified source checks', () => {
  assert.equal(sourceCheckState(run, new Date('2026-11-25T06:00:00Z')), 'fresh');
  assert.equal(sourceCheckState(run, new Date('2026-11-26T18:00:00Z')), 'stale');
  assert.equal(sourceCheckState({ ...run, status: 'failed' }), 'needs_review');
  assert.equal(sourceCheckState({ ...run, status: 'running' }, new Date('2026-11-25T08:00:00Z')), 'stalled');
  assert.equal(sourceCheckState({ ...run, summary: {} }), 'not_verified');
  assert.equal(sourceCheckState(null), 'not_started');
});
