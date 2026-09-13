export type StayOwnershipRow = {
  id: string;
  status: 'holding' | 'active' | 'notice' | 'ended';
  startsOn: string | null;
  endsOn: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type StayOwnershipResolution =
  | {
      kind: 'resolved';
      stay: StayOwnershipRow;
      basis: 'billing_period' | 'transaction_date' | 'only_undated_stay';
    }
  | {
      kind: 'ambiguous';
      candidateIds: string[];
      date: string;
      basis: 'billing_period' | 'transaction_date';
    }
  | {
      kind: 'none';
    };

function stayCoversDate(stay: StayOwnershipRow, date: string) {
  const startsOn = stay.startsOn ?? '0000-01-01';
  const endsOn = stay.endsOn ?? (stay.closedAt ? stay.closedAt.slice(0, 10) : '9999-12-31');
  return startsOn <= date && endsOn >= date;
}

function candidatesForDate(stays: StayOwnershipRow[], date: string) {
  return stays
    .filter((stay) => stayCoversDate(stay, date))
    .sort((left, right) => {
      const startComparison = (right.startsOn ?? '').localeCompare(left.startsOn ?? '');
      return startComparison || right.createdAt.localeCompare(left.createdAt);
    });
}

/**
 * An explicitly assigned billing period is the primary ownership signal. This
 * lets a tenant pay shortly before their stay starts without attributing the
 * money to the departing tenant. Transaction dates are the fallback for older
 * references that do not have a usable period boundary.
 */
export function resolveStayOwnership(input: {
  stays: StayOwnershipRow[];
  billingPeriodStart?: string | null;
  transactionDates?: Array<string | null | undefined>;
}): StayOwnershipResolution {
  if (input.stays.length === 0) return { kind: 'none' };

  if (input.billingPeriodStart) {
    const periodCandidates = candidatesForDate(input.stays, input.billingPeriodStart);
    if (periodCandidates.length === 1) {
      return { kind: 'resolved', stay: periodCandidates[0], basis: 'billing_period' };
    }
    if (periodCandidates.length > 1) {
      return {
        kind: 'ambiguous',
        candidateIds: periodCandidates.map((stay) => stay.id),
        date: input.billingPeriodStart,
        basis: 'billing_period',
      };
    }
  }

  const transactionDates = Array.from(
    new Set((input.transactionDates ?? []).map((date) => date?.slice(0, 10)).filter(Boolean) as string[])
  );
  const transactionCandidateIds = new Set<string>();
  let ambiguousDate = transactionDates[0] ?? '';

  for (const date of transactionDates) {
    const dateCandidates = candidatesForDate(input.stays, date);
    if (dateCandidates.length > 1) {
      return {
        kind: 'ambiguous',
        candidateIds: dateCandidates.map((stay) => stay.id),
        date,
        basis: 'transaction_date',
      };
    }
    if (dateCandidates[0]) transactionCandidateIds.add(dateCandidates[0].id);
    ambiguousDate = date;
  }

  if (transactionCandidateIds.size === 1) {
    const stayId = Array.from(transactionCandidateIds)[0];
    const stay = input.stays.find((candidate) => candidate.id === stayId);
    if (stay) return { kind: 'resolved', stay, basis: 'transaction_date' };
  }
  if (transactionCandidateIds.size > 1) {
    return {
      kind: 'ambiguous',
      candidateIds: Array.from(transactionCandidateIds),
      date: ambiguousDate,
      basis: 'transaction_date',
    };
  }

  if (
    input.stays.length === 1 &&
    !input.stays[0].startsOn &&
    !input.stays[0].endsOn
  ) {
    return { kind: 'resolved', stay: input.stays[0], basis: 'only_undated_stay' };
  }

  return { kind: 'none' };
}
