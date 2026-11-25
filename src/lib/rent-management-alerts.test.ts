import test from 'node:test';
import assert from 'node:assert/strict';
import { managementAlertConfig, deliverManagementAlert, type AlertDependencies, type AlertImportRun } from './rent-management-alerts';
import { buildMonthlyPaymentsDashboardSnapshot } from './monthly-payments';

const env = { RENT_MANAGEMENT_ALERTS_ENABLED: 'true', RENT_MANAGEMENT_ALERT_OPT_IN: 'true', RENT_MANAGEMENT_ALERT_RECIPIENT: '27820000000', RENT_MANAGEMENT_ALERT_ORGANIZATION_ID: 'org', RENT_MANAGEMENT_ALERT_PROPERTY_ID: 'p', RENT_MANAGEMENT_ALERT_TEMPLATE: 'rent_collections', APP_URL: 'https://example.com' };
const now = new Date('2026-11-07T12:00:00Z');
const run: AlertImportRun = { id: 'run-1', organization_id: 'org', status: 'completed', trigger: 'scheduled', completed_at: now.toISOString(), reconciliation_summary: { failedOrPendingFiles: 0, entriesMissingPaymentReference: 0, periodsChecked: ['2026-11'] } };
function harness(count = 2) {
  let reads = 0;
  const messages: string[][] = [];
  const states: string[] = [];
  const keys = new Set<string>();
  const snapshot = buildMonthlyPaymentsDashboardSnapshot({ organizations: [{ id: 'org', name: 'Test' }], properties: [{ id: 'p', name: 'Test building', organization_id: 'org', location: 'Test' }],
    units: Array.from({ length: count }, (_, i) => ({ id: `u${i}`, property_id: 'p', label: `Room ${i}`, rent_amount: 2200, occupancy_status: 'occupied' as const, is_blocked: false })),
    periods: Array.from({ length: count }, (_, i) => ({ id: `period${i}`, unit_id: `u${i}`, expected_amount: 2200, period_start: '2026-11-01', due_date: '2026-11-05', status: 'unpaid' as const, is_blocked: false })), references: [],
  }, { currentDate: now });
  const deps: AlertDependencies = {
    async readDashboard() { reads++; return snapshot; },
    async claim(key) { if (keys.has(key)) return false; keys.add(key); return true; },
    async send(_config, parameters) { messages.push(parameters); return `message-${messages.length}`; },
    async record(_key, state) { states.push(state); },
  };
  return { deps, messages, states, snapshot, reads: () => reads };
}
test('delivery is disabled by default and requires explicit recipient opt-in and HTTPS destination', () => {
  assert.equal(managementAlertConfig({}), null);
  assert.equal(managementAlertConfig({ ...env, RENT_MANAGEMENT_ALERT_OPT_IN: 'false' }), null);
  assert.equal(managementAlertConfig({ ...env, RENT_MANAGEMENT_ALERT_RECIPIENT: '' }), null);
  assert.equal(managementAlertConfig({ ...env, APP_URL: 'http://localhost' }), null);
  assert.ok(managementAlertConfig(env));
});
test('no data is read for disabled, partial, manual, stale, wrong-organization or incomplete imports', async () => {
  const h = harness();
  await deliverManagementAlert(run, null, h.deps, now);
  for (const invalid of [
    { ...run, status: 'partial' }, { ...run, trigger: 'manual' }, { ...run, organization_id: 'other' },
    { ...run, completed_at: '2026-11-06T12:00:00Z' }, { ...run, completed_at: 'invalid' },
    { ...run, completed_at: '2026-11-08T12:00:00Z' },
    { ...run, reconciliation_summary: { ...run.reconciliation_summary, failedOrPendingFiles: 1 } },
    { ...run, reconciliation_summary: null },
  ]) await deliverManagementAlert(invalid, managementAlertConfig(env), h.deps, now);
  assert.equal(h.reads(), 0); assert.equal(h.messages.length, 0);
});
test('successful scheduled import sends scoped template parts once even on replay', async () => {
  const h = harness(40);
  const result = await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(result.state, 'sent'); assert.ok(h.messages.length > 1);
  assert.match(h.messages[0][2], /Room 0:.*due 2026-11-05 overdue/);
  assert.ok(h.messages.every(parameters => parameters.join('').length < 1024));
  assert.ok(h.messages.every(parameters => new URL(parameters[3]).searchParams.get('building') === 'p'));
  const count = h.messages.length;
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'already_claimed');
  assert.equal(h.messages.length, count);
});
test('provider uncertainty is recorded and never resent automatically', async () => {
  const h = harness(); let attempts = 0;
  h.deps.send = async () => { attempts++; throw new Error('timeout'); };
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'delivery_needs_review');
  await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(attempts, 1); assert.deepEqual(h.states, ['unknown']);
});
test('missing charges, due dates or import period prevent delivery', async () => {
  const h = harness();
  const month = h.snapshot.recentMonths.find(month => month.isCurrent)!;
  month.locations[0].balances.chargeMissingCount = 1;
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'balances_incomplete');
  month.locations[0].balances.chargeMissingCount = 0;
  month.locations[0].balances.unknownDueDateCount = 1;
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'balances_incomplete');
  assert.equal((await deliverManagementAlert({ ...run, reconciliation_summary: { ...run.reconciliation_summary, periodsChecked: [] } }, managementAlertConfig(env), h.deps, now)).state, 'period_not_refreshed');
  assert.equal(h.messages.length, 0);
});
