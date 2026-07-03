/**
 * Pure payment-allocation rules (REQUIREMENTS FR-2.8).
 *
 * Owner rulings (2026-07-02):
 * - Overpayment splits rent-first: rent covered, remainder contributes to the
 *   unit's deposit, capped at the REMAINING deposit (deposit_amount minus
 *   contributions already recorded in the deposit ledger). Anything beyond
 *   surfaces as surplus for review.
 * - Accepted splits persist to `deposit_contributions` (the deposit ledger),
 *   giving each unit a running balance toward its deposit target.
 *
 * Kept dependency-free so both the read model (monthly-payments.ts) and the
 * write ops (monthly-payments-ops.ts) can share it without an import cycle.
 */

export type DepositSplitSuggestion = {
  rentPortion: number;
  depositPortion: number;
  surplusAmount: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeDepositSplitSuggestion(input: {
  receivedAmount: number | null;
  expectedAmount: number;
  /** Remaining deposit headroom (deposit target minus ledger balance), not the raw target. */
  depositAmount: number;
}): DepositSplitSuggestion | null {
  const received = input.receivedAmount;
  if (received === null || !Number.isFinite(received)) return null;
  if (!(input.expectedAmount > 0)) return null;
  if (!(input.depositAmount > 0)) return null;

  const overpayment = roundMoney(received - input.expectedAmount);
  if (overpayment <= 0.001) return null;

  const depositPortion = roundMoney(Math.min(overpayment, input.depositAmount));
  return {
    rentPortion: roundMoney(input.expectedAmount),
    depositPortion,
    surplusAmount: roundMoney(overpayment - depositPortion),
  };
}

/**
 * Full overpayment breakdown used by the accept-split op (FR-2.8, rulings
 * 2026-07-03): rent first, then deposit up to remaining headroom, and any
 * remainder becomes HELD UNIT CREDIT instead of blocking the action.
 * Unlike computeDepositSplitSuggestion this also applies when the deposit is
 * already fully funded (depositPortion = 0, everything above rent → credit).
 */
export function computeOverpaymentAllocation(input: {
  receivedAmount: number;
  expectedAmount: number;
  depositHeadroom: number;
}): { rentPortion: number; depositPortion: number; creditAmount: number } | null {
  if (!Number.isFinite(input.receivedAmount)) return null;
  if (!(input.expectedAmount > 0)) return null;
  const overpayment = roundMoney(input.receivedAmount - input.expectedAmount);
  if (overpayment <= 0.001) return null;

  const depositPortion = roundMoney(Math.min(overpayment, Math.max(0, input.depositHeadroom)));
  return {
    rentPortion: roundMoney(input.expectedAmount),
    depositPortion,
    creditAmount: roundMoney(overpayment - depositPortion),
  };
}

/**
 * Surplus-credit allocation rules (owner rulings 2026-07-03):
 * credit held on the unit may be allocated — by an explicit operator action
 * only, never automatically — to one of THREE destinations:
 *   1. arrears: a short/unpaid period within the LAST 3 MONTHS,
 *   2. advance: the NEXT month's rent (exactly one month ahead),
 *   3. deposit: while remaining headroom > 0.
 * Every option is capped by both the credit balance and the destination's
 * own capacity (outstanding / headroom).
 */

export type CreditArrearsOption = {
  periodId: string;
  periodStart: string;
  outstandingAmount: number;
  /** min(outstanding, credit balance) */
  maxAmount: number;
};

export type CreditAllocationOptions = {
  creditBalance: number;
  arrears: CreditArrearsOption[];
  /** Next month (exactly one ahead of the selected period). */
  advance: { periodStart: string; maxAmount: number };
  /** null when the deposit is already fully funded. */
  deposit: { maxAmount: number } | null;
};

export function shiftPeriodStart(periodStart: string, delta: number): string {
  const date = new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return periodStart;
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

export function computeCreditAllocationOptions(input: {
  creditBalance: number;
  /** Period the operator is looking at (YYYY-MM-DD, first of month). */
  selectedPeriodStart: string;
  /** All of the unit's short/unpaid periods (any age); the 3-month window filter happens here. */
  arrearsCandidates: Array<{ periodId: string; periodStart: string; outstandingAmount: number }>;
  /** Deposit target minus active ledger balance. */
  depositHeadroom: number;
}): CreditAllocationOptions | null {
  const balance = roundMoney(input.creditBalance);
  if (!(balance > 0.001)) return null;

  const windowStart = shiftPeriodStart(input.selectedPeriodStart, -3);
  const arrears = input.arrearsCandidates
    .filter(
      (candidate) =>
        candidate.outstandingAmount > 0.001 &&
        candidate.periodStart >= windowStart &&
        candidate.periodStart < input.selectedPeriodStart
    )
    .sort((left, right) => (left.periodStart < right.periodStart ? -1 : 1))
    .map((candidate) => ({
      periodId: candidate.periodId,
      periodStart: candidate.periodStart,
      outstandingAmount: roundMoney(candidate.outstandingAmount),
      maxAmount: roundMoney(Math.min(candidate.outstandingAmount, balance)),
    }));

  const headroom = roundMoney(Math.max(0, input.depositHeadroom));
  return {
    creditBalance: balance,
    arrears,
    advance: { periodStart: shiftPeriodStart(input.selectedPeriodStart, 1), maxAmount: balance },
    deposit: headroom > 0.001 ? { maxAmount: roundMoney(Math.min(headroom, balance)) } : null,
  };
}
