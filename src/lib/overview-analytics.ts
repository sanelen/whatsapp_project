import { unstable_cache } from 'next/cache';

export const overviewWindows = ['24h', '7d', '30d', 'lifetime'] as const;
export type OverviewWindow = (typeof overviewWindows)[number];

export const overviewChannels = ['all', 'web', 'whatsapp', 'api'] as const;
export type OverviewChannel = (typeof overviewChannels)[number];

export type AnalyticsEvent = {
  id: string;
  propertyId: string;
  fingerprintId: string;
  channel: Exclude<OverviewChannel, 'all'>;
  messageCount: number;
  characterCount: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  createdAt: string;
};

export type OverviewMetricCard = {
  label: string;
  value: string;
  detail: string;
};

export type OverviewUsageCard = {
  label: string;
  used: number;
  limit: number;
  percent: number;
  detail: string;
};

export type OverviewAnalyticsSummary = {
  propertyId: string;
  window: OverviewWindow;
  windowLabel: string;
  channel: OverviewChannel;
  generatedAt: string;
  mode: 'mock';
  metrics: {
    users: OverviewMetricCard;
    tokens: OverviewMetricCard;
    messages: OverviewMetricCard;
  };
  usage: {
    characters: OverviewUsageCard;
    tokens: OverviewUsageCard;
    messages: OverviewUsageCard;
  };
};

const PLAN_LIMITS = {
  characters: 250_000,
  tokens: 100_000,
  messages: 50,
} as const;

const WINDOW_LABELS: Record<OverviewWindow, string> = {
  '24h': '24 Hours',
  '7d': '7 Days',
  '30d': '30 Days',
  lifetime: 'Lifetime',
};

const WINDOW_DURATION_MS: Record<Exclude<OverviewWindow, 'lifetime'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 1_000_003;
  }
  return hash;
}

