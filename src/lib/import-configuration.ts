import { BANK_IMPORT_POLICIES, OBSERVED_BANK_ACCOUNTS } from '@/config/bank-import-metadata';
import { getSupabaseAdmin } from './supabase';

export type ImportConfigurationView = {
  mailboxes: Array<{
    id: string;
    emailAddress: string;
    provider: string;
    subjectFilter: string;
    labelFilter: string;
    active: boolean;
    lastSyncedAt: string | null;
  }>;
  accounts: Array<{
    suffix: string;
    propertyName: string;
    mappedPropertyName: string | null;
    notes: string;
    active: boolean;
    source: 'database' | 'observed';
    role: string;
    evidence: string | null;
    state: 'active' | 'excluded' | 'mixed';
  }>;
  rules: Array<{
    id: string;
    matcherType: string;
    matcherValue: string;
    amountValue: number | null;
    accountSuffix: string | null;
    propertyName: string | null;
    unitLabel: string | null;
    priority: number;
    active: boolean;
  }>;
  policies: typeof BANK_IMPORT_POLICIES;
};

export async function readImportConfiguration(): Promise<ImportConfigurationView> {
  const admin = getSupabaseAdmin();
  const [mailboxesResult, mappingsResult, hintsResult] = await Promise.all([
    admin.from('bank_import_mailboxes').select('id,email_address,provider,subject_filter,label_filter,is_active,last_synced_at').order('email_address'),
    admin.from('bank_import_property_mappings').select('id,property_id,account_number_suffix,property_name,notes,is_active').order('account_number_suffix'),
    admin.from('bank_import_unit_match_hints').select('id,property_id,unit_id,account_number_suffix,matcher_type,matcher_value,amount_value,priority,is_active').order('priority', { ascending: false }),
  ]);
  if (mailboxesResult.error) throw new Error(`Failed to load import mailboxes: ${mailboxesResult.error.message}`);
  if (mappingsResult.error) throw new Error(`Failed to load account mappings: ${mappingsResult.error.message}`);
  if (hintsResult.error) throw new Error(`Failed to load import match rules: ${hintsResult.error.message}`);

  const mappings = mappingsResult.data ?? [];
  const hints = hintsResult.data ?? [];
  const propertyIds = Array.from(new Set([...mappings, ...hints].map((row) => row.property_id as string | null).filter(Boolean))) as string[];
  const unitIds = Array.from(new Set(hints.map((row) => row.unit_id as string | null).filter(Boolean))) as string[];
  const [propertiesResult, unitsResult] = await Promise.all([
    propertyIds.length ? admin.from('properties').select('id,name').in('id', propertyIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? admin.from('property_units').select('id,label').in('id', unitIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (propertiesResult.error) throw new Error(`Failed to load mapped properties: ${propertiesResult.error.message}`);
  if (unitsResult.error) throw new Error(`Failed to load mapped units: ${unitsResult.error.message}`);

  const propertyNames = new Map((propertiesResult.data ?? []).map((row) => [row.id as string, row.name as string]));
  const unitLabels = new Map((unitsResult.data ?? []).map((row) => [row.id as string, row.label as string]));
  const configuredSuffixes = new Set(mappings.map((row) => row.account_number_suffix as string));

  return {
    mailboxes: (mailboxesResult.data ?? []).map((row) => ({
      id: row.id as string,
      emailAddress: row.email_address as string,
      provider: row.provider as string,
      subjectFilter: (row.subject_filter as string) || 'Any subject',
      labelFilter: (row.label_filter as string) || 'All mail',
      active: Boolean(row.is_active),
      lastSyncedAt: (row.last_synced_at as string) || null,
    })),
    accounts: [
      ...mappings.map((row) => ({
        suffix: row.account_number_suffix as string,
        propertyName: row.property_name as string,
        mappedPropertyName: row.property_id ? propertyNames.get(row.property_id as string) ?? null : null,
        notes: (row.notes as string) || '',
        active: Boolean(row.is_active),
        source: 'database' as const,
        role: 'Incoming payment destination',
        evidence: null,
        state: 'active' as const,
      })),
      ...OBSERVED_BANK_ACCOUNTS.filter((account) => !configuredSuffixes.has(account.suffix)).map((account) => ({
        suffix: account.suffix,
        propertyName: account.role,
        mappedPropertyName: null,
        notes: account.explanation,
        active: false,
        source: 'observed' as const,
        role: account.role,
        evidence: account.evidence,
        state: account.status,
      })),
    ],
    rules: hints.map((row) => ({
      id: row.id as string,
      matcherType: row.matcher_type as string,
      matcherValue: (row.matcher_value as string) || '',
      amountValue: row.amount_value == null ? null : Number(row.amount_value),
      accountSuffix: (row.account_number_suffix as string) || null,
      propertyName: row.property_id ? propertyNames.get(row.property_id as string) ?? null : null,
      unitLabel: row.unit_id ? unitLabels.get(row.unit_id as string) ?? null : null,
      priority: Number(row.priority ?? 0),
      active: Boolean(row.is_active),
    })),
    policies: BANK_IMPORT_POLICIES,
  };
}
