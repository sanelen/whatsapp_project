import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { readLatestReconciliationRun, runBankImportReconciliation } from '@/lib/bank-import-reconciliation';

export const maxDuration = 300;

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.BANK_IMPORT_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return Boolean(expected && request.headers.get('authorization') === `Bearer ${expected}`);
}

async function authorize(request: NextRequest) {
  if (isCronAuthorized(request)) return null;
  return requireApiAuth();
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  if (request.nextUrl.searchParams.get('status') === 'true') {
    return NextResponse.json({ success: true, data: await readLatestReconciliationRun() });
  }
  try {
    const result = await runBankImportReconciliation({ trigger: isCronAuthorized(request) ? 'scheduled' : 'manual' });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reconciliation failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    const result = await runBankImportReconciliation({ force: true, trigger: 'manual' });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reconciliation failed' }, { status: 500 });
  }
}
