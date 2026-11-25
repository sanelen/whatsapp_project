import test from 'node:test';
import assert from 'node:assert/strict';
import { managementAlertConfig, managementAlertTransportConfig, deliverManagementAlert, type AlertDependencies, type AlertImportRun } from './rent-management-alerts';
import { buildMonthlyPaymentsDashboardSnapshot } from './monthly-payments';

const env = { RENT_MANAGEMENT_ALERTS_ENABLED: 'true', RENT_MANAGEMENT_ALERT_OPT_IN: 'true', RENT_MANAGEMENT_ALERT_RECIPIENT: '27820000000', RENT_MANAGEMENT_ALERT_ORGANIZATION_ID: 'org', RENT_MANAGEMENT_ALERT_PROPERTY_ID: 'p', RENT_MANAGEMENT_ALERT_TEMPLATE: 'rent_collections', APP_URL: 'https://example.com' };
const now = new Date('2026-11-07T12:00:00Z');
test('alerts require their own complete credential pair and never borrow shared chat credentials', () => {
  const shared = { META_WHATSAPP_ACCESS_TOKEN: 'chat-token', META_WHATSAPP_PHONE_NUMBER_ID: 'chat-sender' };
  assert.equal(managementAlertTransportConfig(shared), null);
  assert.equal(managementAlertTransportConfig({ ...shared, RENT_MANAGEMENT_ALERT_META_ACCESS_TOKEN: 'alert-token' }), null);
  assert.equal(managementAlertTransportConfig({ ...shared, RENT_MANAGEMENT_ALERT_META_PHONE_NUMBER_ID: 'alert-sender' }), null);
  assert.deepEqual(managementAlertTransportConfig({ ...shared, RENT_MANAGEMENT_ALERT_META_ACCESS_TOKEN: ' alert-token ', RENT_MANAGEMENT_ALERT_META_PHONE_NUMBER_ID: ' alert-sender ' }), { token: 'alert-token', phoneId: 'alert-sender' });
});
const run: AlertImportRun = { id: 'run-1', organization_id: 'org', status: 'completed', trigger: 'scheduled', completed_at: now.toISOString(), reconciliation_summary: { autoMatch: { failed: 0 }, failedOrPendingFiles: 0, entriesMissingPaymentReference: 0, periodsChecked: ['2026-11'], currentCycle: { period: '2026-11', sources: ['gmail', 'drive'], checkedAt: now.toISOString(), failedOrPendingFiles: 0, entriesMissingPaymentReference: 0 } } };
function harness(count = 2) {
  let reads = 0;
  const messages: string[][] = [];
  const states: string[] = [];
  const keys = new Set<string>();
  let lastContentHash: string | undefined;
  const snapshot = buildMonthlyPaymentsDashboardSnapshot({ organizations: [{ id: 'org', name: 'Test' }], properties: [{ id: 'p', name: 'Test building', organization_id: 'org', location: 'Test' }],
    units: Array.from({ length: count }, (_, i) => ({ id: `u${i}`, property_id: 'p', label: `Room ${i}`, rent_amount: 2200, occupancy_status: 'occupied' as const, is_blocked: false })),
    periods: Array.from({ length: count }, (_, i) => ({ id: `period${i}`, unit_id: `u${i}`, expected_amount: 2200, period_start: '2026-11-01', due_date: '2026-11-05', status: 'unpaid' as const, is_blocked: false })), references: [],
  }, { currentDate: now });
  const deps: AlertDependencies = {
    async readDashboard() { reads++; return snapshot; },
    async claim(key, _run, _config, contentHash, scheduled) { if (keys.has(key)) return false; if (!scheduled && lastContentHash === contentHash) return 'unchanged'; keys.add(key); lastContentHash = contentHash; return true; },
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
    { ...run, status: 'partial' }, { ...run, trigger: 'unsupported' }, { ...run, organization_id: 'other' },
    { ...run, completed_at: '2026-11-06T12:00:00Z' }, { ...run, completed_at: 'invalid' },
    { ...run, completed_at: '2026-11-08T12:00:00Z' },
    { ...run, reconciliation_summary: { ...run.reconciliation_summary, currentCycle: { ...run.reconciliation_summary!.currentCycle!, failedOrPendingFiles: 1 } } },
    { ...run, reconciliation_summary: null },
    { ...run, reconciliation_summary: { ...run.reconciliation_summary, autoMatch: { failed: 1 } } },
  ]) await deliverManagementAlert(invalid, managementAlertConfig(env), h.deps, now);
  assert.equal(h.reads(), 0); assert.equal(h.messages.length, 0);
});
test('successful scheduled import sends one compact briefing per day even across runs', async () => {
  const h = harness(40);
  const result = await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(result.state, 'sent'); assert.equal(h.messages.length, 1);
  assert.match(h.messages[0][2], /Room 0:.*overdue; due 2026-11-05/);
  assert.ok(h.messages.every(parameters => parameters.join('').length < 1024));
  assert.ok(h.messages.every(parameters => new URL(parameters[3]).searchParams.get('building') === 'p'));
  const count = h.messages.length;
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'already_claimed');
  assert.equal(h.messages.length, count);
  assert.equal((await deliverManagementAlert({ ...run, id: 'another-run' }, managementAlertConfig(env), h.deps, now)).state, 'already_claimed');
});
test('provider uncertainty is recorded and never resent automatically', async () => {
  const h = harness(); let attempts = 0;
  h.deps.send = async () => { attempts++; throw new Error('timeout'); };
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'delivery_needs_review');
  await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(attempts, 1); assert.deepEqual(h.states, ['unknown']);
});
test('configuration recovery uses the same fresh audit once and refuses an expired audit', async () => {
  const h = harness();
  assert.equal((await deliverManagementAlert(run, null, h.deps, now)).state, 'disabled');
  assert.equal(h.messages.length, 0);
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).sent, 1);
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).state, 'already_claimed');
  assert.equal(h.messages.length, 1);
  const stale = harness();
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), stale.deps, new Date('2026-11-07T15:00:00Z'))).state, 'import_not_ready');
  assert.equal(stale.messages.length, 0);
});
test('alert room lines exclude fully pending rent and only request the partial shortfall', async () => {
  const h = harness();
  const rooms = h.snapshot.recentMonths.find(month => month.isCurrent)!.locations[0].rooms;
  rooms[0].pendingAmount = 2200;
  rooms[1].pendingAmount = 700;
  await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(h.messages.length, 1);
  assert.doesNotMatch(h.messages[0][2], /Room 0:/);
  assert.match(h.messages[0][2], /Room 1:.*1[\s\u00a0]500/);
  assert.match(h.messages[0][1], /Pending.*2[\s\u00a0]900/);
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

test('proven historical backlog does not block clean current cycle; missing source audit does', async () => {
  const h = harness();
  assert.equal((await deliverManagementAlert({ ...run, reconciliation_summary: { ...run.reconciliation_summary, failedOrPendingFiles: 33 } }, managementAlertConfig(env), h.deps, now)).sent, 1);
  for (const currentCycle of [undefined, { ...run.reconciliation_summary!.currentCycle!, sources: ['gmail'] }, { ...run.reconciliation_summary!.currentCycle!, checkedAt: 'invalid' }]) {
    const blocked = harness();
    assert.equal((await deliverManagementAlert({ ...run, reconciliation_summary: { ...run.reconciliation_summary, currentCycle } }, managementAlertConfig(env), blocked.deps, now)).state, 'import_not_ready');
    assert.equal(blocked.messages.length, 0);
  }
});
test('future due rent is explicitly separate from overdue and pending confirmation', async () => {
  const h = harness();
  const rooms = h.snapshot.recentMonths.find(month => month.isCurrent)!.locations[0].rooms;
  for (const room of rooms) { room.dueDate = '2026-11-08'; room.overdueAmount = 0; }
  rooms[0].pendingAmount = 2200;
  await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0][2], /1 rooms still to pay; due 2026-11-08/);
  assert.match(h.messages[0][2], /1 rooms await sign-off. 0 overdue/);
  assert.doesNotMatch(h.messages[0][2], /Room 0:/);
});

