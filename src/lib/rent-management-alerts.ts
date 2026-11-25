import { createHash } from 'node:crypto';
import type { MonthlyPaymentsDashboardSnapshot } from './monthly-payments';
import { rentCurrency, rentToReceive, overdueRentToReceive, sumRentBalances, southAfricaDate } from './rent-collections';
import { managementBriefingDue } from './management-briefing-schedule';
import type { CurrentCycleImportAudit } from './bank-import-automation';

export type ManagementAlertConfig = {
  recipient: string; organizationId: string; propertyId: string;
  dashboardOrigin: string; template: string; language: string;
};
export type AlertImportRun = {
  id: string; organization_id: string; status: string; trigger: string; completed_at: string | null;
  reconciliation_summary: { failedOrPendingFiles?: number; entriesMissingPaymentReference?: number; periodsChecked?: string[]; currentCycle?: CurrentCycleImportAudit; autoMatch?: { failed: number } } | null;
};
/** Dedicated credentials prevent management alerts from using another channel's sender. */
export function managementAlertTransportConfig(env: Record<string, string | undefined>) {
  const token = env.RENT_MANAGEMENT_ALERT_META_ACCESS_TOKEN?.trim();
  const phoneId = env.RENT_MANAGEMENT_ALERT_META_PHONE_NUMBER_ID?.trim();
  return token && phoneId ? { token, phoneId } : null;
}

export function managementAlertConfig(env: Record<string, string | undefined>): ManagementAlertConfig | null {
  if (env.RENT_MANAGEMENT_ALERTS_ENABLED !== 'true' || env.RENT_MANAGEMENT_ALERT_OPT_IN !== 'true') return null;
  const recipient = env.RENT_MANAGEMENT_ALERT_RECIPIENT?.trim() ?? '';
  const organizationId = env.RENT_MANAGEMENT_ALERT_ORGANIZATION_ID?.trim() ?? '';
  const propertyId = env.RENT_MANAGEMENT_ALERT_PROPERTY_ID?.trim() ?? '';
  const template = env.RENT_MANAGEMENT_ALERT_TEMPLATE?.trim() ?? '';
  if (!/^[1-9]\d{7,14}$/.test(recipient) || !organizationId || !propertyId || !/^[a-z0-9_]+$/.test(template)) return null;
  try {
    const url = new URL(env.APP_URL ?? '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { recipient, organizationId, propertyId, template, dashboardOrigin: url.origin,
      language: env.RENT_MANAGEMENT_ALERT_LANGUAGE?.trim() || 'en_US' };
  } catch { return null; }
}

export type AlertDependencies = {
  readDashboard(): Promise<MonthlyPaymentsDashboardSnapshot>;
  claim(key: string, runId: string, config: ManagementAlertConfig, contentHash: string, scheduled: boolean): Promise<boolean | 'unchanged' | 'delivery_needs_review' | 'provider_cooldown'>;
  send(config: ManagementAlertConfig, parameters: string[]): Promise<string>;
  record(key: string, status: 'sent' | 'unknown', providerId?: string): Promise<void>;
};

