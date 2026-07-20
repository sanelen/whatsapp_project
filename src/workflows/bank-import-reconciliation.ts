import type { BankImportRunSummary } from '@/lib/bank-import';
import type { ReconciliationRunView } from '@/lib/bank-import-reconciliation';

type Trigger = 'scheduled' | 'manual';

type MailboxSpec = {
  id: string;
  emailAddress: string;
};

type Preparation =
  | { skipped: true; reason: 'cadence_not_due' | 'already_running'; latest: ReconciliationRunView | null }
  | {
      skipped: false;
      runId: string;
      organizationId: string;
      trigger: Trigger;
      mailboxes: MailboxSpec[];
      periodsChecked: string[];
    };

type SliceResult = {
  mailboxEmail: string;
  period: string;
  ok: boolean;
  summaries?: BankImportRunSummary[];
  error?: string;
};

type ListingResult = {
  mailbox: MailboxSpec;
  period: string;
  ok: boolean;
  messageIds?: string[];
  error?: string;
};

type MessageChunk = {
  mailbox: MailboxSpec;
  period: string;
  messageIds: string[];
};

export async function bankImportReconciliationWorkflow(force: boolean, trigger: Trigger) {
  "use workflow";

  const preparation = await prepareReconciliation(force, trigger);
  if (preparation.skipped) return preparation;

  const listings = await Promise.all(
    preparation.mailboxes.flatMap((mailbox) =>
      preparation.periodsChecked.map((period) => listMailboxPeriodMessages(mailbox, period))
    )
  );
  const listingFailures: SliceResult[] = listings
    .filter((listing) => !listing.ok)
    .map((listing) => ({
      mailboxEmail: listing.mailbox.emailAddress,
      period: listing.period,
      ok: false,
      error: listing.error,
    }));
  const messageChunkSize = 30;
  const chunks: MessageChunk[] = listings.filter((listing) => listing.ok).flatMap((listing) => {
    const messageIds = listing.messageIds ?? [];
    if (messageIds.length === 0) return [{ mailbox: listing.mailbox, period: listing.period, messageIds: [] }];
    const result: MessageChunk[] = [];
    for (let offset = 0; offset < messageIds.length; offset += messageChunkSize) {
      result.push({ mailbox: listing.mailbox, period: listing.period, messageIds: messageIds.slice(offset, offset + messageChunkSize) });
    }
    return result;
  });
  const slices = [
    ...listingFailures,
    ...(await Promise.all(chunks.map((chunk) => importMailboxPeriodChunk(chunk)))),
  ];

  const mailboxResults: ReconciliationRunView['mailboxResults'] = preparation.mailboxes.map((mailbox) => {
    const mailboxSlices = slices.filter((slice) => slice.mailboxEmail === mailbox.emailAddress);
    const failures = mailboxSlices.filter((slice) => !slice.ok);
    if (failures.length > 0) {
      return {
        mailboxEmail: mailbox.emailAddress,
        ok: false,
        error: failures.map((failure) => `${failure.period}: ${failure.error ?? 'Import failed'}`).join(' | '),
      };
    }
    return {
      mailboxEmail: mailbox.emailAddress,
      ok: true,
      summaries: mailboxSlices.flatMap((slice) => slice.summaries ?? []),
    };
  });

  return finalizeReconciliation(preparation, mailboxResults);
}

async function prepareReconciliation(force: boolean, trigger: Trigger): Promise<Preparation> {
  "use step";
  console.log(`[bank-reconciliation:prepare] START trigger=${trigger} force=${force}`);
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const { listActiveBankImportMailboxes } = await import('@/lib/bank-import');
  const {
    isReconciliationDue,
    readLatestReconciliationRun,
    reconciliationPeriods,
    RECONCILIATION_CADENCE_HOURS,
  } = await import('@/lib/bank-import-reconciliation');

  const admin = getSupabaseAdmin();
  const mailboxes = await listActiveBankImportMailboxes();
  const organizationId = mailboxes.find((mailbox) => mailbox.organization_id)?.organization_id;
  if (!organizationId) throw new Error('No organization-scoped bank import mailbox is configured.');

  const latest = await readLatestReconciliationRun();
  if (!force && !isReconciliationDue(latest?.startedAt ?? null)) {
    console.log('[bank-reconciliation:prepare] SKIP cadence_not_due');
    return { skipped: true, reason: 'cadence_not_due', latest };
  }

  const { data: run, error } = await admin
    .from('bank_import_reconciliation_runs')
    .insert({ organization_id: organizationId, trigger, status: 'running', cadence_hours: RECONCILIATION_CADENCE_HOURS })
    .select('id')
    .single<{ id: string }>();
  if (error) {
    if (/one_running|duplicate key/i.test(error.message)) {
      console.log('[bank-reconciliation:prepare] SKIP already_running');
      return { skipped: true, reason: 'already_running', latest };
    }
    throw new Error(`Failed to start bank reconciliation: ${error.message}`);
  }

  const result: Preparation = {
    skipped: false,
    runId: run.id,
    organizationId,
    trigger,
    mailboxes: mailboxes.map((mailbox) => ({ id: mailbox.id, emailAddress: mailbox.email_address })),
    periodsChecked: reconciliationPeriods(),
  };
  console.log(`[bank-reconciliation:prepare] DONE runId=${run.id}`);
  return result;
}