test('unchanged content is suppressed across dates while a changed pending balance produces a new briefing', async () => {
  const h = harness();
  assert.equal((await deliverManagementAlert(run, managementAlertConfig(env), h.deps, now)).sent, 1);
  const tomorrow = new Date('2026-11-08T12:00:00Z');
  h.snapshot.asOf = '2026-11-08';
  const next = { ...run, id: 'next-day', completed_at: tomorrow.toISOString(), reconciliation_summary: { ...run.reconciliation_summary, currentCycle: { ...run.reconciliation_summary!.currentCycle!, checkedAt: tomorrow.toISOString() } } };
  assert.equal((await deliverManagementAlert(next, managementAlertConfig(env), h.deps, tomorrow, '2026-11')).state, 'unchanged');
  h.snapshot.recentMonths.find(month => month.isCurrent)!.locations[0].rooms[0].pendingAmount = 2200;
  assert.equal((await deliverManagementAlert(next, managementAlertConfig(env), h.deps, tomorrow, '2026-11')).sent, 1);
  assert.equal(h.messages.length, 2);
});

test('explicit one-off mode accepts a fresh manual Both audit but not a different month or failed import', async () => {
  const manual = { ...run, trigger: 'manual' };
  const h = harness();
  // Both manual and scheduled imports feed the date-gated briefing after matching.
  assert.equal((await deliverManagementAlert({ ...manual, reconciliation_summary: { ...manual.reconciliation_summary, autoMatch: undefined } }, managementAlertConfig(env), h.deps, now)).state, 'import_not_ready');
  assert.equal((await deliverManagementAlert(manual, managementAlertConfig(env), h.deps, now, '2026-10')).state, 'period_not_refreshed');
  assert.equal((await deliverManagementAlert({ ...manual, status: 'failed' }, managementAlertConfig(env), h.deps, now, '2026-11')).state, 'import_not_ready');
  assert.equal((await deliverManagementAlert(manual, managementAlertConfig(env), h.deps, now, '2026-11')).sent, 1);
});
test('one-off buildings have independent daily claims and share dedupe with scheduled messages', async () => {
  const h = harness();
  const month = h.snapshot.recentMonths.find(month => month.isCurrent)!;
  month.locations.push({ ...month.locations[0], id: 'second', name: 'Second building' });
  const first = managementAlertConfig(env)!;
  const second = { ...first, propertyId: 'second' };
  assert.equal((await deliverManagementAlert(run, first, h.deps, now, '2026-11')).sent, 1);
  assert.equal((await deliverManagementAlert(run, second, h.deps, now, '2026-11')).sent, 1);
  assert.equal((await deliverManagementAlert(run, first, h.deps, now)).state, 'already_claimed');
  assert.equal(h.messages.length, 2);
  assert.match(h.messages[0][3], /building=p/);
  assert.match(h.messages[1][3], /building=second/);
});
