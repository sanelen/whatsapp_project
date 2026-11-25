import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth/dal';
import { parseManagementBriefingRequest } from '@/lib/management-briefing-request';
import { sendOneOffManagementAlert } from '@/lib/rent-management-alert-delivery';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = parseManagementBriefingRequest(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'A building and billing month are required; recipient overrides are not accepted.' }, { status: 400 });
  if (user.role === 'release-check' || request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Send from the signed-in payments page.' }, { status: 403 });
  }
  try {
    const result = await sendOneOffManagementAlert(input);
    return NextResponse.json({ success: true, data: result });
  } catch {
    // No transport detail or credential leaks; never retry an uncertain attempt.
    return NextResponse.json({ error: 'Delivery needs operator verification. Check the delivery ledger before sending again.' }, { status: 500 });
  }
}
