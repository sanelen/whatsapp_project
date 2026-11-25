import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { readLatestReconciliationRun } from '@/lib/bank-import-reconciliation';
import { bankImportVerificationWorkflow } from '@/workflows/bank-import-verification';
import { getBillingPeriodForDate } from '@/lib/bank-import';
import { bankImportReconciliationWorkflow } from '@/workflows/bank-import-reconciliation';

export const maxDuration = 60;

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.BANK_IMPORT_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return Boolean(expected && request.headers.get('authorization') === `Bearer ${expected}`);
}

async function authorize(request: NextRequest) {
  if (isCronAuthorized(request)) return null;
  return requireApiAuth(request);
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  if (request.nextUrl.searchParams.get('status') === 'true') {
    return NextResponse.json({ success: true, data: await readLatestReconciliationRun() });
  }
  try {
    if (request.nextUrl.searchParams.get('dryRun') === 'true') {
      const run = await start(bankImportVerificationWorkflow, [getBillingPeriodForDate(new Date().toISOString().slice(0, 10))]);
      return NextResponse.json({ success: true, queued: true, workflowRunId: run.runId, dryRun: true }, { status: 202 });
    }
    const trigger = isCronAuthorized(request) ? 'scheduled' : 'manual';
    const run = await start(bankImportReconciliationWorkflow, [false, trigger]);
    return NextResponse.json({ success: true, queued: true, workflowRunId: run.runId }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reconciliation failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const run = body.dryRun === true
      ? await start(bankImportVerificationWorkflow, [getBillingPeriodForDate(new Date().toISOString().slice(0, 10))])
      : await start(bankImportReconciliationWorkflow, [true, 'manual']);
    return NextResponse.json({ success: true, queued: true, workflowRunId: run.runId }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reconciliation failed' }, { status: 500 });
  }
}
