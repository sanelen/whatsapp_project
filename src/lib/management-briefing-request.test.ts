import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManagementBriefingRequest, oneOffManagementConfig } from './management-briefing-request';

const input = { propertyId: '11111111-1111-4111-8111-111111111111', period: '2026-12' };
test('one-off requests accept only an explicit building and billing month', () => {
  assert.deepEqual(parseManagementBriefingRequest(input), input);
  for (const invalid of [null, [], {}, { ...input, propertyId: 'all' }, { ...input, period: '2026-13' },
    { ...input, recipient: '27820000000' }, { ...input, organizationId: 'other' }, { ...input, template: 'other' }, { ...input, force: true }]) {
    assert.equal(parseManagementBriefingRequest(invalid), null);
  }
});
test('one-off scope preserves the configured recipient and does not enroll recurring buildings', () => {
  const configured = { propertyId: 'recurring-building', recipient: '27820000000', organizationId: 'org', template: 'approved', language: 'en_US', dashboardOrigin: 'https://example.com' };
  const oneOff = oneOffManagementConfig(configured, input);
  assert.deepEqual(oneOff, { ...configured, propertyId: input.propertyId });
  assert.equal(configured.propertyId, 'recurring-building');
});
