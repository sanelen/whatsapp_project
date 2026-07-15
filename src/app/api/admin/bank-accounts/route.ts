import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { getAdminBankAccounts } from '@/lib/server/bank-accounts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;

  return NextResponse.json(
    { accounts: getAdminBankAccounts() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