async function listMailboxPeriodMessages(mailbox: MailboxSpec, period: string): Promise<ListingResult> {
  "use step";
  console.log(`[bank-reconciliation:list] START mailbox=${mailbox.emailAddress} period=${period}`);
  const { listBankImportGmailMessageIds } = await import('@/lib/bank-import');
  try {
    const messageIds = await listBankImportGmailMessageIds({ mailboxId: mailbox.id, billingPeriod: period, maxMessages: 250 });
    console.log(`[bank-reconciliation:list] DONE mailbox=${mailbox.emailAddress} period=${period} messages=${messageIds.length}`);
    return { mailbox, period, ok: true, messageIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bank-reconciliation:list] FAIL mailbox=${mailbox.emailAddress} period=${period} error=${message}`);
    return { mailbox, period, ok: false, error: message };
  }
}

async function importMailboxPeriodChunk(chunk: MessageChunk): Promise<SliceResult> {
  "use step";
  console.log(`[bank-reconciliation:import] START mailbox=${chunk.mailbox.emailAddress} period=${chunk.period} messages=${chunk.messageIds.length}`);
  const { runBankImport } = await import('@/lib/bank-import');
  try {
    const summaries = await runBankImport({
      mailboxId: chunk.mailbox.id,
      billingPeriod: chunk.period,
      source: 'gmail',
      gmailMessageIds: chunk.messageIds,
    });
    console.log(`[bank-reconciliation:import] DONE mailbox=${chunk.mailbox.emailAddress} period=${chunk.period} messages=${chunk.messageIds.length}`);
    return { mailboxEmail: chunk.mailbox.emailAddress, period: chunk.period, ok: true, summaries };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bank-reconciliation:import] FAIL mailbox=${chunk.mailbox.emailAddress} period=${chunk.period} error=${message}`);
    return { mailboxEmail: chunk.mailbox.emailAddress, period: chunk.period, ok: false, error: message };
  }
}

async function finalizeReconciliation(
  preparation: Extract<Preparation, { skipped: false }>,
  mailboxResults: ReconciliationRunView['mailboxResults']
) {
  "use step";
  console.log(`[bank-reconciliation:finalize] START runId=${preparation.runId}`);
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const { summarizeMailboxCoverage } = await import('@/lib/bank-import-reconciliation');
  const admin = getSupabaseAdmin();

  try {
    const mailboxIds = preparation.mailboxes.map((mailbox) => mailbox.id);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 120);
    const [occurrencesResult, problemFilesResult, entriesResult] = await Promise.all([
      admin.from('bank_import_file_occurrences').select('mailbox_id,file_sha256').in('mailbox_id', mailboxIds).gte('last_seen_at', since.toISOString()),
      admin.from('bank_import_files').select('id', { count: 'exact', head: true }).in('parser_status', ['pending', 'failed']),
      admin.from('bank_import_entries').select('id').eq('organization_id', preparation.organizationId),
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

    const mailboxEmailById = new Map(preparation.mailboxes.map((mailbox) => [mailbox.id, mailbox.emailAddress]));
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
      periodsChecked: preparation.periodsChecked,
    };
    const failures = mailboxResults.filter((result) => !result.ok);
    const status = failures.length === 0 ? 'completed' : failures.length === mailboxResults.length ? 'failed' : 'partial';
    const errorMessage = failures.map((failure) => `${failure.mailboxEmail}: ${failure.error}`).join(' | ');
    const { data: completed, error: updateError } = await admin
      .from('bank_import_reconciliation_runs')
      .update({ status, completed_at: new Date().toISOString(), mailbox_results: mailboxResults, reconciliation_summary: summary, error_message: errorMessage })
      .eq('id', preparation.runId)
      .select('id,status,trigger,started_at,completed_at,error_message,mailbox_results,reconciliation_summary')
      .single();
    if (updateError) throw new Error(`Failed to finish bank reconciliation: ${updateError.message}`);
    console.log(`[bank-reconciliation:finalize] DONE runId=${preparation.runId} status=${status}`);
    return completed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await admin
      .from('bank_import_reconciliation_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), mailbox_results: mailboxResults, error_message: errorMessage })
      .eq('id', preparation.runId);
    console.error(`[bank-reconciliation:finalize] FAIL runId=${preparation.runId} error=${errorMessage}`);
    throw error;
  }
}
