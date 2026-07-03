import {
  computeDepositSplitSuggestion,
  roundMoney,
  type DepositSplitSuggestion,
} from '@/lib/payment-allocation';

export type UnitTableStatus =
  | 'paid'
  | 'pending'
  | 'unpaid'
  | 'partial'
  | 'overpaid'
  | 'mismatch'
  | 'overdue'
  | 'blocked';

export type ComputedUnitStatus = {
  status: UnitTableStatus;
  overdueDays: number | null;
  receivedAmount: number | null;
  signedOffAmount: number;
  pendingAmount: number;
  outstandingAmount: number | null;
  hasMatchedPayment: boolean;
  hasExactPayment: boolean;
  signedOff: boolean;
  depositSplit: DepositSplitSuggestion | null;
};

function toMoney(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function diffDaysUtc(from: string, to: Date): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(fromMs)) return 0;
  return Math.floor((to.getTime() - fromMs) / 86_400_000);
}

/**
 * Shared payment-state rules for both dashboard/unit reads and write-side
 * recomputation after match/sign-off/reverse actions.
 */
export function computeUnitStatus(input: {
  occupancyStatus: 'occupied' | 'vacant';
  isBlocked: boolean;
  expectedAmount: number;
  depositAmount?: number;
  depositContributedAmount?: number;
  /** Non-reversed credit allocations applied to this period (FR-2.8 rulings 2026-07-03) — counts toward the received side like operator-approved money. */
  creditAppliedAmount?: number;
  matchedReferences: Array<{
    amount: number | string;
    signed_off: boolean;
  }>;
  dueDate: string | null;
  now: Date;
}): ComputedUnitStatus {
  const empty = {
    overdueDays: null as number | null,
    receivedAmount: null as number | null,
    signedOffAmount: 0,
    pendingAmount: 0,
    outstandingAmount: null as number | null,
    hasMatchedPayment: false,
    hasExactPayment: false,
    signedOff: false,
    depositSplit: null as DepositSplitSuggestion | null,
  };

  if (input.isBlocked || input.occupancyStatus === 'vacant') {
    return { status: 'blocked', ...empty };
  }

  const creditApplied = input.creditAppliedAmount ?? 0;
  // Credit-only coverage (e.g. an advance month with no bank reference yet)
  // still counts as money on the period: base received starts at 0, not null.
  const receivedAmount = input.matchedReferences.length
    ? input.matchedReferences.reduce((sum, reference) => sum + toMoney(reference.amount), 0)
    : creditApplied > 0.001
      ? 0
      : null;
  const contributed = input.depositContributedAmount ?? 0;
  const effectiveReceived =
    receivedAmount === null ? null : roundMoney(receivedAmount - contributed + creditApplied);
  const signedOffAmount = input.matchedReferences
    .filter((reference) => reference.signed_off)
    .reduce((sum, reference) => sum + toMoney(reference.amount), 0);
  const pendingAmount = roundMoney((receivedAmount ?? 0) - signedOffAmount);
  const hasMatchedPayment = receivedAmount !== null;
  const hasExactPayment =
    effectiveReceived !== null && Math.abs(effectiveReceived - input.expectedAmount) <= 0.001;
  // Credit was allocated by an explicit operator action from already-signed-off
  // money, so a period covered purely by credit reads signed-off; mixed periods
  // still require every bank reference to be signed off.
  const signedOff = input.matchedReferences.length > 0
    ? input.matchedReferences.every((reference) => reference.signed_off)
    : creditApplied > 0.001;
  const overdueDays = input.dueDate ? diffDaysUtc(input.dueDate, input.now) : 0;

  if (hasExactPayment) {
    return {
      ...empty,
      status: signedOff ? 'paid' : 'pending',
      receivedAmount,
      signedOffAmount,
      pendingAmount,
      hasMatchedPayment,
      hasExactPayment,
      signedOff,
    };
  }

  if (hasMatchedPayment && effectiveReceived !== null) {
    if (effectiveReceived < input.expectedAmount) {
      return {
        ...empty,
        status: 'partial',
        overdueDays: overdueDays > 0 ? overdueDays : null,
        receivedAmount,
        signedOffAmount,
        pendingAmount,
        outstandingAmount: roundMoney(input.expectedAmount - effectiveReceived),
        hasMatchedPayment,
        hasExactPayment,
        signedOff,
      };
    }

    let depositSplit = computeDepositSplitSuggestion({
      receivedAmount: effectiveReceived,
      expectedAmount: input.expectedAmount,
      depositAmount: input.depositAmount ?? 0,
    });
    // FR-2.8 rulings 2026-07-03: a fully-funded deposit must not turn an
    // overpayment into a dead-end mismatch — the whole overage is offered as
    // held credit (depositPortion 0).
    if (!depositSplit && input.expectedAmount > 0 && effectiveReceived > input.expectedAmount + 0.001) {
      depositSplit = {
        rentPortion: roundMoney(input.expectedAmount),
        depositPortion: 0,
        surplusAmount: roundMoney(effectiveReceived - input.expectedAmount),
      };
    }
    return {
      ...empty,
      status: depositSplit ? 'overpaid' : 'mismatch',
      receivedAmount,
      signedOffAmount,
      pendingAmount,
      hasMatchedPayment,
      hasExactPayment,
      signedOff,
      depositSplit,
    };
  }

  if (overdueDays > 0) {
    return { ...empty, status: 'overdue', overdueDays };
  }

  return { ...empty, status: 'unpaid' };
}
