import { southAfricaDate } from './rent-collections';
import type { ManagementAlertConfig } from './rent-management-alerts';

export const managementBriefingDays = [1, 7] as const;
export function managementBriefingDue(now = new Date()) {
  return managementBriefingDays.some(day => day === Number(southAfricaDate(now).slice(-2)));
}

/** Explicit allowlist: never silently enroll every property in the organization. */
export function scheduledManagementConfigs(config: ManagementAlertConfig, env: Record<string, string | undefined>) {
  const ids = (env.RENT_MANAGEMENT_ALERT_PROPERTY_IDS ?? '').split(',').map(id => id.trim());
  if (!ids.length || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return [];
  return [...new Set(ids)].map(propertyId => ({ ...config, propertyId }));
}

export function nextManagementBriefingDate(now = new Date(), includeToday = false) {
  const today = southAfricaDate(now);
  if (includeToday && managementBriefingDue(now)) return today;
  const date = new Date(`${today}T12:00:00Z`);
  for (let i = 1; i <= 32; i++) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (managementBriefingDue(date)) return southAfricaDate(date);
  }
  throw new Error('Cannot determine next briefing date');
}

export async function dispatchScheduledBriefings<T extends { state: string; sent: number }>(configs: ManagementAlertConfig[], send: (config: ManagementAlertConfig) => Promise<T>, now = new Date()) {
  if (!managementBriefingDue(now)) return { state: 'not_scheduled_today', sent: 0, properties: [] };
  if (!configs.length) return { state: 'schedule_unconfigured', sent: 0, properties: [] };
  const properties = [];
  // Independent claims: a blocked property must not prevent the other buildings.
  for (const config of configs) {
    try { properties.push({ propertyId: config.propertyId, ...await send(config) }); }
    catch { properties.push({ propertyId: config.propertyId, state: 'delivery_blocked', sent: 0 }); }
  }
  return { state: 'schedule_checked', sent: properties.reduce((sum, result) => sum + result.sent, 0), properties };
}
