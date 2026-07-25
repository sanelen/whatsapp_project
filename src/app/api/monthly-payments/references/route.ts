import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth/dal';
import {
  acceptDepositSplit,
  addUnitReferenceRule,
  allocateUnitCredit,
  autoMatchUnmatchedReferences,
  matchReferenceToUnit,
  moveMatchedReferenceToDeposit,
  reassignMatchedReferenceToNextPeriod,
  removeUnitMatchKeyword,
  removeUnitMatchRule,
  reverseSignOffAndUnmatch,
  reverseUnitCreditAllocation,
  resolveOverpayment,
  signOffMatchedReference,
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
          | 'resolve_overpayment'
          | 'auto_match'
          | 'allocate_credit'
          | 'reverse_credit_allocation'
          | 'add_match_rule'
          | 'move_to_deposit'
          | 'reassign_period'
          | 'remove_match_keyword'
          | 'remove_match_rule';
        propertyId?: string;
        unitId?: string;
        unitPaymentPeriodId?: string;
        paymentReferenceId?: string;
        destination?: 'current' | 'arrears' | 'advance' | 'deposit';
        selectedPeriodKey?: string;
        targetPeriodKey?: string;
        targetPeriodId?: string;
        allocationId?: string;
        amount?: number;
        matchKeyword?: string;
        ruleId?: string;
        reason?: string;
      }
    | undefined;

  const action = body?.action;
  const paymentReferenceId = body?.paymentReferenceId?.trim();
  const CREDIT_ACTIONS = new Set([
    'auto_match',
    'allocate_credit',
    'reverse_credit_allocation',
    'resolve_overpayment',
    'remove_match_keyword',
    'remove_match_rule',
  ]);

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

    if (action === 'remove_match_keyword') {
      if (!body?.unitId?.trim() || !body?.matchKeyword?.trim()) {
        return NextResponse.json({ error: 'Missing unitId or matchKeyword for remove_match_keyword' }, { status: 400 });
      }
      const data = await removeUnitMatchKeyword({
        unitId: body.unitId.trim(),
        keyword: body.matchKeyword.trim(),
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'remove_match_rule') {
      if (!body?.unitId?.trim() || !body?.ruleId?.trim()) {
        return NextResponse.json({ error: 'Missing unitId or ruleId for remove_match_rule' }, { status: 400 });
      }
      const data = await removeUnitMatchRule({
        unitId: body.unitId.trim(),
        ruleId: body.ruleId.trim(),
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'resolve_overpayment') {
      if (!body?.unitPaymentPeriodId?.trim() || !body?.destination || !body?.selectedPeriodKey?.trim()) {
        return NextResponse.json(
          { error: 'Missing unitPaymentPeriodId, destination, or selectedPeriodKey for resolve_overpayment' },
          { status: 400 }
        );
      }
      const data = await resolveOverpayment({
        unitPaymentPeriodId: body.unitPaymentPeriodId.trim(),
        destination: body.destination,
        selectedPeriodKey: body.selectedPeriodKey.trim(),
        targetPeriodId: body.targetPeriodId?.trim() || undefined,
        amount: typeof body.amount === 'number' ? body.amount : undefined,
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

    if (action === 'move_to_deposit') {
      const data = await moveMatchedReferenceToDeposit({
        paymentReferenceId,
        actor: user.email ?? user.id,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'reassign_period') {
      if (!body?.targetPeriodKey?.trim()) {
        return NextResponse.json({ error: 'Missing targetPeriodKey for reassign_period' }, { status: 400 });
      }
      const data = await reassignMatchedReferenceToNextPeriod({
        paymentReferenceId,
        targetPeriodKey: body.targetPeriodKey.trim(),
        reason: body.reason?.trim() || undefined,
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
