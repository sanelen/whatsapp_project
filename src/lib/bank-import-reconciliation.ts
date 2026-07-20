import { getSupabaseAdmin } from '@/lib/supabase';
import { listActiveBankImportMailboxes, runBankImport, type BankImportRunSummary } from '@/lib/bank-import';
import { ensurePaymentPeriodsForPeriod } from '@/lib/monthly-payments-ops';

export const RECONCILIATION_CADENCE_HOURS = 72;

export type ReconciliationCoverage = {
  sourceMailbox: string | null;
  destinationMailbox: string | null;
  sourceFiles: number;
  destinationFiles: number;
  presentInBoth: number;
  missingFromDestination: number;
  destinationOnly: number;
  comparisonReady: boolean;
};

export type ReconciliationRunView = {
  id: string;
  status: 'running' | 'completed' | 'partial' | 'failed' | 'skipped';
  trigger: 'scheduled' | 'manual';
  startedAt: string;
  completedAt: string | null;
  errorMessage: string;
  mailboxResults: Array<{ mailboxEmail: string; ok: boolean; error?: string; summaries?: BankImportRunSummary[] }>;
  summary: ReconciliationCoverage & {
    failedOrPendingFiles: number;
    entriesMissingPaymentReference: number;
    periodsChecked: string[];
  };
};

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function reconciliationPeriods(now = new Date()) {
  return [0, -1, -2].map((offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return monthKey(date);
  });
}

export function isReconciliationDue(lastStartedAt: string | null, now = new Date(), cadenceHours = RECONCILIATION_CADENCE_HOURS) {
  if (!lastStartedAt) return true;
  const last = new Date(lastStartedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= cadenceHours * 60 * 60 * 1000;
}

export function summarizeMailboxCoverage(input: {
  sourceMailbox: string | null;
  destinationMailbox: string | null;
  occurrences: Array<{ mailboxEmail: string; fileSha256: string }>;
}): ReconciliationCoverage {
  const sourceEmail = input.sourceMailbox?.toLowerCase() ?? null;
  const destinationEmail = input.destinationMailbox?.toLowerCase() ?? null;
  const source = new Set(input.occurrences.filter((row) => row.mailboxEmail.toLowerCase() === sourceEmail).map((row) => row.fileSha256));
  const destination = new Set(input.occurrences.filter((row) => row.mailboxEmail.toLowerCase() === destinationEmail).map((row) => row.fileSha256));
  const presentInBoth = [...source].filter((hash) => destination.has(hash)).length;
  return {
    sourceMailbox: input.sourceMailbox,
    destinationMailbox: input.destinationMailbox,
    sourceFiles: source.size,
    destinationFiles: destination.size,
    presentInBoth,
    missingFromDestination: [...source].filter((hash) => !destination.has(hash)).length,
    destinationOnly: [...destination].filter((hash) => !source.has(hash)).length,
    comparisonReady: Boolean(sourceEmail && destinationEmail && source.size > 0),
  };
}

function publicRun(row: Record<string, unknown>): ReconciliationRunView {
  return {
    id: String(row.id),
    status: row.status as ReconciliationRunView['status'],
    trigger: row.trigger as ReconciliationRunView['trigger'],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    errorMessage: String(row.error_message ?? ''),
    mailboxResults: (row.mailbox_results ?? []) as ReconciliationRunView['mailboxResults'],
    summary: (row.reconciliation_summary ?? {}) as ReconciliationRunView['summary'],
  };
}

export async function readLatestReconciliationRun(): Promise<ReconciliationRunView | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('bank_import_reconciliation_runs')
    .select('id,status,trigger,started_at,completed_at,error_message,mailbox_results,reconciliation_summary')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(`Failed to load latest bank reconciliation: ${error.message}`);
  }
  return data ? publicRun(data) : null;
}

