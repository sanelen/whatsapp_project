import { roundMoney } from './payment-allocation';

export type RentBalance = {
  expectedAmount: number;
  confirmedAmount: number;
  pendingAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  excessAmount: number;
  dueDate: string | null;
  chargeMissing: boolean;
};

export type CollectionRoom = RentBalance & {
  unitId: string;
  propertyId: string;
  propertyName: string;
  label: string;
  periodId: string | null;
};

export function southAfricaDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Saved charges are historical truth. Today's occupancy/rent cannot rewrite them. */
export function calculateRentBalance(input: {
  period?: { expected_amount: number | string; is_blocked: boolean; due_date?: string | null };
  references: Array<{ id: string; amount: number | string; signed_off: boolean }>;
  depositByReference?: Record<string, number>;
  creditFromReference?: Record<string, number>;
  creditApplied?: number;
  now: Date;
  chargeMissing?: boolean;
}): RentBalance {
  const money = (value: number | string | undefined) => Math.max(0, roundMoney(Number(value) || 0));
  const expectedAmount = input.period && !input.period.is_blocked ? money(input.period.expected_amount) : 0;
  let confirmed = money(input.creditApplied);
  let pending = 0;
  for (const ref of input.references) {
    const rent = money(money(ref.amount) - money(input.depositByReference?.[ref.id]) - money(input.creditFromReference?.[ref.id]));
    if (ref.signed_off) confirmed += rent;
    else pending += rent;
  }
  const confirmedAmount = roundMoney(Math.min(expectedAmount, confirmed));
  const outstandingAmount = roundMoney(expectedAmount - confirmedAmount);
  const dueDate = input.period?.due_date ?? null;
  return {
    expectedAmount, confirmedAmount, outstandingAmount,
    pendingAmount: roundMoney(Math.min(outstandingAmount, pending)),
    excessAmount: roundMoney(Math.max(0, confirmed + pending - expectedAmount)),
    overdueAmount: dueDate && dueDate < southAfricaDate(input.now) ? outstandingAmount : 0,
    dueDate, chargeMissing: input.chargeMissing ?? !input.period,
  };
}

export function sumRentBalances(rows: RentBalance[]) {
  return rows.reduce((total, row) => ({
    expectedAmount: roundMoney(total.expectedAmount + row.expectedAmount),
    confirmedAmount: roundMoney(total.confirmedAmount + row.confirmedAmount),
    pendingAmount: roundMoney(total.pendingAmount + row.pendingAmount),
    outstandingAmount: roundMoney(total.outstandingAmount + row.outstandingAmount),
    overdueAmount: roundMoney(total.overdueAmount + row.overdueAmount),
    excessAmount: roundMoney(total.excessAmount + row.excessAmount),
    chargeMissingCount: total.chargeMissingCount + Number(row.chargeMissing),
    unknownDueDateCount: total.unknownDueDateCount + Number(row.outstandingAmount > 0 && !row.dueDate),
  }), { expectedAmount: 0, confirmedAmount: 0, pendingAmount: 0, outstandingAmount: 0, overdueAmount: 0, excessAmount: 0, chargeMissingCount: 0, unknownDueDateCount: 0 });
}

export const rentCurrency = (amount: number) => `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildManagementSummary(input: {
  building: string; period: string; rooms: CollectionRoom[]; dashboardUrl: string;
  asOf: string; unmatchedAmount: number; unmatchedCount: number;
}) {
  const total = sumRentBalances(input.rooms);
  const overdue = input.rooms.filter(room => room.overdueAmount > 0).sort((a, b) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return [
    `*Hamba rent briefing*`,
    `*${input.building} · ${input.period}*`,
    `As of ${input.asOf} (South Africa)`,
    '',
    `*Overdue: ${rentCurrency(total.overdueAmount)} · ${overdue.length} ${overdue.length === 1 ? 'room' : 'rooms'}*`,
    ...overdue.slice(0, 5).map(room => `• ${input.building === 'All buildings' ? `${room.propertyName} / ` : ''}${room.label}: *${rentCurrency(room.overdueAmount)}* · due ${room.dueDate}${room.pendingAmount > 0 ? ` · ${rentCurrency(room.pendingAmount)} pending: verify first` : ''}`),
    ...(overdue.length > 5 ? [`+ ${overdue.length - 5} more overdue rooms in the review link.`] : []),
    ...(overdue.length ? [] : ['No saved charges are overdue.']),
    '',
    `*Awaiting sign-off: ${rentCurrency(total.pendingAmount)}*`,
    'Verify matched receipts before following up.',
    `Outstanding: ${rentCurrency(total.outstandingAmount)} (includes pending sign-off).`,
    `Unmatched to review: ${input.unmatchedCount} · ${rentCurrency(input.unmatchedAmount)}.`,
    ...(total.chargeMissingCount ? [`*Incomplete:* ${total.chargeMissingCount} rooms have no saved charge.`] : []),
    ...(total.unknownDueDateCount ? [`${total.unknownDueDateCount} outstanding rooms have no due date.`] : []),
    '',
    `Review rooms: ${input.dashboardUrl}`,
  ].join('\n');
}

export function managementWhatsAppUrl(recipient: string, message: string) {
  const digits = recipient.replace(/[\s+()-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
