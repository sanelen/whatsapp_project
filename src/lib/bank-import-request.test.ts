import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankImportRequest } from './bank-import-request';
test('manual imports require an explicit bounded month or explicit all-month opt-in', () => {
  assert.throws(() => parseBankImportRequest({ source: 'both' }), /Select a billing period/);
  assert.throws(() => parseBankImportRequest({ source: 'all', billingPeriod: '2026-12' }), /Unsupported/);
  assert.throws(() => parseBankImportRequest({ billingPeriod: '2026-13' }), /Invalid/);
  assert.equal(parseBankImportRequest({ billingPeriod: '2026-10', source: 'both' }).billingPeriod, '2026-10');
  assert.equal(parseBankImportRequest({ pullAll: true }).pullAll, true);
});
