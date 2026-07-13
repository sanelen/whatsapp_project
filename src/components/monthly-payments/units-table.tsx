'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, TriangleAlert } from 'lucide-react';
import type {
  PropertyUnitsTable,
  UnitTableRow,
  UnitTableStatus,
} from '@/lib/monthly-payments';
import { formatUnitOccupancySummary } from '@/lib/unit-display';
import { sortReferencesForUnit } from '@/lib/reference-recommendations';
import { MonthlyPaymentsNavigation } from './monthly-payments-navigation';

function formatRand(amount: number): string {
  return amount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPeriodMonth(periodStart: string | null): string {
  if (!periodStart) return '—';
  const ms = Date.parse(`${periodStart.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(ms)) return periodStart;
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

function formatTxnDate(value: string | null): string {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return value;
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(ms));
}

function shiftPeriod(key: string, delta: number): string {
  const date = new Date(`${key}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return value;
  return `${digits.slice(0, 3)}...${digits.slice(-3)}`;
}

function unitOccupancySummary(row: UnitTableRow) {
  return formatUnitOccupancySummary({
    occupancy: row.occupancy,
    contacts: row.contacts.map(maskPhone),
  });
}

const STATUS_META: Record<UnitTableStatus, { bg: string; fg: string }> = {
  paid: { bg: '#e8f6ee', fg: '#0f7b53' },
  pending: { bg: '#e6f3fb', fg: '#0369a1' },
  unpaid: { bg: '#fdf3e3', fg: '#b45309' },
  partial: { bg: '#fdf3e3', fg: '#b45309' },
  overpaid: { bg: '#fdf3e3', fg: '#b45309' },
  mismatch: { bg: '#fbe7e7', fg: '#b91c1c' },
  overdue: { bg: '#fbe7e7', fg: '#b91c1c' },
  blocked: { bg: '#f1efe9', fg: '#78716c' },
};

function statusLabel(row: UnitTableRow): string {
  if (row.status === 'overdue' && row.overdueDays) return `overdue ${row.overdueDays}d`;
  if (row.status === 'pending') return 'awaiting sign-off';
  if (row.status === 'partial' && row.overdueDays) return `partial · ${row.overdueDays}d`;
  return row.status;
}

async function postReferenceAction<T = unknown>(body: Record<string, string>): Promise<T | undefined> {
  const response = await fetch('/api/monthly-payments/references', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; data?: T };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Monthly payments action failed');
  }
  return payload.data;
}

export function UnitsTable({
  table,
  initialUnitId,
}: {
  table: PropertyUnitsTable;
  initialUnitId?: string;
}) {
  const base = `/monthly-payments/${table.propertyId}`;
  const roomManagerBase = `/monthly-payments/locations/${table.propertyId}?period=${table.periodKey}`;
  const isMissingTables = table.setupState === 'missing_tables';
  const rows = table.rows;
  const referencePoolTotal = table.referencePool.reduce((sum, reference) => sum + reference.amount, 0);
  const router = useRouter();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId ?? null);
  const [pendingAction, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  // FR-2.7: last action performed inside the match drawer ("what just happened"),
  // shown above the candidate list, which stays open after a match.
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  // FR-2.7b: pending "Add this reference to the unit's reference list?" prompt
  // after a sign-off the unit's rules would not have auto-matched. Owner
  // ruling: always a question, never automatic.
  const [rulePrompt, setRulePrompt] = useState<{
    unitId: string;
    referenceId: string;
    referenceText: string;
    unitLabel: string;
  } | null>(null);

  function refreshTable() {
    setErrorMessage(null);
    router.refresh();
  }

  function openMatchDrawer(row: UnitTableRow) {
    setErrorMessage(null);
    setDrawerNotice(null);
    setSelectedUnitId(row.unitId);
  }

  function handleMatch(referenceId: string, unitId: string) {
    const matchedReference = table.referencePool.find((reference) => reference.id === referenceId);
    const targetRow = rows.find((row) => row.unitId === unitId);
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'match',
          paymentReferenceId: referenceId,
          propertyId: table.propertyId,
          unitId,
        });
        // FR-2.7 (owner request 2026-07-03): keep the drawer and remaining
        // candidates open after a match so multi-reference sessions can
        // continue without re-opening the panel per reference.
        setDrawerNotice(
          matchedReference
            ? `Matched R ${formatRand(matchedReference.amount)} · ${matchedReference.reference} → ${targetRow?.label ?? 'unit'} (awaiting sign-off)`
            : 'Reference matched (awaiting sign-off)'
        );
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to match reference');
      }
    });
  }

  function handleSignOff(row: UnitTableRow) {
    const referenceId = row.referenceId;
    if (!referenceId) return;
    startTransition(async () => {
      try {
        const data = await postReferenceAction<{
          signedOff: boolean;
          suggestReferenceRule?: boolean;
          referenceText?: string;
        }>({
          action: 'sign_off',
          paymentReferenceId: referenceId,
        });
        // FR-2.7b: if the unit's rules would NOT have auto-matched this
        // reference, offer to persist it so next month matches automatically.
        if (data?.suggestReferenceRule) {
          setRulePrompt({
            unitId: row.unitId,
            referenceId,
            referenceText: data.referenceText ?? row.reference ?? '',
            unitLabel: row.label,
          });
        } else {
          setRulePrompt(null);
        }
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to sign off reference');
      }
    });
  }

  // FR-2.7b accept/decline for the sign-off learning prompt.
  function handleAddReferenceRule(prompt: NonNullable<typeof rulePrompt>) {
    startTransition(async () => {
      try {
        const data = await postReferenceAction<{ added: boolean; alreadyCovered: boolean }>({
          action: 'add_match_rule',
          paymentReferenceId: prompt.referenceId,
          unitId: prompt.unitId,
        });
        setSelectedUnitId(prompt.unitId);
        setDrawerNotice(
          data?.added
            ? `Rule saved — "${prompt.referenceText}" will auto-match ${prompt.unitLabel} next month`
            : `Already covered — an active rule for ${prompt.unitLabel} matches this reference`
        );
        setRulePrompt(null);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to add reference rule');
      }
    });
  }

  function handleReverse(referenceId: string) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'reverse_sign_off',
          paymentReferenceId: referenceId,
        });
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to reverse sign-off');
      }
    });
  }

  function handleAutoMatch() {
    startTransition(async () => {
      try {
        setNoticeMessage(null);
        const response = await fetch('/api/monthly-payments/references', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto_match', propertyId: table.propertyId }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          data?: { scanned: number; matched: number; ambiguous: number; unmatched: number; failed: number };
        };
        if (!response.ok) throw new Error(payload.error ?? 'Auto-match failed');
        const result = payload.data;
        setNoticeMessage(
          result
            ? `Auto-match: ${result.matched} matched (awaiting your sign-off) · ${result.ambiguous} need review · ${result.unmatched} no rule hit`
            : 'Auto-match complete'
        );
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Auto-match failed');
      }
    });
  }

  function handleAcceptSplit(referenceId: string) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'accept_deposit_split',
          paymentReferenceId: referenceId,
        });
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to accept deposit split');
      }
    });
  }

  // FR-2.8 (owner rulings 2026-07-03): allocate held credit — explicit click
  // only, never automatic. Destinations come from row.creditOptions.
  function handleAllocateCredit(input: {
    unitId: string;
    destination: 'arrears' | 'advance' | 'deposit';
    targetPeriodId?: string;
    amount: number;
    label: string;
  }) {
    startTransition(async () => {
      try {
        const response = await fetch('/api/monthly-payments/references', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'allocate_credit',
            unitId: input.unitId,
            destination: input.destination,
            selectedPeriodKey: table.periodKey,
            targetPeriodId: input.targetPeriodId,
            amount: input.amount,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Failed to allocate credit');
        setDrawerNotice(`Allocated R ${formatRand(input.amount)} credit → ${input.label}`);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to allocate credit');
      }
    });
  }

  function handleReverseAllocation(allocationId: string) {
    startTransition(async () => {
      try {
        const response = await fetch('/api/monthly-payments/references', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reverse_credit_allocation', allocationId }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Failed to reverse credit allocation');
        setDrawerNotice('Credit allocation reversed — the amount is back in the held balance');
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to reverse credit allocation');
      }
    });
  }

  // Shared credit block for both drawers: held balance, allocation buttons
  // (suggest-only — nothing moves without a click), active allocations.
  function renderCreditSection(row: UnitTableRow) {
    if (row.creditBalance <= 0.001 && row.creditAllocations.length === 0) return null;
    const options = row.creditOptions;
    return (
      <div className="rounded-[20px] border border-violet-200 bg-violet-50/60 p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-violet-700">Held credit</p>
        <p className="mt-1 text-lg font-semibold text-violet-900">R {formatRand(row.creditBalance)}</p>
        {options ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-violet-800">Allocate to:</p>
            {options.arrears.map((arrear) => (
              <button
                key={arrear.periodId}
                type="button"
                disabled={pendingAction}
                onClick={() =>
                  handleAllocateCredit({
                    unitId: row.unitId,
                    destination: 'arrears',
                    targetPeriodId: arrear.periodId,
                    amount: arrear.maxAmount,
                    label: `${formatPeriodMonth(arrear.periodStart)} (short R ${formatRand(arrear.outstandingAmount)})`,
                  })
                }
                className="flex w-full items-center justify-between rounded-xl border border-violet-300 bg-white px-3 py-2 text-left text-[0.82rem] font-semibold text-violet-900 hover:border-violet-500 disabled:cursor-wait disabled:text-stone-400"
              >
                <span>{formatPeriodMonth(arrear.periodStart)} — R {formatRand(arrear.outstandingAmount)} short</span>
                <span className="text-violet-700">allocate R {formatRand(arrear.maxAmount)}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={pendingAction}
              onClick={() =>
                handleAllocateCredit({
                  unitId: row.unitId,
                  destination: 'advance',
                  amount: options.advance.maxAmount,
                  label: `${formatPeriodMonth(options.advance.periodStart)} advance`,
                })
              }
              className="flex w-full items-center justify-between rounded-xl border border-violet-300 bg-white px-3 py-2 text-left text-[0.82rem] font-semibold text-violet-900 hover:border-violet-500 disabled:cursor-wait disabled:text-stone-400"
            >
              <span>{formatPeriodMonth(options.advance.periodStart)} rent (advance)</span>
              <span className="text-violet-700">allocate R {formatRand(options.advance.maxAmount)}</span>
            </button>
            {options.deposit ? (
              <button
                type="button"
                disabled={pendingAction}
                onClick={() =>
                  handleAllocateCredit({
                    unitId: row.unitId,
                    destination: 'deposit',
                    amount: options.deposit ? options.deposit.maxAmount : 0,
                    label: 'deposit',
                  })
                }
                className="flex w-full items-center justify-between rounded-xl border border-violet-300 bg-white px-3 py-2 text-left text-[0.82rem] font-semibold text-violet-900 hover:border-violet-500 disabled:cursor-wait disabled:text-stone-400"
              >
                <span>Deposit (headroom remains)</span>
                <span className="text-violet-700">allocate R {formatRand(options.deposit.maxAmount)}</span>
              </button>
            ) : null}
            <p className="text-[0.72rem] text-violet-700/80">
              Suggestions only — nothing moves without your click. Arrears offered for the last 3 months.
            </p>
          </div>
        ) : null}
        {row.creditAllocations.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-semibold text-violet-800">Allocated:</p>
            {row.creditAllocations.map((allocation) => (
              <div key={allocation.id} className="flex items-center justify-between gap-2 text-[0.78rem] text-violet-900">
                <span>
                  R {formatRand(allocation.amount)} → {allocation.destination === 'deposit' ? 'deposit' : formatPeriodMonth(allocation.targetPeriodStart)}
                  {allocation.destination === 'advance' ? ' (advance)' : allocation.destination === 'arrears' ? ' (arrears)' : ''}
                </span>
                <button
                  type="button"
                  disabled={pendingAction}
                  onClick={() => handleReverseAllocation(allocation.id)}
                  className="font-semibold text-violet-700 underline underline-offset-2 disabled:text-stone-400"
                >
                  reverse
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderReference(row: UnitTableRow) {
    if (row.reference) {
      return (
        <button
          type="button"
          onClick={() => openMatchDrawer(row)}
          className="inline-flex items-center gap-1.5 text-left text-[0.85rem] font-medium leading-4 text-stone-700"
        >
          <span>{row.reference}</span>
          {row.status === 'mismatch' ? <TriangleAlert size={14} className="text-rose-700" /> : null}
          {row.status === 'overpaid' ? <TriangleAlert size={14} className="text-amber-600" /> : null}
          {row.locked ? <Lock size={14} className="text-amber-600" /> : null}
        </button>
      );
    }

    if (row.status === 'blocked') {
      return <span className="text-[0.85rem] text-stone-400">excluded</span>;
    }

    return (
      <button
        type="button"
        onClick={() => openMatchDrawer(row)}
        className="inline-flex items-center whitespace-nowrap rounded-[12px] border border-dashed border-sky-700 px-2.5 py-1 text-[0.78rem] font-semibold text-sky-800"
      >
        + match ref
      </button>
    );
  }

  function renderInlineDetail(row: UnitTableRow) {
    const rowCandidates = sortReferencesForUnit(row, table.referencePool);
    const showCandidates =
      row.status !== 'blocked' && (!row.reference || row.status === 'mismatch' || row.status === 'overpaid' || row.status === 'partial');

    return (
      <div className="border-t border-[#f0ece0] bg-[#fbfaf6] px-[18px] pb-[22px] pt-3.5">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#a39d8d]">Contact</p>
            <p className="mt-1 text-[13px] text-[#292524]">
              {unitOccupancySummary(row)}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#a39d8d]">Expected</p>
            <p className="mt-1 text-[13px] text-[#292524]">R {formatRand(row.expectedAmount)}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#a39d8d]">Received</p>
            <p className="mt-1 text-[13px] text-[#292524]">
              {row.receivedAmount !== null ? `R ${formatRand(row.receivedAmount)}` : '-'}
              {row.status === 'partial' && row.outstandingAmount !== null ? (
                <span className="font-semibold text-[#b45309]"> · {formatRand(row.outstandingAmount)} outstanding</span>
              ) : null}
              {row.status === 'overpaid' && row.depositSplit ? (
                <span className="font-semibold text-[#b45309]">
                  {' '}· rent {formatRand(row.depositSplit.rentPortion)} + deposit {formatRand(row.depositSplit.depositPortion)}
                  {row.depositSplit.surplusAmount > 0 ? ` (+${formatRand(row.depositSplit.surplusAmount)} over)` : ''}
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <Link
              href={`${roomManagerBase}&unitId=${row.unitId}`}
              className="text-[12.5px] font-semibold text-[#0369a1] underline underline-offset-2"
            >
              manage room
            </Link>
          </div>
        </div>

        {drawerNotice && selectedUnitId === row.unitId ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">
            {drawerNotice}
          </p>
        ) : null}

        {rulePrompt && rulePrompt.unitId === row.unitId ? (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3">
            <p className="text-[13px] font-semibold text-sky-900">
              Add this reference to {rulePrompt.unitLabel}&apos;s reference list?
            </p>
            <p className="mt-1 text-[12px] text-sky-800">
              &ldquo;{rulePrompt.referenceText}&rdquo; wouldn&apos;t have matched automatically — save it as a rule
              and next month it matches {rulePrompt.unitLabel} without you.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => handleAddReferenceRule(rulePrompt)}
                disabled={pendingAction}
                className="rounded-full bg-[#0369a1] px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
              >
                Yes, add rule
              </button>
              <button
                type="button"
                onClick={() => setRulePrompt(null)}
                disabled={pendingAction}
                className="rounded-full border border-[#e7e3d6] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#57534e] disabled:cursor-wait"
              >
                No, just this once
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {row.referenceId && !row.signedOff && row.status !== 'overpaid' ? (
            <button
              type="button"
              onClick={() => handleSignOff(row)}
              disabled={pendingAction}
              className="rounded-full bg-[#1c1a17] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
            >
              Sign off received payment
            </button>
          ) : null}
          {row.status === 'overpaid' && row.referenceId && row.depositSplit ? (
            <button
              type="button"
              onClick={() => handleAcceptSplit(row.referenceId as string)}
              disabled={pendingAction}
              className="rounded-full bg-[#b45309] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
            >
              {row.depositSplit.surplusAmount > 0.001 ? 'Accept split + hold credit' : 'Accept split'}
            </button>
          ) : null}
          {row.signedOff && row.referenceId ? (
            <button
              type="button"
              onClick={() => handleReverse(row.referenceId as string)}
              disabled={pendingAction}
              className="rounded-full border border-[#e7e3d6] bg-white px-[18px] py-2.5 text-[13px] font-semibold text-[#57534e] disabled:cursor-wait"
            >
              Reverse sign-off
            </button>
          ) : null}
        </div>

        <div className="mt-4">{renderCreditSection(row)}</div>

        {showCandidates ? (
          <div className="mt-[18px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#a39d8d]">Candidate references</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {rowCandidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e7e3d6] px-3.5 py-3 text-center text-[12.5px] text-[#a39d8d]">
                  No unmatched references for this property yet.
                </div>
              ) : (
                rowCandidates.map(({ reference, score }) => (
                  <div
                    key={reference.id}
                    className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#e7e3d6] bg-white px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#1c1a17]">{reference.reference}</p>
                      <p className="mt-0.5 text-[11.5px] text-[#8a8578]">
                        {reference.payerName ?? 'Unknown payer'} · {formatTxnDate(reference.transactionDate)} · R {formatRand(reference.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-[9px] py-0.5 text-[10.5px] font-bold ${score >= 90 ? 'bg-[#1c1a17] text-white' : 'bg-[#f1efe9] text-[#78716c]'}`}>
                        {score >= 90 ? 'strong' : score >= 45 ? 'likely' : 'manual'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMatch(reference.id, row.unitId)}
                        disabled={pendingAction}
                        className="rounded-[10px] bg-[#1c1a17] px-3.5 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:bg-[#78716c]"
                      >
                        Match
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="hamba-dashboard min-h-screen text-[#1c1a17]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <MonthlyPaymentsNavigation
          active="units"
          operationsHref={`${base}?period=${table.periodKey}`}
          referencePoolHref={`/monthly-payments/reference-pool?period=${table.periodKey}`}
          importAuditHref={`/monthly-payments/import-audit?period=${table.periodKey}`}
        />

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[960px]">
            <nav className="text-[13px] text-[#8a8578]">
              <Link href="/monthly-payments" className="hover:text-[#292524]">
                {table.organizationLabel}
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <Link href="/monthly-payments/locations" className="hover:text-[#292524]">
                locations
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span>{table.propertyName}</span>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span className="font-semibold text-[#292524]">Units</span>
            </nav>

            <div className="mt-2.5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="m-0 text-[30px] font-bold tracking-normal text-[#1c1a17]">
                  {table.propertyName} units
                </h1>
                <p className="mt-1.5 text-[13.5px] text-[#8a8578]">Billing window {table.billingWindowLabel}</p>
                {table.activityHint ? <p className="mt-1 text-[13px] text-[#a39d8d]">{table.activityHint}</p> : null}
                {errorMessage ? <p className="mt-2 text-[13px] font-semibold text-[#b91c1c]">{errorMessage}</p> : null}
                {noticeMessage ? <p className="mt-2 text-[13px] font-semibold text-[#0369a1]">{noticeMessage}</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center overflow-hidden rounded-full border border-[#e7e3d6] bg-white">
                  <Link href={`${base}?period=${shiftPeriod(table.periodKey, -1)}`} className="px-3 py-2 text-sm text-[#57534e]" aria-label="Previous month">
                    ‹
                  </Link>
                  <span className="min-w-[88px] px-2.5 py-2 text-center text-[13.5px] font-semibold text-[#1c1a17]">
                    {table.periodLabel}
                  </span>
                  <Link href={`${base}?period=${shiftPeriod(table.periodKey, 1)}`} className="px-3 py-2 text-sm text-[#57534e]" aria-label="Next month">
                    ›
                  </Link>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[#e7e3d6] bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#292524]"
                >
                  Filter
                </button>
                <button
                  type="button"
                  onClick={handleAutoMatch}
                  disabled={pendingAction}
                  className="rounded-full bg-[#0369a1] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
                >
                  Auto-match refs
                </button>
              </div>
            </div>

            <div className="mt-5 grid overflow-hidden rounded-2xl border border-[#e7e3d6] bg-white sm:grid-cols-5">
              <UnitStat label="Collected / exp." value={`R ${formatRand(table.totals.collected)}`} subValue={`/ ${formatRand(table.totals.expected)}`} />
              <UnitStat label="Paid" value={String(table.totals.paidCount)} valueClassName="text-[#0f7b53]" />
              <UnitStat label="Sign-off" value={String(table.totals.pendingCount)} valueClassName="text-[#0369a1]" />
              <UnitStat label="Due" value={String(table.totals.dueCount)} valueClassName="text-[#b45309]" />
              <UnitStat label="Overdue" value={String(table.totals.overdueCount)} valueClassName="text-[#b91c1c]" isLast />
            </div>

            <section className="mt-5 overflow-hidden rounded-[20px] border border-[#e7e3d6] bg-white">
              {rows.length === 0 ? (
                <div className="px-5 py-10 text-[13.5px] text-[#8a8578]">
                  {isMissingTables
                    ? 'Payments tables are not available in the connected database yet.'
                    : table.referencePool.length > 0
                      ? 'No unit rows are set up yet, but imported bank references already exist for this month.'
                      : 'No units are set up for this property yet.'}
                </div>
              ) : (
                rows.map((row, index) => {
                  const meta = STATUS_META[row.status];
                  const expanded = selectedUnitId === row.unitId;
                  return (
                    <article
                      key={row.unitId}
                      className={`${index > 0 ? 'border-t border-[#f0ece0]' : ''} ${expanded ? 'bg-[#fbfaf6]' : 'bg-white'}`}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setDrawerNotice(null);
                          setSelectedUnitId(expanded ? null : row.unitId);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setDrawerNotice(null);
                            setSelectedUnitId(expanded ? null : row.unitId);
                          }
                        }}
                        className="grid cursor-pointer grid-cols-[5px_minmax(150px,1.5fr)_minmax(120px,1.2fr)_minmax(130px,1.1fr)_minmax(135px,0.85fr)_20px] items-center gap-3.5 px-[18px] py-3.5 max-lg:grid-cols-[5px_1fr_20px] max-lg:gap-3"
                      >
                        <span className="block h-[30px] w-[5px] rounded-[3px]" style={{ background: meta.fg }} />
                        <div className="min-w-0">
                          <h2 className="text-[14.5px] font-bold text-[#1c1a17]">{row.label}</h2>
                          <p className="mt-0.5 truncate text-xs text-[#a39d8d]">
                            {unitOccupancySummary(row)}
                          </p>
                        </div>
                        <div className="min-w-0 max-lg:hidden" onClick={(event) => event.stopPropagation()}>
                          {renderReference(row)}
                          {row.transactionDate ? <p className="mt-0.5 text-[10.5px] text-[#a39d8d]">{formatTxnDate(row.transactionDate)}</p> : null}
                        </div>
                        <div className="whitespace-nowrap text-[13.5px] font-semibold text-[#292524] max-lg:hidden">
                          {row.receivedAmount !== null ? `R ${formatRand(row.receivedAmount)}` : 'R -'}
                          <span className="text-xs font-medium text-[#a39d8d]"> / {formatRand(row.expectedAmount)}</span>
                        </div>
                        <div className="max-lg:hidden">
                          <span
                            className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
                            style={{ background: meta.bg, color: meta.fg }}
                          >
                            {statusLabel(row)}
                          </span>
                        </div>
                        <span className={`text-center text-[15px] text-[#a39d8d] transition ${expanded ? 'rotate-180' : ''}`}>⌄</span>
                      </div>

                      {expanded ? renderInlineDetail(row) : null}
                    </article>
                  );
                })
              )}
            </section>

            <div className="mt-4 flex flex-col gap-2 text-[13px] text-[#8a8578] sm:flex-row sm:items-center sm:justify-between">
              <p>
                {table.totals.unitCount} units · {table.totals.blockedCount} blocked · subtotal{' '}
                <span className="font-semibold text-[#292524]">R {formatRand(table.totals.collected)}</span> / {formatRand(table.totals.expected)} exp.
              </p>
              <p>{table.totals.unmatchedCount} unmatched · R {formatRand(table.totals.unmatchedAmount)}</p>
            </div>

            <section className="mt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#a39d8d]">Reference pool</p>
                  <p className="mt-1 text-[13px] text-[#8a8578]">
                    Imported unmatched deposits for {table.periodLabel} ({table.billingWindowLabel}).
                  </p>
                </div>
                <p className="text-[13px] font-semibold text-[#57534e]">
                  {table.referencePool.length} unmatched · R {formatRand(referencePoolTotal)}
                </p>
              </div>
              <div className="mt-3 overflow-hidden rounded-[20px] border border-[#e7e3d6] bg-white">
                {table.referencePool.length === 0 ? (
                  <div className="px-5 py-8 text-[13.5px] text-[#8a8578]">No unmatched deposits for this month.</div>
                ) : (
                  table.referencePool.map((reference, index) => (
                    <div
                      key={reference.id}
                      className={`grid grid-cols-[1.45fr_1.1fr_0.8fr_0.8fr_0.9fr] items-center gap-2.5 px-3.5 py-2.5 text-[13px] max-md:grid-cols-1 ${
                        index > 0 ? 'border-t border-[#f0ece0]' : ''
                      }`}
                    >
                      <span className="font-semibold text-[#292524]">{reference.reference}</span>
                      <span className="text-[#6f6a5e]">{reference.payerName ?? '-'}</span>
                      <span className="text-[#6f6a5e]">{reference.accountSuffix ? `••${reference.accountSuffix}` : '-'}</span>
                      <span className="text-[#6f6a5e]">{formatTxnDate(reference.transactionDate)}</span>
                      <span className="font-semibold text-[#292524]">R {formatRand(reference.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function UnitStat({
  label,
  value,
  subValue,
  valueClassName = 'text-[#1c1a17]',
  isLast = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
  isLast?: boolean;
}) {
  return (
    <div className={`border-b border-[#e7e3d6] px-4 py-3.5 sm:border-b-0 ${isLast ? '' : 'sm:border-r'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39d8d]">{label}</p>
      <p className={`mt-1 text-base font-bold ${valueClassName}`}>
        {value}
        {subValue ? <span className="text-xs font-medium text-[#a39d8d]"> {subValue}</span> : null}
      </p>
    </div>
  );
}
