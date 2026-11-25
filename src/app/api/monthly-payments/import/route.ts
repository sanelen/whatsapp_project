import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';
import { getWorld } from 'workflow/runtime';
import { isReleaseCheckRequest } from '@/lib/auth/release-check';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { parseBankImportRequest } from '@/lib/bank-import-request';
import { readLatestReconciliationRun } from '@/lib/bank-import-reconciliation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { bankImportVerificationWorkflow } from '@/workflows/bank-import-verification';
import { bankImportReconciliationWorkflow } from '@/workflows/bank-import-reconciliation';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = await requireApiAuth(request);
  if (denied) return denied;
  const runId = request.nextUrl.searchParams.get('runId');
  if (!runId) return NextResponse.json({ success: false, error: 'runId is required; start an import with POST' }, { status: 400 });
  try {
    const run = getRun(runId);
    const workflowName = await run.exists ? await run.workflowName : '';
    if (!/bankImport(Reconciliation|Verification)Workflow/.test(workflowName)) {
      return NextResponse.json({ success: false, error: 'Import not found' }, { status: 404 });
    }
    const isVerification = workflowName.includes('bankImportVerificationWorkflow');
    if (await isReleaseCheckRequest(request) && !isVerification) return NextResponse.json({ success: false, error: 'Release identity can only inspect verification jobs' }, { status: 403 });
    const status = await run.status;
    const persistedSteps = isVerification ? (await getWorld().steps.list({ runId, resolveData: 'none' })).data.map(step => ({ name: step.stepName, status: step.status })) : undefined;
    const { data: progress, error } = await getSupabaseAdmin().from('bank_import_reconciliation_runs')
      .select('status,reconciliation_summary,mailbox_results,error_message')
      .contains('reconciliation_summary', { workflowRunId: runId }).maybeSingle();
    if (error) throw new Error('Cannot read persisted import progress');
    const output = (status === 'completed' ? await run.returnValue : null) as { status?: string; dryRun?: boolean; reason?: string; mailbox_results?: Array<{ summaries?: unknown[] }>; reconciliation_summary?: { autoMatch?: unknown } } | null;
    const terminal = ['completed', 'failed', 'cancelled'].includes(status);
    const completed = status === 'completed' && output?.status === 'completed';
    return NextResponse.json({ success: terminal ? completed : true, queued: !terminal, status,
      workflowRunId: runId, verification: output?.dryRun ? output : undefined, persistedSteps, progress: progress?.reconciliation_summary ?? null,
      data: (output?.mailbox_results ?? progress?.mailbox_results ?? []).flatMap((row: { summaries?: unknown[] }) => row.summaries ?? []),
      autoMatch: output?.reconciliation_summary?.autoMatch,
      error: terminal && !completed ? output?.reason ?? progress?.error_message ?? `Import ${status}` : undefined,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Cannot read import status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth(request);
  if (denied) return denied;
  let options;
  let dryRun = false;
  try { const body = await request.json(); options = parseBankImportRequest(body); dryRun = body.dryRun === true; }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid import request' }, { status: 400 }); }
  if (dryRun && !options.billingPeriod) return NextResponse.json({ success: false, error: 'Dry run requires a billing period' }, { status: 400 });
  try {
    if (!dryRun) {
      const active = await readLatestReconciliationRun();
      if (active?.status === 'running' && active.summary.workflowRunId) return NextResponse.json({
        success: true, queued: true, workflowRunId: active.summary.workflowRunId, alreadyRunning: true,
        billingPeriod: active.summary.periodsChecked?.join(', '),
      }, { status: 202 });
    }
    const run = dryRun
      ? await start(bankImportVerificationWorkflow, [options.billingPeriod!])
      : await start(bankImportReconciliationWorkflow, [true, 'manual', options]);
    return NextResponse.json({ success: true, queued: true, workflowRunId: run.runId, billingPeriod: options.billingPeriod, source: options.source }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Cannot start import' }, { status: 500 });
  }
}
