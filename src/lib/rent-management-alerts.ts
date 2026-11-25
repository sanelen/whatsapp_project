import { createHash } from 'node:crypto';
import type { MonthlyPaymentsDashboardSnapshot } from './monthly-payments';
import { rentCurrency, sumRentBalances } from './rent-collections';

export type ManagementAlertConfig = {
  recipient: string; organizationId: string; propertyId: string;
  dashboardOrigin: string; template: string; language: string;
};
export type AlertImportRun = {
  id: string; organization_id: string; status: string; trigger: string; completed_at: string | null;
  reconciliation_summary: { failedOrPendingFiles?: number; entriesMissingPaymentReference?: number; periodsChecked?: string[] } | null;
};
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
  claim(key: string, runId: string, config: ManagementAlertConfig): Promise<boolean>;
  send(config: ManagementAlertConfig, parameters: string[]): Promise<string>;
  record(key: string, status: 'sent' | 'unknown', providerId?: string): Promise<void>;
};

/** At-most-once attempts: an ambiguous provider timeout is retained for operator review, never blindly retried. */
export async function deliverManagementAlert(run: AlertImportRun, config: ManagementAlertConfig | null, deps: AlertDependencies, now = new Date()) {
  if (!config) return { state: 'disabled', sent: 0 };
  const age = now.getTime() - Date.parse(run.completed_at ?? '');
  const audit = run.reconciliation_summary;
  if (run.organization_id !== config.organizationId || run.trigger !== 'scheduled' || run.status !== 'completed' ||
      !Number.isFinite(age) || age < 0 || age > 2 * 60 * 60 * 1000 ||
      audit?.failedOrPendingFiles !== 0 || audit?.entriesMissingPaymentReference !== 0) return { state: 'import_not_ready', sent: 0 };
  const dashboard = await deps.readDashboard();
  const month = dashboard.recentMonths.find(item => item.isCurrent);
  if (dashboard.setupState !== 'ready' || !month || !audit.periodsChecked?.includes(month.key)) return { state: 'period_not_refreshed', sent: 0 };
  const property = month.locations.find(item => item.id === config.propertyId);
  if (!property || !property.rooms.length || property.balances.chargeMissingCount || property.balances.unknownDueDateCount) return { state: 'balances_incomplete', sent: 0 };
  const total = sumRentBalances(property.rooms);
  const url = new URL('/monthly-payments/follow-up', config.dashboardOrigin);
  url.search = new URLSearchParams({ building: property.id, period: month.key, filter: 'outstanding' }).toString();
  const title = `${property.name} ${month.key}; as of ${dashboard.asOf} SAST`;
  const totals = `Expected ${rentCurrency(total.expectedAmount)}, confirmed ${rentCurrency(total.confirmedAmount)}, outstanding ${rentCurrency(total.outstandingAmount)}, overdue ${rentCurrency(total.overdueAmount)}. Pending ${rentCurrency(total.pendingAmount)}: verify before follow-up. Unmatched ${property.unmatchedReferenceCount}: ${rentCurrency(property.unmatchedCollectedAmount)}.`;
  const lines = property.rooms.filter(room => room.outstandingAmount > 0).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map(room =>
    `${room.label}: ${rentCurrency(room.outstandingAmount)} due ${room.dueDate}${room.overdueAmount ? ' overdue' : ''}${room.pendingAmount ? ` (${rentCurrency(room.pendingAmount)} pending)` : ''}`);
  const roomChunks: string[] = [];
  let chunk = '';
  // Bound the complete substituted body, including labels/static text in the documented template.
  const roomBudget = 900 - title.length - totals.length - url.toString().length;
  if (roomBudget < 80) return { state: 'template_too_long', sent: 0 };
  for (const line of lines.length ? lines : ['No outstanding saved charges.']) {
    if (line.length > roomBudget) return { state: 'template_too_long', sent: 0 };
    if (chunk && chunk.length + line.length + 3 > roomBudget) { roomChunks.push(chunk); chunk = ''; }
    chunk += `${chunk ? ' | ' : ''}${line}`;
  }
  if (chunk) roomChunks.push(chunk);
  let sent = 0;
  for (const [index, roomChunk] of roomChunks.entries()) {
    const parameters = [`${title} (${index + 1}/${roomChunks.length})`, totals, roomChunk, url.toString()].map(text => text.replace(/\s+/g, ' ').trim());
    // Run + content uniqueness: workflow replays cannot resend a claimed part.
    const key = createHash('sha256').update(JSON.stringify([run.id, config.organizationId, config.propertyId, config.recipient, index])).digest('hex');
    if (!await deps.claim(key, run.id, config)) continue;
    try {
      const providerId = await deps.send(config, parameters);
      await deps.record(key, 'sent', providerId);
      sent += 1;
    } catch {
      await deps.record(key, 'unknown');
      return { state: 'delivery_needs_review', sent };
    }
  }
  return { state: sent ? 'sent' : 'already_claimed', sent };
}