export async function runBankImportReconciliation(input?: { force?: boolean; trigger?: 'scheduled' | 'manual' }) {
  const admin = getSupabaseAdmin();
  const trigger = input?.trigger ?? 'scheduled';
  const mailboxes = await listActiveBankImportMailboxes();
  const organizationId = mailboxes.find((mailbox) => mailbox.organization_id)?.organization_id;
  if (!organizationId) throw new Error('No organization-scoped bank import mailbox is configured.');

  const latest = await readLatestReconciliationRun();
  if (!input?.force && !isReconciliationDue(latest?.startedAt ?? null)) {
    return { skipped: true, reason: 'cadence_not_due', latest } as const;
  }

  const { data: run, error: createError } = await admin
    .from('bank_import_reconciliation_runs')
    .insert({ organization_id: organizationId, trigger, status: 'running', cadence_hours: RECONCILIATION_CADENCE_HOURS })
    .select('id,status,trigger,started_at,completed_at,error_message,mailbox_results,reconciliation_summary')
    .single();
  if (createError) {
    if (/one_running|duplicate key/i.test(createError.message)) return { skipped: true, reason: 'already_running', latest } as const;
    throw new Error(`Failed to start bank reconciliation: ${createError.message}`);
  }

  const periodsChecked = reconciliationPeriods();
  const ensurePeriodsPromise = Promise.all(
    periodsChecked.map((periodKey) => ensurePaymentPeriodsForPeriod({ periodKey }))
  );
  let mailboxResults: ReconciliationRunView['mailboxResults'] = [];
  try {
    mailboxResults = await Promise.all(mailboxes.map(async (mailbox) => {
      try {
        const summaries: BankImportRunSummary[] = [];
        for (const period of periodsChecked) {
          summaries.push(...(await runBankImport({ mailboxId: mailbox.id, billingPeriod: period, source: 'gmail', maxMessages: 250 })));
        }
        return { mailboxEmail: mailbox.email_address, ok: true, summaries };
      } catch (error) {
        return { mailboxEmail: mailbox.email_address, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    await ensurePeriodsPromise;

    const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 120);
    const [occurrencesResult, problemFilesResult, entriesResult] = await Promise.all([
      admin.from('bank_import_file_occurrences').select('mailbox_id,file_sha256').in('mailbox_id', mailboxIds).gte('last_seen_at', since.toISOString()),
      admin.from('bank_import_files').select('id', { count: 'exact', head: true }).in('parser_status', ['pending', 'failed']),
      admin.from('bank_import_entries').select('id').eq('organization_id', organizationId),
    ]);
    if (occurrencesResult.error) throw new Error(`Failed to compare mailbox files: ${occurrencesResult.error.message}`);
    if (problemFilesResult.error) throw new Error(`Failed to count problem import files: ${problemFilesResult.error.message}`);
    if (entriesResult.error) throw new Error(`Failed to load imported entries: ${entriesResult.error.message}`);
    const entryIds = (entriesResult.data ?? []).map((entry) => entry.id as string);
    const referencesResult = entryIds.length
      ? await admin.from('payment_references').select('bank_import_entry_id').in('bank_import_entry_id', entryIds)
      : { data: [], error: null };
    if (referencesResult.error) throw new Error(`Failed to count missing payment references: ${referencesResult.error.message}`);
    const referencedEntryIds = new Set((referencesResult.data ?? []).map((reference) => reference.bank_import_entry_id as string));

    const mailboxEmailById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.email_address]));
    const sourceMailbox = process.env.BANK_IMPORT_SOURCE_MAILBOX_EMAIL?.trim() || null;
    const destinationMailbox = process.env.BANK_IMPORT_DESTINATION_MAILBOX_EMAIL?.trim() || 'info.hambatrading@gmail.com';
    const coverage = summarizeMailboxCoverage({
      sourceMailbox,
      destinationMailbox,
      occurrences: (occurrencesResult.data ?? []).map((row) => ({
        mailboxEmail: mailboxEmailById.get(row.mailbox_id as string) ?? '',
        fileSha256: row.file_sha256 as string,
      })),
    });
    const summary: ReconciliationRunView['summary'] = {
      ...coverage,
      failedOrPendingFiles: problemFilesResult.count ?? 0,
      entriesMissingPaymentReference: entryIds.filter((id) => !referencedEntryIds.has(id)).length,
      periodsChecked,
    };
    const failures = mailboxResults.filter((result) => !result.ok);
    const status = failures.length === 0 ? 'completed' : failures.length === mailboxResults.length ? 'failed' : 'partial';
    const errorMessage = failures.map((failure) => `${failure.mailboxEmail}: ${failure.error}`).join(' | ');
    const { data: completed, error: updateError } = await admin
      .from('bank_import_reconciliation_runs')
      .update({ status, completed_at: new Date().toISOString(), mailbox_results: mailboxResults, reconciliation_summary: summary, error_message: errorMessage })
      .eq('id', run.id)
      .select('id,status,trigger,started_at,completed_at,error_message,mailbox_results,reconciliation_summary')
      .single();
    if (updateError) throw new Error(`Failed to finish bank reconciliation: ${updateError.message}`);
    return { skipped: false, run: publicRun(completed) } as const;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await admin.from('bank_import_reconciliation_runs').update({ status: 'failed', completed_at: new Date().toISOString(), mailbox_results: mailboxResults, error_message: errorMessage }).eq('id', run.id);
    throw error;
  }
}
