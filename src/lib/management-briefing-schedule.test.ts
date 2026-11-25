import test from 'node:test';
import assert from 'node:assert/strict';
import { managementBriefingDue, nextManagementBriefingDate, scheduledManagementConfigs, dispatchScheduledBriefings } from './management-briefing-schedule';
import { deliverManagementAlert, type AlertImportRun } from './rent-management-alerts';
import { managementBriefingClaimDecision, managementBriefingOutcome, type BriefingAttempt, type BriefingReceipt } from './management-briefing-status';
import { calculateRentBalance, sumRentBalances } from './rent-collections';
import { scheduledImportDue } from './bank-import-automation';

const config = { propertyId: '11111111-1111-4111-8111-111111111111', organizationId: 'org', recipient: '27820000000', dashboardOrigin: 'https://example.com', template: 'approved', language: 'en_US' };
const ids = [config.propertyId, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
test('December sends only on the 1st and 7th in SAST, including UTC month boundaries', () => {
  for (let day = 1; day <= 31; day++) assert.equal(managementBriefingDue(new Date(`2026-12-${String(day).padStart(2, '0')}T05:30:00Z`)), [1, 7].includes(day));
  assert.equal(managementBriefingDue(new Date('2026-11-30T21:59:59Z')), false);
  assert.equal(managementBriefingDue(new Date('2026-11-30T22:00:00Z')), true);
  assert.equal(managementBriefingDue(new Date('2026-12-07T22:00:00Z')), false);
  assert.equal(nextManagementBriefingDate(new Date('2026-11-25T18:49:05Z')), '2026-12-01');
  assert.equal(nextManagementBriefingDate(new Date('2026-12-01T12:00:00Z')), '2026-12-07');
  assert.equal(nextManagementBriefingDate(new Date('2026-12-07T12:00:00Z')), '2027-01-01');
});
test('only the explicit allowlist is enrolled; non-send days do not call delivery', async () => {
  assert.deepEqual(scheduledManagementConfigs(config, {}), []);
  assert.deepEqual(scheduledManagementConfigs(config, { RENT_MANAGEMENT_ALERT_PROPERTY_IDS: 'all' }), []);
  const configs = scheduledManagementConfigs(config, { RENT_MANAGEMENT_ALERT_PROPERTY_IDS: [...ids, ids[0]].join(',') });
  assert.deepEqual(configs.map(item => item.propertyId), ids);
  let calls = 0;
  assert.equal((await dispatchScheduledBriefings(configs, async () => { calls++; return { state: 'sent', sent: 1 }; }, new Date('2026-11-25T19:00:00Z'))).state, 'not_scheduled_today');
  assert.equal(calls, 0);
  const result = await dispatchScheduledBriefings(configs, async c => { calls++; if (c.propertyId === ids[1]) throw new Error('blocked'); return { state: 'sent', sent: 1 }; }, new Date('2026-12-01T05:30:00Z'));
  assert.equal(calls, 3); assert.equal(result.sent, 2); assert.equal(result.properties[1].state, 'delivery_blocked');
});
test('three distinct briefings on December 1 and 7 even unchanged, with replay capped per property/date', async () => {
  let now = new Date('2026-12-01T05:30:00Z');
  const attempts = new Map<string, BriefingAttempt>();
  const previous = new Map<string, BriefingAttempt>();
  const messages: string[][] = [];
  const rooms = [{ label: 'Room 01', ...calculateRentBalance({ period: { expected_amount: 1900, is_blocked: false, due_date: '2026-12-08' }, references: [], now }) }];
  const configs = ids.map(propertyId => ({ ...config, propertyId }));
  const send = (settings: typeof config, trigger = 'scheduled') => {
    const run: AlertImportRun = { id: 'run', organization_id: 'org', trigger, status: 'completed', completed_at: now.toISOString(), reconciliation_summary: { autoMatch: { failed: 0 }, periodsChecked: ['2026-12'], currentCycle: { sources: ['gmail', 'drive'], period: '2026-12', checkedAt: now.toISOString(), failedOrPendingFiles: 0, entriesMissingPaymentReference: 0 } } };
    return deliverManagementAlert(run, settings, {
      async readDashboard() { return { setupState: 'ready', asOf: now.toISOString().slice(0, 10), recentMonths: [{ key: '2026-12', isCurrent: true, locations: configs.map(c => ({ id: c.propertyId, name: c.propertyId, rooms, balances: sumRentBalances(rooms), unmatchedReferenceCount: 0, unmatchedCollectedAmount: 0 })) }] } as any; },
      async claim(key, _run, c, hash, scheduled) {
        const p = previous.get(c.propertyId) ?? null;
        const decision = managementBriefingClaimDecision(p, key, hash, scheduled, managementBriefingOutcome(p, [], c.recipient, 'sender'), now);
        if (attempts.has(key) || decision === 'already_claimed') return false;
        if (decision !== 'claim') return decision;
        const attempt = { id: key, status: 'sent', content_hash: hash, provider_message_id: 'isolated', created_at: now.toISOString() };
        attempts.set(key, attempt); previous.set(c.propertyId, attempt); return true;
      },
      async send(_c, parameters) { messages.push(parameters); return 'isolated'; }, async record() {},
    }, now);
  };
  for (const day of [1, 7]) {
    now = new Date(`2026-12-0${day}T05:30:00Z`);
    assert.equal((await dispatchScheduledBriefings(configs, c => send(c, day === 1 ? 'manual' : 'scheduled'), now)).sent, 3);
    assert.equal((await dispatchScheduledBriefings(configs, send, now)).sent, 0);
  }
  assert.equal(messages.length, 6); assert.equal(attempts.size, 6);
  assert.deepEqual(messages.slice(0, 3).map(p => new URL(p[3]).searchParams.get('building')), ids);
  assert.equal(messages[0][1], messages[3][1], 'Unchanged figures still sent on the next requested date');
});
test('signed webhook evidence distinguishes accepted, sent, delivered, read and failed; no cross-sender proof', () => {
  const attempt = { id: 'key', status: 'sent', provider_message_id: 'message', content_hash: 'hash', created_at: '2026-11-25T18:49:05Z' };
  const receipt = (status: string): BriefingReceipt => ({ occurred_at: attempt.created_at, payload: { status: { status, recipient_id: config.recipient, errors: status === 'failed' ? [{ code: 131049 }] : [] }, metadata: { phone_number_id: 'sender' } } });
  assert.equal(managementBriefingOutcome(attempt, [], config.recipient, 'sender').state, 'accepted');
  for (const state of ['sent', 'delivered', 'read', 'failed']) assert.equal(managementBriefingOutcome(attempt, [receipt(state)], config.recipient, 'sender').state, state);
  assert.equal(managementBriefingOutcome(attempt, [receipt('read'), receipt('sent')], config.recipient, 'sender').state, 'read');
  assert.equal(managementBriefingOutcome(attempt, [receipt('delivered')], config.recipient, 'other').state, 'accepted');
  const failed = managementBriefingOutcome(attempt, [receipt('failed')], config.recipient, 'sender');
  assert.equal(managementBriefingClaimDecision(attempt, 'next-key', 'hash', true, failed, new Date('2026-11-26T18:49:04Z')), 'provider_cooldown');
  assert.equal(managementBriefingClaimDecision(attempt, 'next-key', 'hash', true, failed, new Date('2026-12-01T05:30:00Z')), 'claim');
  assert.equal(managementBriefingClaimDecision(attempt, 'key', 'hash', true, failed, new Date('2026-11-25T19:00:00Z')), 'already_claimed');
  assert.equal(managementBriefingClaimDecision({ ...attempt, status: 'unknown' }, 'next-key', 'hash', true, failed, new Date('2026-12-01T05:30:00Z')), 'delivery_needs_review');
});
test('a clean completed manual Both import satisfies today; failed, partial or unfinished matching does not', () => {
  const now = new Date('2026-12-01T05:30:00Z');
  const run = { startedAt: '2026-12-01T04:30:00Z', status: 'completed', summary: { autoMatch: { failed: 0 }, currentCycle: { sources: ['gmail', 'drive'], period: '2026-12', checkedAt: '2026-12-01T04:32:00Z', failedOrPendingFiles: 0, entriesMissingPaymentReference: 0 } } };
  assert.equal(scheduledImportDue(run, now, '2026-12'), false);
  for (const status of ['running', 'failed', 'partial']) assert.equal(scheduledImportDue({ ...run, status }, now, '2026-12'), true);
  assert.equal(scheduledImportDue({ ...run, summary: { ...run.summary, autoMatch: undefined } }, now, '2026-12'), true);
  assert.equal(scheduledImportDue(run, now, '2027-01'), true);
  assert.equal(scheduledImportDue(run, new Date('2026-12-02T05:30:00Z'), '2026-12'), true);
});
