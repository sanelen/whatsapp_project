import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { getAdminBankAccounts } from '@/lib/server/bank-accounts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireApiAuth(request);
  if (denied) return denied;

  return NextResponse.json(
    { accounts: getAdminBankAccounts() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
