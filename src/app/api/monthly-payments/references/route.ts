import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth/dal';
import {
  acceptDepositSplit,
  addUnitReferenceRule,
  allocateUnitCredit,
  autoMatchUnmatchedReferences,
  matchReferenceToUnit,
  reverseReferenceSplit,
  reverseSignOffAndUnmatch,
  reverseUnitCreditAllocation,
  signOffMatchedReference,
  splitPaymentReference,
} from '@/lib/monthly-payments-ops';

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as
    | {
        action?:
          | 'match'
          | 'sign_off'
          | 'reverse_sign_off'
          | 'accept_deposit_split'
          | 'auto_match'
          | 'allocate_credit'
          | 'reverse_credit_allocation'
          | 'add_match_rule'
          | 'split_reference'
          | 'reverse_split';
        propertyId?: string;
        unitId?: string;
        paymentReferenceId?: string;
        destination?: 'arrears' | 'advance' | 'deposit';
        selectedPeriodKey?: string;
        targetPeriodId?: string;
        allocationId?: string;
        amount?: number;
        allocations?: Array<{ unitId?: string; amount?: number }>;
      }
    | undefined;

  const action = body?.action;
  const paymentReferenceId = body?.paymentReferenceId?.trim();
  const CREDIT_ACTIONS = new Set(['auto_match', 'allocate_credit', 'reverse_credit_allocation']);

  if (!action || (!paymentReferenceId && !CREDIT_ACTIONS.has(action))) {
    return NextResponse.json({ error: 'Missing action or paymentReferenceId' }, { status: 400 });
  }

  try {
    if (action === 'auto_match') {
      const data = await autoMatchUnmatchedReferences({
        propertyId: body?.propertyId?.trim() || undefined,
        actor: `auto-match (${user.email ?? user.id})`,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'allocate_credit') {
      if (!body?.unitId?.trim() || !body?.destination || !body?.selectedPeriodKey?.trim()) {
        return NextResponse.json(
          { error: 'Missing unitId, destination, or selectedPeriodKey for allocate_credit' },
          { status: 400 }
        );
      }
      const data = await allocateUnitCredit({
        unitId: body.unitId.trim(),
        destination: body.destination,
        selectedPeriodKey: body.selectedPeriodKey.trim(),
        targetPeriodId: body.targetPeriodId?.trim() || undefined,
        amount: typeof body.amount === 'number' ? body.amount : undefined,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'reverse_credit_allocation') {
      if (!body?.allocationId?.trim()) {
        return NextResponse.json({ error: 'Missing allocationId' }, { status: 400 });
      }
      const data = await reverseUnitCreditAllocation({
        allocationId: body.allocationId.trim(),
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (!paymentReferenceId) {
      return NextResponse.json({ error: 'Missing paymentReferenceId' }, { status: 400 });
    }

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

    if (action === 'add_match_rule') {
      if (!body?.unitId?.trim()) {
        return NextResponse.json({ error: 'Missing unitId for add_match_rule' }, { status: 400 });
      }
      const data = await addUnitReferenceRule({
        paymentReferenceId,
        unitId: body.unitId.trim(),
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'split_reference') {
      const allocations = (body?.allocations ?? []).map((allocation) => ({
        unitId: allocation.unitId?.trim() ?? '',
        amount: typeof allocation.amount === 'number' ? allocation.amount : Number.NaN,
      }));
      if (
        allocations.length < 2 ||
        allocations.some((allocation) => !allocation.unitId || !Number.isFinite(allocation.amount))
      ) {
        return NextResponse.json(
          { error: 'split_reference needs at least two allocations, each with unitId and amount' },
          { status: 400 }
        );
      }
      const data = await splitPaymentReference({
        paymentReferenceId,
        allocations,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'reverse_split') {
      const data = await reverseReferenceSplit({
        paymentReferenceId,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'accept_deposit_split') {
      const data = await acceptDepositSplit({
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
