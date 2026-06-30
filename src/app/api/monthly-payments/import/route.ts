import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { runBankImport, type BankImportSource } from '@/lib/bank-import';
import { ensurePaymentPeriodsForPeriod } from '@/lib/monthly-payments-ops';

function normalizeSource(value: string | null | undefined): BankImportSource {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'gmail' || normalized === 'drive' ? normalized : 'both';
}

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.BANK_IMPORT_CRON_SECRET?.trim();
  if (!expected) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${expected}`;
}

async function authorizeRequest(request: NextRequest) {
  if (isCronAuthorized(request)) return null;
  return requireApiAuth();
}

export async function GET(request: NextRequest) {
  const denied = await authorizeRequest(request);
  if (denied) return denied;

  const mailboxEmail = request.nextUrl.searchParams.get('mailboxEmail')?.trim() ?? undefined;
  const mailboxId = request.nextUrl.searchParams.get('mailboxId')?.trim() ?? undefined;
  const billingPeriod = request.nextUrl.searchParams.get('billingPeriod')?.trim() ?? undefined;
  const pullAll = request.nextUrl.searchParams.get('pullAll') === 'true';
  const source = normalizeSource(request.nextUrl.searchParams.get('source'));
  const maxMessagesParam = request.nextUrl.searchParams.get('maxMessages')?.trim();
  const maxMessages = maxMessagesParam ? Number(maxMessagesParam) : undefined;

  try {
    const data = await runBankImport({
      mailboxEmail,
      mailboxId,
      billingPeriod,
      pullAll,
      source,
      maxMessages: Number.isFinite(maxMessages) ? maxMessages : undefined,
    });
    if (billingPeriod) {
      await ensurePaymentPeriodsForPeriod({ periodKey: billingPeriod });
    }

    return NextResponse.json({
      success: true,
      data,
      triggeredAt: new Date().toISOString(),
      mode: isCronAuthorized(request) ? 'cron' : 'manual',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import bank data',
        triggeredAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorizeRequest(request);
  if (denied) return denied;

  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    mailboxEmail?: string;
    mailboxId?: string;
    billingPeriod?: string;
    pullAll?: boolean;
    source?: string;
    maxMessages?: number;
  };

  try {
    const data = await runBankImport({
      mailboxEmail: body.mailboxEmail?.trim() || undefined,
      mailboxId: body.mailboxId?.trim() || undefined,
      billingPeriod: body.billingPeriod?.trim() || undefined,
      pullAll: body.pullAll === true,
      source: normalizeSource(body.source),
      maxMessages: Number.isFinite(Number(body.maxMessages)) ? Number(body.maxMessages) : undefined,
    });
    if (body.billingPeriod?.trim()) {
      await ensurePaymentPeriodsForPeriod({ periodKey: body.billingPeriod.trim() });
    }

    return NextResponse.json({
      success: true,
      data,
      triggeredAt: new Date().toISOString(),
      mode: isCronAuthorized(request) ? 'cron' : 'manual',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import bank data',
        triggeredAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
