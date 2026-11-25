import { getSupabaseAdmin } from './supabase';
import { readMonthlyPaymentsDashboard } from './monthly-payments';
import { getChannelRuntimeConfig } from './channels/runtime-config';
import { deliverManagementAlert, managementAlertConfig, managementAlertTransportConfig, type AlertImportRun } from './rent-management-alerts';

export async function sendPostImportManagementAlert(runId: string) {
  const config = managementAlertConfig(process.env);
  if (!config) return { state: 'disabled', sent: 0 };
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
    async claim(key, id, settings, contentHash) {
      const { data: previous, error: previousError } = await admin.from('rent_management_alert_deliveries')
        .select('id,status,content_hash').eq('organization_id', settings.organizationId).eq('property_id', settings.propertyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error('Cannot verify previous briefing; delivery remains blocked.');
      if (previous?.status === 'claimed' || previous?.status === 'unknown') return 'delivery_needs_review';
      if (previous?.id === key) return false;
      if (previous?.content_hash === contentHash) return 'unchanged';
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
  });
}
