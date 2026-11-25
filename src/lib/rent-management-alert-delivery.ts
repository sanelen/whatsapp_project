import { getSupabaseAdmin } from './supabase';
import { readMonthlyPaymentsDashboard } from './monthly-payments';
import { getChannelRuntimeConfig } from './channels/runtime-config';
import { deliverManagementAlert, managementAlertConfig, managementAlertTransportConfig, type AlertImportRun } from './rent-management-alerts';
import { oneOffManagementConfig, type ManagementBriefingRequest } from './management-briefing-request';
import { dispatchScheduledBriefings, managementBriefingDue, scheduledManagementConfigs, nextManagementBriefingDate, managementBriefingDays } from './management-briefing-schedule';
import { managementBriefingOutcome, managementBriefingClaimDecision, type BriefingAttempt } from './management-briefing-status';
import type { ManagementAlertConfig } from './rent-management-alerts';
import { southAfricaDate } from './rent-collections';

export async function sendPostImportManagementAlert(runId: string) {
  const now = new Date();
  if (!managementBriefingDue(now)) return { state: 'not_scheduled_today', sent: 0, properties: [] };
  const config = managementAlertConfig(process.env);
  if (!config) return { state: 'disabled', sent: 0, properties: [] };
  return dispatchScheduledBriefings(scheduledManagementConfigs(config, process.env), settings => sendManagementAlert(runId, undefined, settings, now), now);
}

export async function sendOneOffManagementAlert(input: ManagementBriefingRequest) {
  // The latest run must pass, even if an older clean run is still fresh.
  const { data: latest, error } = await getSupabaseAdmin().from('bank_import_reconciliation_runs')
    .select('id').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !latest) return { state: 'import_not_ready', sent: 0 };
  return sendManagementAlert(latest.id, input);
}

async function readProviderOutcome(attempt: BriefingAttempt | null, config: ManagementAlertConfig, phoneId: string) {
  if (!attempt?.provider_message_id) return managementBriefingOutcome(attempt, [], config.recipient, phoneId);
  const { data, error } = await getSupabaseAdmin().from('channel_events').select('occurred_at,payload')
    .eq('provider', 'meta').eq('event_type', 'message.status').eq('provider_message_id', attempt.provider_message_id);
  if (error) throw new Error('Cannot verify provider delivery status.');
  return managementBriefingOutcome(attempt, data ?? [], config.recipient, phoneId);
}

export async function readManagementBriefingStatus(propertyId?: string) {
  const config = managementAlertConfig(process.env);
  const transport = managementAlertTransportConfig(process.env);
  const now = new Date();
  if (!config || !transport) return { configured: false, properties: [] };
  const configs = scheduledManagementConfigs(config, process.env);
  const ids = propertyId ? [propertyId] : configs.map(item => item.propertyId);
  const admin = getSupabaseAdmin();
  const properties = [];
  for (const id of ids) {
    const { data: property, error: propertyError } = await admin.from('properties').select('id,name').eq('id', id).eq('organization_id', config.organizationId).maybeSingle();
    if (propertyError || !property) continue;
    const { data: attempt, error } = await admin.from('rent_management_alert_deliveries').select('id,status,provider_message_id,content_hash,created_at')
      .eq('organization_id', config.organizationId).eq('property_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('Cannot read management briefing status.');
    const attemptedToday = Boolean(attempt && southAfricaDate(new Date(attempt.created_at)) === southAfricaDate(now));
    properties.push({ propertyId: id, name: property.name, scheduled: configs.some(item => item.propertyId === id), attemptedToday,
      nextScheduledDate: nextManagementBriefingDate(now, !attemptedToday),
      attemptAt: attempt?.created_at ?? null, ...await readProviderOutcome(attempt, config, transport.phoneId) });
  }
  return { configured: true, recipientSuffix: config.recipient.slice(-4), days: managementBriefingDays, timezone: 'Africa/Johannesburg',
    importCron: '0 5 * * *', importStartWindow: '07:00–08:00 SAST', afterCleanImportAndMatching: true,
    nextScheduledDate: nextManagementBriefingDate(now), scheduledPropertyIds: configs.map(item => item.propertyId), properties };
}

async function sendManagementAlert(runId: string, oneOff?: ManagementBriefingRequest, scheduledConfig?: ManagementAlertConfig, now = new Date()) {
  const configured = managementAlertConfig(process.env);
  if (!configured) return { state: 'disabled', sent: 0 };
  const config = oneOff ? oneOffManagementConfig(configured, oneOff) : scheduledConfig ?? configured;
  const runtime = getChannelRuntimeConfig();
  // Management opt-in, enable flag and dedicated credentials govern this sender.
  // Shared chat outbound flags do not grant or block this separately authorized route.
  const transport = managementAlertTransportConfig(process.env);
  if (!transport) return { state: 'transport_unconfigured', sent: 0 };
  const { token, phoneId } = transport;
  const admin = getSupabaseAdmin();
  const { data: run, error } = await admin.from('bank_import_reconciliation_runs')
    .select('id,organization_id,status,trigger,completed_at,reconciliation_summary').eq('id', runId).single();
  if (error) throw new Error('Cannot verify completed import for management alert.');
  // Explicit property ownership check before any financial data can be sent.
  const { data: property, error: propertyError } = await admin.from('properties').select('id').eq('id', config.propertyId).eq('organization_id', config.organizationId).maybeSingle();
  if (propertyError || !property) return { state: 'property_not_authorized', sent: 0 };
  return deliverManagementAlert(run as AlertImportRun, config, {
    readDashboard: () => readMonthlyPaymentsDashboard({ readOnly: true }),
    async claim(key, id, settings, contentHash, scheduled) {
      const { data: previous, error: previousError } = await admin.from('rent_management_alert_deliveries')
        .select('id,status,content_hash,provider_message_id,created_at').eq('organization_id', settings.organizationId).eq('property_id', settings.propertyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error('Cannot verify previous briefing; delivery remains blocked.');
      const outcome = await readProviderOutcome(previous, settings, phoneId);
      const decision = managementBriefingClaimDecision(previous, key, contentHash, scheduled, outcome, now);
      if (decision === 'already_claimed') return false;
      if (decision !== 'claim') return decision;
      const { error } = await admin.from('rent_management_alert_deliveries').insert({
        id: key, import_run_id: id, organization_id: settings.organizationId, property_id: settings.propertyId, status: 'claimed', content_hash: contentHash,
      });
      if (error?.code === '23505') return false;
      if (error) throw new Error('Cannot claim management alert. Delivery remains blocked.');
      return true;
    },
    async send(settings, parameters) {
      const response = await fetch(`https://graph.facebook.com/${runtime.metaGraphVersion}/${phoneId}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ messaging_product: 'whatsapp', to: settings.recipient, type: 'template', template: {
          name: settings.template, language: { code: settings.language },
          components: [{ type: 'body', parameters: parameters.map(text => ({ type: 'text', text })) }],
        } }),
      });
      if (!response.ok) throw new Error(`Management alert HTTP ${response.status}`);
      const body = await response.json() as { messages?: Array<{ id?: string }> };
      const id = body.messages?.[0]?.id;
      if (!id) throw new Error('Management alert has no provider receipt.');
      return id;
    },
    async record(key, status, providerId) {
      const { error } = await admin.from('rent_management_alert_deliveries').update({ status, provider_message_id: providerId ?? null, updated_at: new Date().toISOString() }).eq('id', key);
      if (error) throw new Error('Management delivery needs operator verification.');
    },
  }, now, oneOff?.period);
}
