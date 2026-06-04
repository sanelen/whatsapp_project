import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAnalyticsEvents,
  getOverviewWindowLabel,
  isOverviewChannel,
  isOverviewWindow,
  summarizeAnalyticsEvents,
  type AnalyticsEvent,
} from './overview-analytics';

const now = new Date('2026-06-04T12:00:00.000Z');

const events: AnalyticsEvent[] = [
  {
    id: 'evt-1',
    propertyId: 'prop-1',
    fingerprintId: 'fp-1',
    channel: 'web',
    messageCount: 3,
    characterCount: 300,
    promptTokens: 100,
    completionTokens: 50,
    cachedTokens: 10,
    createdAt: '2026-06-04T10:00:00.000Z',
  },
  {
    id: 'evt-2',
    propertyId: 'prop-1',
    fingerprintId: 'fp-1',
    channel: 'whatsapp',
    messageCount: 2,
    characterCount: 200,
    promptTokens: 80,
    completionTokens: 30,
    cachedTokens: 0,
    createdAt: '2026-06-03T10:00:00.000Z',
  },
  {
    id: 'evt-3',
    propertyId: 'prop-1',
    fingerprintId: 'fp-2',
    channel: 'api',
    messageCount: 4,
    characterCount: 500,
    promptTokens: 140,
    completionTokens: 60,
    cachedTokens: 20,
    createdAt: '2026-05-20T10:00:00.000Z',
  },
];

test('filterAnalyticsEvents narrows events by window and channel', () => {
  const filtered = filterAnalyticsEvents(events, '24h', 'web', now);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 'evt-1');
});

test('summarizeAnalyticsEvents counts unique fingerprint users', () => {
  const summary = summarizeAnalyticsEvents('prop-1', events, '7d', 'all', now);

  assert.equal(summary.metrics.users.value, '1');
  assert.equal(summary.metrics.users.detail, '1 unique fingerprint IDs');
});

test('summarizeAnalyticsEvents accumulates token and message totals', () => {
  const summary = summarizeAnalyticsEvents('prop-1', events, 'lifetime', 'all', now);

  assert.equal(summary.metrics.tokens.value, '490');
  assert.equal(summary.metrics.messages.value, '9');
  assert.equal(summary.usage.characters.used, 1000);
});

test('overview helpers validate supported filters', () => {
  assert.equal(isOverviewWindow('30d'), true);
  assert.equal(isOverviewWindow('90d'), false);
  assert.equal(isOverviewChannel('whatsapp'), true);
  assert.equal(isOverviewChannel('email'), false);
  assert.equal(getOverviewWindowLabel('24h'), '24 Hours');
});