function clampPercent(used: number, limit: number): number {
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatLimit(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return value.toString();
}

function createMockAnalyticsEvents(propertyId: string, now = new Date()): AnalyticsEvent[] {
  const seed = hashString(propertyId);
  const fingerprintBase = (seed % 700) + 100;

  const templates = [
    { hoursAgo: 2, channel: 'web', messages: 8, characters: 1940, prompt: 630, completion: 420, cached: 90, fingerprintOffset: 0 },
    { hoursAgo: 9, channel: 'whatsapp', messages: 5, characters: 1160, prompt: 380, completion: 250, cached: 40, fingerprintOffset: 1 },
    { hoursAgo: 20, channel: 'api', messages: 4, characters: 780, prompt: 260, completion: 170, cached: 0, fingerprintOffset: 2 },
    { hoursAgo: 34, channel: 'web', messages: 7, characters: 1620, prompt: 520, completion: 330, cached: 60, fingerprintOffset: 0 },
    { hoursAgo: 70, channel: 'whatsapp', messages: 6, characters: 1480, prompt: 470, completion: 290, cached: 55, fingerprintOffset: 3 },
    { hoursAgo: 140, channel: 'api', messages: 3, characters: 620, prompt: 210, completion: 120, cached: 0, fingerprintOffset: 4 },
    { hoursAgo: 410, channel: 'web', messages: 10, characters: 2480, prompt: 790, completion: 520, cached: 140, fingerprintOffset: 5 },
    { hoursAgo: 980, channel: 'whatsapp', messages: 11, characters: 2860, prompt: 910, completion: 610, cached: 160, fingerprintOffset: 6 },
  ] as const;

  return templates.map((template, index) => {
    const jitter = (seed + index * 17) % 180;
    const multiplier = 1 + ((seed + index) % 4) * 0.08;

    return {
      id: `${propertyId}-analytics-${index + 1}`,
      propertyId,
      fingerprintId: `fp_${fingerprintBase + template.fingerprintOffset}`,
      channel: template.channel,
      messageCount: Math.round(template.messages * multiplier),
      characterCount: Math.round(template.characters * multiplier) + jitter,
      promptTokens: Math.round(template.prompt * multiplier),
      completionTokens: Math.round(template.completion * multiplier),
      cachedTokens: Math.round(template.cached * multiplier),
      createdAt: new Date(now.getTime() - template.hoursAgo * 60 * 60 * 1000).toISOString(),
    };
  });
}

export function filterAnalyticsEvents(
  events: AnalyticsEvent[],
  window: OverviewWindow,
  channel: OverviewChannel,
  now = new Date()
): AnalyticsEvent[] {
  const threshold =
    window === 'lifetime' ? null : now.getTime() - WINDOW_DURATION_MS[window];

  return events.filter((event) => {
    const matchesChannel = channel === 'all' || event.channel === channel;
    const matchesWindow = threshold === null || new Date(event.createdAt).getTime() >= threshold;
    return matchesChannel && matchesWindow;
  });
}

export function summarizeAnalyticsEvents(
  propertyId: string,
  events: AnalyticsEvent[],
  window: OverviewWindow,
  channel: OverviewChannel,
  now = new Date()
): OverviewAnalyticsSummary {
  const filtered = filterAnalyticsEvents(events, window, channel, now);
  const uniqueUsers = new Set(filtered.map((event) => event.fingerprintId)).size;
  const messageCount = filtered.reduce((sum, event) => sum + event.messageCount, 0);
  const characterCount = filtered.reduce((sum, event) => sum + event.characterCount, 0);
  const tokenCount = filtered.reduce(
    (sum, event) => sum + event.promptTokens + event.completionTokens + event.cachedTokens,
    0
  );
  const cachedTokenCount = filtered.reduce((sum, event) => sum + event.cachedTokens, 0);

  return {
    propertyId,
    window,
    windowLabel: WINDOW_LABELS[window],
    channel,
    generatedAt: now.toISOString(),
    mode: 'mock',
    metrics: {
      users: {
        label: 'Users',
        value: uniqueUsers.toLocaleString(),
        detail: `${uniqueUsers.toLocaleString()} unique fingerprint IDs`,
      },
      tokens: {
        label: 'Tokens',
        value: formatCompactNumber(tokenCount),
        detail: `${cachedTokenCount.toLocaleString()} cached tokens included`,
      },
      messages: {
        label: 'Messages',
        value: messageCount.toLocaleString(),
        detail: `${filtered.length.toLocaleString()} tracked interaction batches`,
      },
    },
    usage: {
      characters: {
        label: 'Characters',
        used: characterCount,
        limit: PLAN_LIMITS.characters,
        percent: clampPercent(characterCount, PLAN_LIMITS.characters),
        detail: `${formatCompactNumber(characterCount)} / ${formatLimit(PLAN_LIMITS.characters)}`,
      },
      tokens: {
        label: 'Tokens',
        used: tokenCount,
        limit: PLAN_LIMITS.tokens,
        percent: clampPercent(tokenCount, PLAN_LIMITS.tokens),
        detail: `${formatCompactNumber(tokenCount)} / ${formatLimit(PLAN_LIMITS.tokens)}`,
      },
      messages: {
        label: 'Messages',
        used: messageCount,
        limit: PLAN_LIMITS.messages,
        percent: clampPercent(messageCount, PLAN_LIMITS.messages),
        detail: `${messageCount.toLocaleString()} / ${PLAN_LIMITS.messages.toLocaleString()}`,
      },
    },
  };
}

async function readMockOverviewAnalytics(
  propertyId: string,
  window: OverviewWindow,
  channel: OverviewChannel
): Promise<OverviewAnalyticsSummary> {
  const events = createMockAnalyticsEvents(propertyId);
  return summarizeAnalyticsEvents(propertyId, events, window, channel);
}

const readCachedOverviewAnalytics = unstable_cache(
  async (propertyId: string, window: OverviewWindow, channel: OverviewChannel) =>
    readMockOverviewAnalytics(propertyId, window, channel),
  ['overview-analytics'],
  { revalidate: 300, tags: ['overview-analytics'] }
);

export async function getOverviewAnalyticsSummary(
  propertyId: string,
  window: OverviewWindow,
  channel: OverviewChannel
): Promise<OverviewAnalyticsSummary> {
  return readCachedOverviewAnalytics(propertyId, window, channel);
}

export function isOverviewWindow(value: string): value is OverviewWindow {
  return overviewWindows.includes(value as OverviewWindow);
}

export function isOverviewChannel(value: string): value is OverviewChannel {
  return overviewChannels.includes(value as OverviewChannel);
}

export function getOverviewWindowLabel(window: OverviewWindow): string {
  return WINDOW_LABELS[window];
}
