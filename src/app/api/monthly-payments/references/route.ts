import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth/dal';
import {
  matchReferenceToUnit,
  reverseSignOffAndUnmatch,
  signOffMatchedReference,
} from '@/lib/monthly-payments-ops';

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as
    | {
        action?: 'match' | 'sign_off' | 'reverse_sign_off';
        propertyId?: string;
        unitId?: string;
        paymentReferenceId?: string;
      }
    | undefined;

  const action = body?.action;
  const paymentReferenceId = body?.paymentReferenceId?.trim();

  if (!action || !paymentReferenceId) {
    return NextResponse.json({ error: 'Missing action or paymentReferenceId' }, { status: 400 });
  }

  try {
    if (action === 'match') {
      if (!body?.propertyId?.trim() || !body?.unitId?.trim()) {
        return NextResponse.json({ error: 'Missing propertyId or unitId for match' }, { status: 400 });
      }

      const data = await matchReferenceToUnit({
        propertyId: body.propertyId.trim(),
        unitId: body.unitId.trim(),
        paymentReferenceId,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'sign_off') {
      const data = await signOffMatchedReference({
        paymentReferenceId,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'reverse_sign_off') {
      const data = await reverseSignOffAndUnmatch({
        paymentReferenceId,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monthly payments action failed' },
      { status: 500 }
    );
  }
}
