import { getWorkflowMetadata } from 'workflow';
import type { BankImportRequest } from '@/lib/bank-import-request';
import type { DriveFile } from '@/lib/google-drive';
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
      workflowRunId: string;
      sources: string[];
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

export async function bankImportReconciliationWorkflow(force: boolean, trigger: Trigger, options?: BankImportRequest) {
  "use workflow";

  if (trigger === 'scheduled' && !options) options = await scheduledImportOptions();
  const preparation = await prepareReconciliation(force, trigger, getWorkflowMetadata().workflowRunId, options);
  if (preparation.skipped) {
    const previous = preparation.latest;
    // A configuration correction may resume an unattempted briefing without
    // repeating today's import. The delivery step still verifies freshness and
    // claims the daily ledger key before making any provider request.
    if (trigger === 'scheduled' && preparation.reason === 'cadence_not_due' &&
        previous?.trigger === 'scheduled' && previous.status === 'completed' &&
        ['disabled', 'transport_unconfigured'].includes(previous.summary.managementAlert?.state ?? '')) {
      await deliverRentManagementAlert(previous.id);
    }
    return preparation;
  }

  try {
    const listings = options?.source === 'drive' || options?.source === 'bank' ? [] : await Promise.all(
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
    const messageChunkSize = 8;
    const chunks: MessageChunk[] = listings.filter((listing) => listing.ok).flatMap((listing) => {
      const messageIds = listing.messageIds ?? [];
      if (messageIds.length === 0) return [];
      const result: MessageChunk[] = [];
      for (let offset = 0; offset < messageIds.length; offset += messageChunkSize) {
        result.push({ mailbox: listing.mailbox, period: listing.period, messageIds: messageIds.slice(offset, offset + messageChunkSize) });
      }
      return result;
    });
    const slices: SliceResult[] = [...listingFailures];
    // Bound provider/DB concurrency, and persist each completed batch before moving on.
    for (let offset = 0; offset < chunks.length; offset += 2) {
      slices.push(...await Promise.all(chunks.slice(offset, offset + 2).map(importMailboxPeriodChunk)));
      await recordProgress(preparation, slices, 'gmail');
    }
    if (options && options.source !== 'gmail') {
      for (const mailbox of preparation.mailboxes) {
        const source = options.source === 'bank' ? 'bank' : 'drive';
        const listing = await listDriveEvidence(mailbox, source, options.pullAll ? undefined : options.billingPeriod);
        if (!listing.ok) slices.push({ mailboxEmail: mailbox.emailAddress, period: options.billingPeriod ?? '', ok: false, error: listing.error });
        for (let offset = 0; offset < listing.files.length; offset += 5) {
          slices.push(await importDriveChunk(mailbox, options, listing.files.slice(offset, offset + 5)));
          await recordProgress(preparation, slices, source);
        }
      }
    }
    await recordProgress(preparation, slices, 'matching');
    const matching = await matchImportedPayments(preparation.periodsChecked, options?.pullAll === true);
    if (matching.failed) slices.push({ mailboxEmail: preparation.mailboxes[0].emailAddress, period: '', ok: false, error: `${matching.failed} automatic matches failed` });

    const mailboxResults: ReconciliationRunView['mailboxResults'] = preparation.mailboxes.map((mailbox) => {
      const mailboxSlices = slices.filter((slice) => slice.mailboxEmail === mailbox.emailAddress);
      const failures = mailboxSlices.filter((slice) => !slice.ok);
      if (failures.length > 0) {
        return {
          mailboxEmail: mailbox.emailAddress,
          ok: false,
          error: failures.map((failure) => `${failure.period}: ${failure.error ?? 'Import failed'}`).join(' | '),
          summaries: mailboxSlices.flatMap((slice) => slice.summaries ?? []),
        };
      }
      return {
        mailboxEmail: mailbox.emailAddress,
        ok: true,
        summaries: mailboxSlices.flatMap((slice) => slice.summaries ?? []),
      };
    });

    const completed = await finalizeReconciliation(preparation, mailboxResults, matching);
    if (preparation.trigger === 'scheduled' && completed.status === 'completed') {
      await deliverRentManagementAlert(preparation.runId);
    }
    return completed;
  } catch (error) {
    await failReconciliation(preparation.runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function scheduledImportOptions(): Promise<BankImportRequest> {
  "use step";
  const { getBillingPeriodForDate } = await import('@/lib/bank-import');
  const { southAfricaDate } = await import('@/lib/rent-collections');
  return { source: 'both', billingPeriod: getBillingPeriodForDate(southAfricaDate(new Date())), pullAll: false };
}

async function prepareReconciliation(force: boolean, trigger: Trigger, workflowRunId: string, options?: BankImportRequest): Promise<Preparation> {
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
  const mailboxes = (await listActiveBankImportMailboxes()).filter((mailbox) =>
    (!options?.mailboxId || mailbox.id === options.mailboxId) &&
    (!options?.mailboxEmail || mailbox.email_address.toLowerCase() === options.mailboxEmail.toLowerCase()));
  const organizationId = mailboxes.find((mailbox) => mailbox.organization_id)?.organization_id;
  if (!organizationId) throw new Error('No organization-scoped bank import mailbox is configured.');

  const latest = await readLatestReconciliationRun();
  const sources = options?.source === 'both' ? ['gmail', 'drive'] : [options?.source ?? 'gmail'];
  const { scheduledImportDue } = await import('@/lib/bank-import-automation');
  const cadenceDue = trigger === 'scheduled'
    ? scheduledImportDue(await readLatestReconciliationRun('scheduled'))
    : isReconciliationDue(latest?.startedAt ?? null);
  if (latest?.status === 'running' && latest.summary.workflowRunId === workflowRunId) return {
    skipped: false, runId: latest.id, organizationId, trigger, workflowRunId, sources,
    mailboxes: mailboxes.map(mailbox => ({ id: mailbox.id, emailAddress: mailbox.email_address })),
    periodsChecked: options ? [options.pullAll ? '' : options.billingPeriod!] : reconciliationPeriods(),
  };
  if (!force && !cadenceDue) {
    console.log('[bank-reconciliation:prepare] SKIP cadence_not_due');
    return { skipped: true, reason: 'cadence_not_due', latest };
  }

  const { data: run, error } = await admin
    .from('bank_import_reconciliation_runs')
    .insert({ organization_id: organizationId, trigger, status: 'running', cadence_hours: trigger === 'scheduled' ? 24 : RECONCILIATION_CADENCE_HOURS, reconciliation_summary: { workflowRunId, stage: 'listing', options } })
    .select('id')
    .single<{ id: string }>();
  if (error) {
    if (/one_running|duplicate key/i.test(error.message)) {
      const existing = await readLatestReconciliationRun();
      if (existing?.status === 'running' && existing.summary.workflowRunId === workflowRunId) return {
        skipped: false, runId: existing.id, organizationId, trigger, workflowRunId, sources,
        mailboxes: mailboxes.map(mailbox => ({ id: mailbox.id, emailAddress: mailbox.email_address })),
        periodsChecked: options ? [options.pullAll ? '' : options.billingPeriod!] : reconciliationPeriods(),
      };
      console.log('[bank-reconciliation:prepare] SKIP already_running');
      return { skipped: true, reason: 'already_running', latest: existing };
    }
    throw new Error(`Failed to start bank reconciliation: ${error.message}`);
  }

  const result: Preparation = {
    skipped: false,
    runId: run.id,
    organizationId,
    trigger,
    mailboxes: mailboxes.map((mailbox) => ({ id: mailbox.id, emailAddress: mailbox.email_address })),
    periodsChecked: options ? [options.pullAll ? '' : options.billingPeriod!] : reconciliationPeriods(),
    workflowRunId, sources,
  };
  console.log(`[bank-reconciliation:prepare] DONE runId=${run.id}`);
  return result;
}

async function listMailboxPeriodMessages(mailbox: MailboxSpec, period: string): Promise<ListingResult> {
  "use step";
  console.log(`[bank-reconciliation:list] START mailbox=${mailbox.emailAddress} period=${period}`);
  const { listBankImportGmailMessageIds } = await import('@/lib/bank-import');
  try {
    const messageIds = await listBankImportGmailMessageIds({ mailboxId: mailbox.id, billingPeriod: period || undefined, maxMessages: 250 });
    if (messageIds.length >= 250) throw new Error('Gmail result limit reached; source completeness needs review.');
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
      billingPeriod: chunk.period || undefined,
      pullAll: !chunk.period,
      source: 'gmail',
      gmailMessageIds: chunk.messageIds,
    });
    console.log(`[bank-reconciliation:import] DONE mailbox=${chunk.mailbox.emailAddress} period=${chunk.period} messages=${chunk.messageIds.length}`);
    const failed = summaries.reduce((count, summary) => count + summary.failedMessages, 0);
    return { mailboxEmail: chunk.mailbox.emailAddress, period: chunk.period, ok: failed === 0, summaries, error: failed ? `${failed} messages failed` : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bank-reconciliation:import] FAIL mailbox=${chunk.mailbox.emailAddress} period=${chunk.period} error=${message}`);
    return { mailboxEmail: chunk.mailbox.emailAddress, period: chunk.period, ok: false, error: message };
  }
}

async function finalizeReconciliation(
  preparation: Extract<Preparation, { skipped: false }>,
  mailboxResults: ReconciliationRunView['mailboxResults'],
  autoMatch: { scanned: number; matched: number; ambiguous: number; unmatched: number; failed: number }
) {
  "use step";
  console.log(`[bank-reconciliation:finalize] START runId=${preparation.runId}`);
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const { summarizeMailboxCoverage } = await import('@/lib/bank-import-reconciliation');
  const { countCurrentProblemFiles } = await import('@/lib/bank-import-automation');
  const { getBillingPeriodForDate, getBillingWindowForPeriod } = await import('@/lib/bank-import');
  const { southAfricaDate } = await import('@/lib/rent-collections');
  const { readAllRows } = await import('@/lib/read-all-rows');
  const admin = getSupabaseAdmin();

  try {
    const mailboxIds = preparation.mailboxes.map((mailbox) => mailbox.id);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 120);
    const [occurrencesResult, problemFilesResult, evidenceFilesResult, entriesResult] = await Promise.all([
      admin.from('bank_import_file_occurrences').select('mailbox_id,file_id,file_sha256').in('mailbox_id', mailboxIds).gte('last_seen_at', since.toISOString()),
      readAllRows((from, to) => admin.from('bank_import_files').select('id,bank_import_entries(transaction_date)').in('parser_status', ['pending', 'failed']).order('id').range(from, to)),
      admin.from('bank_import_files').select('id').eq('parser_status', 'parsed'),
      readAllRows((from, to) => admin.from('bank_import_entries').select('id,file_id,transaction_date').eq('organization_id', preparation.organizationId).ilike('transaction_type', 'incoming funds').order('id').range(from, to)),
    ]);
    if (occurrencesResult.error) throw new Error(`Failed to compare mailbox files: ${occurrencesResult.error.message}`);
    if (problemFilesResult.error) throw new Error(`Failed to count problem import files: ${problemFilesResult.error.message}`);
    if (evidenceFilesResult.error) throw new Error(`Failed to load parsed payment evidence: ${evidenceFilesResult.error.message}`);
    if (entriesResult.error) throw new Error(`Failed to load imported entries: ${entriesResult.error.message}`);

    const entryIds = (entriesResult.data ?? []).map((entry) => entry.id as string);
    const relevantFileIds = new Set((evidenceFilesResult.data ?? []).map((file) => file.id as string));
    const referencesResult = entryIds.length
      ? await admin.from('payment_references').select('bank_import_entry_id').in('bank_import_entry_id', entryIds)
      : { data: [], error: null };
    if (referencesResult.error) throw new Error(`Failed to count missing payment references: ${referencesResult.error.message}`);
    const referencedEntryIds = new Set((referencesResult.data ?? []).map((reference) => reference.bank_import_entry_id as string));

    const mailboxEmailById = new Map(preparation.mailboxes.map((mailbox) => [mailbox.id, mailbox.emailAddress]));
    const configuredSourceMailbox = process.env.BANK_IMPORT_SOURCE_MAILBOX_EMAIL?.trim() || null;
    const sourceMailbox =
      configuredSourceMailbox &&
      preparation.mailboxes.some((mailbox) => mailbox.emailAddress.trim().toLowerCase() === configuredSourceMailbox.toLowerCase())
        ? configuredSourceMailbox
        : null;
    const destinationMailbox = process.env.BANK_IMPORT_DESTINATION_MAILBOX_EMAIL?.trim() || 'info.hambatrading@gmail.com';
    const coverage = summarizeMailboxCoverage({
      sourceMailbox,
      destinationMailbox,
      occurrences: (occurrencesResult.data ?? []).filter((row) => relevantFileIds.has(row.file_id as string)).map((row) => ({
        mailboxEmail: mailboxEmailById.get(row.mailbox_id as string) ?? '',
        fileSha256: row.file_sha256 as string,
      })),
    });
    const currentPeriod = getBillingPeriodForDate(southAfricaDate(new Date()));
    const window = getBillingWindowForPeriod(currentPeriod);
    const summary: ReconciliationRunView['summary'] = {
      ...coverage,
      workflowRunId: preparation.workflowRunId,
      stage: 'finished',
      autoMatch,
      failedOrPendingFiles: problemFilesResult.data?.length ?? 0,
      currentCycle: preparation.periodsChecked.includes(currentPeriod) ? {
        period: currentPeriod, sources: preparation.sources, checkedAt: new Date().toISOString(),
        failedOrPendingFiles: countCurrentProblemFiles(problemFilesResult.data ?? [], window),
        entriesMissingPaymentReference: (entriesResult.data ?? []).filter(entry => entry.transaction_date >= window.startDate && entry.transaction_date <= window.endDate && !referencedEntryIds.has(entry.id)).length,
      } : undefined,
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

async function deliverRentManagementAlert(runId: string) {
  "use step";
  console.log('[rent-management-alert] Checking post-import delivery');
  try {
    const { sendPostImportManagementAlert } = await import('@/lib/rent-management-alert-delivery');
    const result = await sendPostImportManagementAlert(runId);
    console.log(`[rent-management-alert] ${result.state}; sent=${result.sent}`);
    await recordAlertOutcome(runId, result);
    return result;
  } catch {
    // Import remains completed; alert delivery is a separately auditable outcome.
    console.error('[rent-management-alert] Delivery blocked; inspect configuration and delivery ledger.');
    const result = { state: 'delivery_blocked', sent: 0 };
    await recordAlertOutcome(runId, result).catch(() => {
      // Monitoring storage must not reclassify a successful financial import.
      console.error('[rent-management-alert] Cannot persist alert outcome; inspect delivery ledger.');
    });
    return result;
  }
}

async function recordProgress(preparation: Extract<Preparation, { skipped: false }>, slices: SliceResult[], stage: string) {
  "use step";
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const { error } = await getSupabaseAdmin().from('bank_import_reconciliation_runs').update({
    reconciliation_summary: { workflowRunId: preparation.workflowRunId, stage, periodsChecked: preparation.periodsChecked,
      completedBatches: slices.length, updatedAt: new Date().toISOString() },
    mailbox_results: slices.map((slice) => ({ mailboxEmail: slice.mailboxEmail, ok: slice.ok, summaries: slice.summaries, error: slice.error })),
  }).eq('id', preparation.runId);
  if (error) throw new Error(`Cannot persist import progress: ${error.message}`);
}

async function listDriveEvidence(mailbox: MailboxSpec, source: 'drive' | 'bank', billingPeriod?: string) {
  "use step";
  const { listBankImportDriveFiles } = await import('@/lib/bank-import');
  try { return { ok: true, files: await listBankImportDriveFiles(mailbox.id, source, billingPeriod), error: undefined }; }
  catch (error) { return { ok: false, files: [] as DriveFile[], error: error instanceof Error ? error.message : String(error) }; }
}

async function importDriveChunk(mailbox: MailboxSpec, options: BankImportRequest, files: DriveFile[]): Promise<SliceResult> {
  "use step";
  const { runBankImport } = await import('@/lib/bank-import');
  const started = Date.now();
  try {
    const summaries = await runBankImport({ ...options, mailboxId: mailbox.id,
      source: options.source === 'bank' ? 'bank' : 'drive', driveFiles: files, skipArchiveSweep: true });
    const failed = summaries.reduce((count, summary) => count + summary.failedMessages, 0);
    console.log('[bank-import:drive-batch]', { files: files.length, durationMs: Date.now() - started, failed });
    return { mailboxEmail: mailbox.emailAddress, period: options.billingPeriod ?? '', summaries, ok: failed === 0,
      error: failed ? `${failed} files failed` : undefined };
  } catch (error) { return { mailboxEmail: mailbox.emailAddress, period: options.billingPeriod ?? '', ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

async function matchImportedPayments(periods: string[], allPeriods: boolean) {
  "use step";
  const { ensurePaymentPeriodsForPeriod, autoMatchUnmatchedReferences } = await import('@/lib/monthly-payments-ops');
  for (const periodKey of periods.filter(Boolean)) await ensurePaymentPeriodsForPeriod({ periodKey });
  return autoMatchUnmatchedReferences({ actor: 'auto-match (bank import)', periods: allPeriods ? undefined : periods.filter(Boolean) });
}

async function failReconciliation(runId: string, message: string) {
  "use step";
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const { error } = await getSupabaseAdmin().from('bank_import_reconciliation_runs')
    .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: message }).eq('id', runId);
  if (error) throw new Error('Cannot persist failed import status');
}

async function recordAlertOutcome(runId: string, result: { state: string; sent: number }) {
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('bank_import_reconciliation_runs').select('reconciliation_summary').eq('id', runId).single();
  if (error) throw new Error('Cannot read alert monitoring state');
  const { error: updateError } = await admin.from('bank_import_reconciliation_runs').update({ reconciliation_summary: {
    ...data.reconciliation_summary, managementAlert: { ...result, checkedAt: new Date().toISOString() },
  } }).eq('id', runId);
  if (updateError) throw new Error('Cannot persist alert monitoring state');
}