/** At-most-once attempts: an ambiguous provider timeout is retained for operator review, never blindly retried. */
export async function deliverManagementAlert(run: AlertImportRun, config: ManagementAlertConfig | null, deps: AlertDependencies, now = new Date(), oneOffPeriod?: string) {
  if (!config) return { state: 'disabled', sent: 0 };
  if (!oneOffPeriod && !managementBriefingDue(now)) return { state: 'not_scheduled_today', sent: 0 };
  const age = now.getTime() - Date.parse(run.completed_at ?? '');
  const audit = run.reconciliation_summary;
  const current = audit?.currentCycle;
  const sourceAge = now.getTime() - Date.parse(current?.checkedAt ?? '');
  if (run.organization_id !== config.organizationId || !['scheduled', 'manual'].includes(run.trigger) || run.status !== 'completed' || audit?.autoMatch?.failed !== 0 ||
      !Number.isFinite(age) || age < 0 || age > 2 * 60 * 60 * 1000 ||
      !Number.isFinite(sourceAge) || sourceAge < 0 || sourceAge > 2 * 60 * 60 * 1000 ||
      !current || !current.sources.includes('gmail') || !current.sources.includes('drive') ||
      current.failedOrPendingFiles !== 0 || current.entriesMissingPaymentReference !== 0) return { state: 'import_not_ready', sent: 0 };
  const dashboard = await deps.readDashboard();
  const month = dashboard.recentMonths.find(item => item.isCurrent);
  if (dashboard.setupState !== 'ready' || !month || !audit?.periodsChecked?.includes(month.key) || current.period !== month.key || (oneOffPeriod && oneOffPeriod !== month.key)) return { state: 'period_not_refreshed', sent: 0 };
  const property = month.locations.find(item => item.id === config.propertyId);
  if (!property || !property.rooms.length || property.balances.chargeMissingCount || property.balances.unknownDueDateCount) return { state: 'balances_incomplete', sent: 0 };
  if (dashboard.asOf !== southAfricaDate(now) || (!oneOffPeriod && southAfricaDate(new Date(run.completed_at!)) !== southAfricaDate(now))) return { state: 'import_not_ready', sent: 0 };
  const total = sumRentBalances(property.rooms);
  const url = new URL('/monthly-payments/follow-up', config.dashboardOrigin);
  url.search = new URLSearchParams({ building: property.id, period: month.key, filter: 'outstanding' }).toString();
  const title = `${property.name} ${month.key}; as of ${dashboard.asOf} SAST`;
  const totals = `Expected ${rentCurrency(total.expectedAmount)}, confirmed ${rentCurrency(total.confirmedAmount)}, still to receive ${rentCurrency(total.unreceivedAmount)}, overdue ${rentCurrency(total.overdueUnreceivedAmount)}. Pending ${rentCurrency(total.pendingAmount)}: verify before follow-up. Unmatched ${property.unmatchedReferenceCount}: ${rentCurrency(property.unmatchedCollectedAmount)}.`;
  const owing = property.rooms.filter(room => rentToReceive(room) > 0);
  const overdue = owing.filter(room => overdueRentToReceive(room) > 0)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.label.localeCompare(b.label, undefined, { numeric: true }));
  const dueDates = [...new Set(owing.map(room => room.dueDate).filter(Boolean))].sort();
  const pendingRooms = property.rooms.filter(room => room.pendingAmount > 0).length;
  const lead = `${owing.length} rooms still to pay${dueDates.length ? `; due ${dueDates[0]}${dueDates.length > 1 ? ` to ${dueDates.at(-1)}` : ''}` : ''}. ${pendingRooms} rooms await sign-off. ${overdue.length} overdue.`;
  const lines = overdue.slice(0, 5).map(room => `${room.label}: ${rentCurrency(overdueRentToReceive(room))} overdue; due ${room.dueDate}`);
  const roomBudget = 900 - title.length - totals.length - url.toString().length;
  while (lines.length && (lead + ' ' + lines.join(' | ') + ` + ${overdue.length} more; review link.`).length > roomBudget) lines.pop();
  const omitted = overdue.length - lines.length;
  const roomChunk = [lead, ...lines, ...(omitted ? [`${omitted} more overdue rooms in review link.`] : [])].join(' | ');
  if (roomChunk.length > roomBudget) return { state: 'template_too_long', sent: 0 };
  const parameters = [title, totals, roomChunk, url.toString()].map(text => text.replace(/\s+/g, ' ').trim());
  // One briefing per building/recipient/South African date, even across repeated runs.
  const key = createHash('sha256').update(JSON.stringify([config.organizationId, config.propertyId, config.recipient, month.key, southAfricaDate(now)])).digest('hex');
  const contentHash = createHash('sha256').update(JSON.stringify([config.organizationId, config.propertyId, config.recipient, month.key, totals, roomChunk])).digest('hex');
  const claim = await deps.claim(key, run.id, config, contentHash, !oneOffPeriod);
  if (claim !== true) return { state: claim || 'already_claimed', sent: 0 };
  try {
    const providerId = await deps.send(config, parameters);
    await deps.record(key, 'sent', providerId);
    return { state: 'sent', sent: 1 };
  } catch {
    await deps.record(key, 'unknown');
    return { state: 'delivery_needs_review', sent: 0 };
  }
}
