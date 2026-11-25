import { getSupabaseAdmin } from './supabase';
import { readMonthlyPaymentsDashboard } from './monthly-payments';
import { getChannelRuntimeConfig } from './channels/runtime-config';
import { deliverManagementAlert, managementAlertConfig, type AlertImportRun } from './rent-management-alerts';

export async function sendPostImportManagementAlert(runId: string) {
  const config = managementAlertConfig(process.env);
  if (!config) return { state: 'disabled', sent: 0 };
  const runtime = getChannelRuntimeConfig();
  const meta = runtime.providers.meta;
  if (!meta.enabled || !meta.outboundEnabled) return { state: 'transport_disabled', sent: 0 };
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) return { state: 'transport_unconfigured', sent: 0 };
  const admin = getSupabaseAdmin();
  const { data: run, error } = await admin.from('bank_import_reconciliation_runs')
    .select('id,organization_id,status,trigger,completed_at,reconciliation_summary').eq('id', runId).single();
  if (error) throw new Error('Cannot verify completed import for management alert.');
  // Explicit property ownership check before any financial data can be sent.
  const { data: property, error: propertyError } = await admin.from('properties').select('id').eq('id', config.propertyId).eq('organization_id', config.organizationId).maybeSingle();
  if (propertyError || !property) return { state: 'property_not_authorized', sent: 0 };
  return deliverManagementAlert(run as AlertImportRun, config, {
    readDashboard: () => readMonthlyPaymentsDashboard({ readOnly: true }),
    async claim(key, id, settings) {
      const { error } = await admin.from('rent_management_alert_deliveries').insert({
        id: key, import_run_id: id, organization_id: settings.organizationId, property_id: settings.propertyId, status: 'claimed',
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
