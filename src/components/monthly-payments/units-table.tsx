'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, TriangleAlert, X } from 'lucide-react';
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

function matchRuleLabel(rule: UnitTableRow['matchRules'][number]): string {
  const value = rule.matcherType === 'amount_equals' && rule.amountValue !== null
    ? `R ${formatRand(rule.amountValue)}`
    : rule.matcherValue;
  switch (rule.matcherType) {
    case 'reference_equals':
      return `Reference equals "${value}"`;
    case 'reference_contains':
      return `Reference contains "${value}"`;
    case 'reference_regex':
      return `Reference pattern "${value}"`;
    case 'payer_name_contains':
      return `Payer contains "${value}"`;
    case 'amount_equals':
      return `Amount equals ${value}`;
    default:
      return value;
  }
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

async function postReferenceAction<T = unknown>(body: Record<string, string | number | undefined>): Promise<T | undefined> {
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
  // FR-2.7b: pending "Add this reference to the unit's known references?" prompt
  // after a sign-off the unit's rules would not have auto-matched. Owner
  // ruling: always a question, never automatic.
  const [rulePrompt, setRulePrompt] = useState<{
    unitId: string;
    referenceId: string;
    referenceText: string;
    unitLabel: string;
  } | null>(null);
  const [periodMovePrompt, setPeriodMovePrompt] = useState<{
    unitId: string;
    referenceId: string;
    referenceText: string;
    amount: number;
    sourcePeriodKey: string;
    targetPeriodKey: string;
    reason: string;
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

  function handleMoveToDeposit(row: UnitTableRow) {
    const referenceId = row.referenceId;
    if (!referenceId) return;
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'move_to_deposit',
          paymentReferenceId: referenceId,
        });
        setSelectedUnitId(row.unitId);
        setDrawerNotice(`Moved "${row.reference ?? 'reference'}" to this room's deposit ledger`);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to move payment to deposit');
      }
    });
  }

  function handleMoveReferenceToNextPeriod(prompt: NonNullable<typeof periodMovePrompt>) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'reassign_period',
          paymentReferenceId: prompt.referenceId,
          targetPeriodKey: prompt.targetPeriodKey,
          reason: prompt.reason.trim() || 'Early rent payment reassigned by operator',
        });
        setSelectedUnitId(prompt.unitId);
        setDrawerNotice(
          `Moved the full R ${formatRand(prompt.amount)} payment from ${formatPeriodMonth(
            `${prompt.sourcePeriodKey}-01`
          )} to ${formatPeriodMonth(`${prompt.targetPeriodKey}-01`)}. Bank date unchanged.`
        );
        setPeriodMovePrompt(null);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to move payment to next month');
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
            ? `Known reference saved — "${prompt.referenceText}" will auto-match ${prompt.unitLabel} next month`
            : `Already covered — ${prompt.unitLabel} already has a known reference that matches this`
        );
        setRulePrompt(null);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to add reference rule');
      }
    });
  }

  function handleRemoveKnownReferenceHint(unitId: string, keyword: string) {
    startTransition(async () => {
      try {
        const data = await postReferenceAction<{ removed: boolean; alreadyRemoved: boolean }>({
          action: 'remove_match_keyword',
          unitId,
          matchKeyword: keyword,
        });
        setSelectedUnitId(unitId);
        setDrawerNotice(
          data?.removed
            ? `Removed known reference hint "${keyword}"`
            : `Known reference hint "${keyword}" was already removed`
        );
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to remove known reference hint');
      }
    });
  }

  function handleRemoveKnownReferenceRule(unitId: string, rule: UnitTableRow['matchRules'][number]) {
    startTransition(async () => {
      try {
        const data = await postReferenceAction<{ removed: boolean; alreadyRemoved: boolean }>({
          action: 'remove_match_rule',
          unitId,
          ruleId: rule.id,
        });
        setSelectedUnitId(unitId);
        setDrawerNotice(
          data?.removed
            ? `Removed known reference "${matchRuleLabel(rule)}"`
            : `Known reference "${matchRuleLabel(rule)}" was already removed`
        );
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to remove known reference');
      }
    });
  }

  function handleReleaseReference(referenceId: string, unitId: string, referenceText: string) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'reverse_sign_off',
          paymentReferenceId: referenceId,
        });
        setSelectedUnitId(unitId);
        setDrawerNotice(`Released "${referenceText}" back to the reference pool`);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to release reference');
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

  function handleResolveOverpayment(input: {
    row: UnitTableRow;
    destination: 'current' | 'arrears' | 'advance' | 'deposit';
    targetPeriodId?: string;
    amount: number;
    label: string;
  }) {
    const unitPaymentPeriodId = input.row.periodId;
    if (!unitPaymentPeriodId) return;
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'resolve_overpayment',
          unitPaymentPeriodId,
          destination: input.destination,
          selectedPeriodKey: table.periodKey,
          targetPeriodId: input.targetPeriodId,
          amount: input.amount,
        });
        setDrawerNotice(`Assigned R ${formatRand(input.amount)} extra → ${input.label}`);
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to assign the extra payment');
      }
    });
  }

  // FR-2.8 (owner rulings 2026-07-03): allocate held credit — explicit click
  // only, never automatic. Destinations come from row.creditOptions.
  function handleAllocateCredit(input: {
    unitId: string;
    destination: 'current' | 'arrears' | 'advance' | 'deposit';
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
    type CreditSource = UnitTableRow['heldCreditSources'][number];
    const sourcePaymentTotal = (source: { sourcePaymentAmount: number | null; amount: number }) =>
      source.sourcePaymentAmount !== null
        ? `source payment R ${formatRand(source.sourcePaymentAmount)}`
        : `credit R ${formatRand(source.amount)}`;
    const sourceLabel = (allocation: UnitTableRow['creditAllocations'][number]) => {
      if (allocation.sourcePayments.length === 0) return 'Source payment not linked';
      if (allocation.sourcePayments.length === 1) {
        const source = allocation.sourcePayments[0];
        return `From ${formatTxnDate(source.transactionDate)} · ${source.reference} · ${sourcePaymentTotal(source)} · credit R ${formatRand(source.amount)}`;
      }
      const dates = Array.from(new Set(allocation.sourcePayments.map((source) => formatTxnDate(source.transactionDate))));
      return `From ${allocation.sourcePayments.length} payments · ${dates.join(', ')} · credit R ${formatRand(
        allocation.sourcePayments.reduce((sum, source) => sum + source.amount, 0),
      )}`;
    };
    const currentPeriodHeldSources: CreditSource[] = [];
    let remainingCurrentHeld = row.creditBalance;
    for (const payment of row.recentPayments) {
      if (remainingCurrentHeld <= 0.001) break;
      if (payment.periodStart?.slice(0, 7) !== table.periodKey || payment.creditAmount <= 0.001) continue;
      const heldAmount = Math.min(payment.creditAmount, remainingCurrentHeld);
      currentPeriodHeldSources.push({
        referenceId: payment.id,
        reference: payment.reference,
        transactionDate: payment.transactionDate,
        amount: heldAmount,
        sourcePaymentAmount: payment.amount,
      });
      remainingCurrentHeld = Math.max(0, remainingCurrentHeld - heldAmount);
    }
    const visibleHeldSources =
      currentPeriodHeldSources.length > 0
        ? currentPeriodHeldSources
        : row.heldCreditSources;
    const heldSourceRows =
      visibleHeldSources.length > 0 ? (
        <div className="mt-2 rounded-2xl border border-violet-100 bg-white/70 px-3 py-2">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-violet-700">Held from</p>
          <div className="mt-1 space-y-1">
            {visibleHeldSources.map((source, index) => (
              <p key={`${source.referenceId ?? source.reference}-${index}`} className="text-[11.5px] font-semibold text-violet-900">
                {formatTxnDate(source.transactionDate)} · {source.reference} · {sourcePaymentTotal(source)} · held R {formatRand(source.amount)}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[11.5px] font-semibold text-violet-700/70">Held source payment not linked</p>
      );
    const allocationRows = row.creditAllocations.length > 0 ? (
      <div className="space-y-1.5">
        {row.creditAllocations.map((allocation) => (
          <div key={allocation.id} className="flex items-center justify-between gap-2 text-[12px] text-violet-900">
            <span className="min-w-0">
              <span className="block font-semibold">
                R {formatRand(allocation.amount)} → {allocation.destination === 'deposit' ? 'deposit' : formatPeriodMonth(allocation.targetPeriodStart)}
                {allocation.destination === 'advance'
                  ? ' (advance)'
                  : allocation.destination === 'arrears'
                    ? ' (arrears)'
                    : allocation.destination === 'current'
                      ? ' (absorbed)'
                      : ''}
              </span>
              <span className="block text-[11px] text-violet-700/70">
                {sourceLabel(allocation)}
              </span>
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
    ) : null;

    if (row.creditBalance <= 0.001) {
      return (
        <div className="rounded-2xl border border-violet-100 bg-white px-3.5 py-2.5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-violet-700">Allocation history</p>
          <div className="mt-1.5">{allocationRows}</div>
        </div>
      );
    }

    return (
      <div className="rounded-[20px] border border-violet-200 bg-violet-50/60 p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-violet-700">Held credit</p>
        <p className="mt-1 text-lg font-semibold text-violet-900">R {formatRand(row.creditBalance)}</p>
        {heldSourceRows}
        {options ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-violet-800">Allocate to:</p>
            <button
              type="button"
              disabled={pendingAction}
              onClick={() =>
                handleAllocateCredit({
                  unitId: row.unitId,
                  destination: 'current',
                  amount: options.current.maxAmount,
                  label: `${formatPeriodMonth(options.current.periodStart)} rent`,
                })
              }
              className="flex w-full items-center justify-between rounded-xl border border-violet-300 bg-white px-3 py-2 text-left text-[0.82rem] font-semibold text-violet-900 hover:border-violet-500 disabled:cursor-wait disabled:text-stone-400"
            >
              <span>{formatPeriodMonth(options.current.periodStart)} rent (absorb here)</span>
              <span className="text-violet-700">allocate R {formatRand(options.current.maxAmount)}</span>
            </button>
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
              Nothing moves without your click. Previous-month options only appear where rent is still short.
            </p>
          </div>
        ) : null}
        {row.creditAllocations.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-semibold text-violet-800">Allocated:</p>
            {allocationRows}
          </div>
        ) : null}
      </div>
    );
  }

  function renderOverpaymentDecision(row: UnitTableRow) {
    const options = row.overpaymentOptions;
    if (!options || !row.periodId) return null;
    const extraAmount = options.creditBalance;

    const optionClass =
      'group rounded-2xl border border-amber-200 bg-white p-3 text-left transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60';

    return (
      <section className="mt-4 rounded-[20px] border border-amber-300 bg-amber-50/70 p-4" aria-labelledby={`allocation-${row.unitId}`}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-amber-700">Allocation needed</p>
        <h3 id={`allocation-${row.unitId}`} className="mt-1 text-[15px] font-bold text-amber-950">
          Where should R {formatRand(extraAmount)} go?
        </h3>
        <p className="mt-1 text-[12.5px] text-amber-900/80">
          {row.expectedAmount > 0
            ? `Rent of R ${formatRand(row.expectedAmount)} is covered. Choose the reason for the extra amount before sign-off.`
            : 'No rent is due on this unit for the selected month. Choose where to allocate the matched payment before sign-off.'}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={pendingAction}
            onClick={() =>
              handleResolveOverpayment({
                row,
                destination: 'current',
                amount: options.current.maxAmount,
                label: `${formatPeriodMonth(options.current.periodStart)} rent`,
              })
            }
            className={optionClass}
          >
            <span className="block text-[13px] font-bold text-[#1c1a17]">This month&apos;s rent</span>
            <span className="mt-0.5 block text-[11.5px] text-[#6f6a5e]">Absorb R {formatRand(options.current.maxAmount)} into {formatPeriodMonth(options.current.periodStart)}.</span>
          </button>

          {options.arrears.map((arrear) => (
            <button
              key={arrear.periodId}
              type="button"
              disabled={pendingAction}
              onClick={() =>
                handleResolveOverpayment({
                  row,
                  destination: 'arrears',
                  targetPeriodId: arrear.periodId,
                  amount: arrear.maxAmount,
                  label: `${formatPeriodMonth(arrear.periodStart)} arrears`,
                })
              }
              className={optionClass}
            >
              <span className="block text-[13px] font-bold text-[#1c1a17]">Previous month · {formatPeriodMonth(arrear.periodStart)}</span>
              <span className="mt-0.5 block text-[11.5px] text-[#6f6a5e]">Assign R {formatRand(arrear.maxAmount)} to the R {formatRand(arrear.outstandingAmount)} shortfall.</span>
            </button>
          ))}

          <button
            type="button"
            disabled={pendingAction}
            onClick={() =>
              handleResolveOverpayment({
                row,
                destination: 'advance',
                amount: options.advance.maxAmount,
                label: `${formatPeriodMonth(options.advance.periodStart)} rent`,
              })
            }
            className={optionClass}
          >
            <span className="block text-[13px] font-bold text-[#1c1a17]">Next month&apos;s rent</span>
            <span className="mt-0.5 block text-[11.5px] text-[#6f6a5e]">Carry R {formatRand(options.advance.maxAmount)} into {formatPeriodMonth(options.advance.periodStart)}.</span>
          </button>

          {options.deposit ? (
            <button
              type="button"
              disabled={pendingAction}
              onClick={() =>
                handleResolveOverpayment({
                  row,
                  destination: 'deposit',
                  amount: options.deposit ? options.deposit.maxAmount : 0,
                  label: 'deposit',
                })
              }
              className={optionClass}
            >
              <span className="block text-[13px] font-bold text-[#1c1a17]">Deposit</span>
              <span className="mt-0.5 block text-[11.5px] text-[#6f6a5e]">
                Add R {formatRand(options.deposit.maxAmount)} to the deposit balance
                {options.deposit.maxAmount < extraAmount ? '; the remainder stays held' : ''}.
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-3">
              <span className="block text-[13px] font-bold text-stone-500">Deposit fully funded</span>
              <span className="mt-0.5 block text-[11.5px] text-stone-500">No deposit headroom remains for this room.</span>
            </div>
          )}
        </div>

        {options.arrears.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-amber-800">No previous month within the last three months is short, so no arrears option is shown.</p>
        ) : null}
      </section>
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

  function renderMoneySignals(row: UnitTableRow) {
    const hasDeposit = row.depositAmount > 0 || row.depositBalance > 0.001 || row.depositContributedAmount > 0.001;
    const hasCredit = row.creditBalance > 0.001 || row.creditAppliedAmount > 0.001 || row.creditFromMatchedReferencesAmount > 0.001 || row.creditAllocations.length > 0;
    if (!hasDeposit && !hasCredit) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {hasDeposit ? (
          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">
            Deposit R {formatRand(row.depositBalance)}
            {row.depositAmount > 0 ? ` / ${formatRand(row.depositAmount)}` : ''}
          </span>
        ) : null}
        {row.creditBalance > 0.001 ? (
          <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10.5px] font-bold text-violet-900">
            Held credit R {formatRand(row.creditBalance)}
          </span>
        ) : null}
        {row.creditAppliedAmount > 0.001 ? (
          <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-800">
            Credit applied R {formatRand(row.creditAppliedAmount)}
          </span>
        ) : null}
      </div>
    );
  }

  function rentCoverageAmount(row: UnitTableRow) {
    if (row.receivedAmount === null) return null;
    return Math.max(
      0,
      Math.round(
        (row.receivedAmount - row.depositContributedAmount - row.creditFromMatchedReferencesAmount + row.creditAppliedAmount) *
          100
      ) / 100
    );
  }

  function renderUnitLedger(row: UnitTableRow) {
    const depositRemaining = Math.max(0, row.depositAmount - row.depositBalance);
    const rentCoverage = rentCoverageAmount(row);
    const showHeldCreditCard = row.creditBalance > 0.001;
    const showCreditAppliedCard = row.creditAppliedAmount > 0.001;
    const ledgerColumns =
      showHeldCreditCard && showCreditAppliedCard
        ? 'md:grid-cols-4'
        : showHeldCreditCard || showCreditAppliedCard
          ? 'md:grid-cols-3'
          : 'md:grid-cols-2';
    return (
      <div className={`mt-4 grid gap-2.5 ${ledgerColumns}`}>
        <div className="rounded-2xl border border-[#e7e3d6] bg-white px-3.5 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#a39d8d]">Rent coverage</p>
          <p className="mt-1 text-[16px] font-bold text-[#1c1a17]">
            R {formatRand(rentCoverage ?? 0)}
            <span className="text-[12px] font-medium text-[#a39d8d]"> / {formatRand(row.expectedAmount)}</span>
          </p>
          <p className="mt-0.5 text-[11.5px] text-[#6f6a5e]">
            {row.outstandingAmount && row.outstandingAmount > 0.001
              ? `Still short R ${formatRand(row.outstandingAmount)}`
              : rentCoverage !== null
                ? 'Rent coverage visible for this period'
                : 'No bank reference matched yet'}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-emerald-700">Deposit ledger</p>
          <p className="mt-1 text-[16px] font-bold text-emerald-950">
            R {formatRand(row.depositBalance)}
            {row.depositAmount > 0 ? <span className="text-[12px] font-medium text-emerald-700"> / {formatRand(row.depositAmount)}</span> : null}
          </p>
          <p className="mt-0.5 text-[11.5px] text-emerald-800">
            {row.depositAmount > 0
              ? depositRemaining > 0.001
                ? `R ${formatRand(depositRemaining)} headroom remains`
                : 'Deposit target funded'
              : 'No deposit target on this room'}
          </p>
        </div>

        {showHeldCreditCard ? (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-3.5 py-3">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-violet-700">Held credit</p>
            <p className="mt-1 text-[16px] font-bold text-violet-950">R {formatRand(row.creditBalance)}</p>
            <p className="mt-0.5 text-[11.5px] text-violet-800">Waiting for operator allocation</p>
          </div>
        ) : null}

        {showCreditAppliedCard ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3.5 py-3">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-sky-700">Credit applied</p>
            <p className="mt-1 text-[16px] font-bold text-sky-950">R {formatRand(row.creditAppliedAmount)}</p>
            <p className="mt-0.5 text-[11.5px] text-sky-800">Counts toward this period</p>
          </div>
        ) : null}
      </div>
    );
  }

  function renderDepositLifecycle(row: UnitTableRow) {
    const lifecycle = row.depositLifecycle;
    const isScoped = lifecycle.mode === 'occupancy';
    const statusLabel = lifecycle.status
      ? lifecycle.status === 'holding'
        ? 'holding deposit'
        : lifecycle.status === 'notice'
          ? 'notice period'
          : lifecycle.status === 'active'
            ? 'active tenant version'
            : 'ended tenant version'
      : 'no tenant version';
    const dateBits = [lifecycle.startsOn ? `billing from ${formatTxnDate(lifecycle.startsOn)}` : null, lifecycle.endsOn ? `ended ${formatTxnDate(lifecycle.endsOn)}` : null]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-emerald-700">Deposit version</p>
            <p className="mt-1 text-[13px] font-semibold text-emerald-950">
              {isScoped ? statusLabel : 'Legacy room-level ledger'}
            </p>
            <p className="mt-0.5 text-[12px] text-emerald-900/80">
              {isScoped
                ? lifecycle.occupancyId
                  ? `This deposit balance is assigned to this tenant version${dateBits ? ` (${dateBits})` : ''}; it does not decide whether the room is occupied.`
                  : 'No tenant version is open, so old tenant deposits stay out of this room balance.'
                : 'Apply the occupancy migration to separate old tenant deposits from the next tenant.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800">
              R {formatRand(lifecycle.depositBalance)} / {formatRand(lifecycle.depositTargetAmount)}
            </span>
            {isScoped ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                {lifecycle.previousOccupancyCount} previous
              </span>
            ) : null}
          </div>
        </div>
        {lifecycle.previousOccupancies.length > 0 ? (
          <div className="mt-3 divide-y divide-emerald-100 rounded-xl bg-white/70 px-3">
            {lifecycle.previousOccupancies.map((occupancy) => (
              <div key={occupancy.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-bold text-emerald-950">
                    Previous stay · {occupancy.status}
                  </p>
                  <p className="text-[11.5px] text-emerald-900/75">
                    {[occupancy.startsOn ? `billing from ${formatTxnDate(occupancy.startsOn)}` : null, occupancy.endsOn ? `ended ${formatTxnDate(occupancy.endsOn)}` : null, occupancy.closedAt ? `closed ${formatTxnDate(occupancy.closedAt)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Dates not captured'}
                  </p>
                </div>
                <span className="self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                  R {formatRand(occupancy.depositBalance)} / {formatRand(occupancy.depositTargetAmount)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderRecentPayments(row: UnitTableRow) {
    return (
      <div className="mt-4 rounded-2xl border border-[#e7e3d6] bg-white p-3.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#78716c]">Recent payments</p>
            <p className="mt-1 text-[12px] text-[#6f6a5e]">Matched bank references from this room&apos;s last three billing months.</p>
          </div>
          <span className="self-start rounded-full bg-[#f1efe9] px-2.5 py-1 text-[11px] font-bold text-[#57534e]">
            {row.recentPayments.length} payment{row.recentPayments.length === 1 ? '' : 's'}
          </span>
        </div>

        {row.recentPayments.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[#e7e3d6] px-3.5 py-3 text-center text-[12.5px] text-[#a39d8d]">
            No matched payments for this room in the last three billing months.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-[#f0ece0]">
            {row.recentPayments.map((payment) => {
              const hasDeposit = payment.depositAmount > 0.001;
              const hasCredit = payment.creditAmount > 0.001;
              const hasRent = payment.rentAmount > 0.001;
              return (
                <div key={payment.id} className="grid gap-2 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <p className="text-[12px] font-bold text-[#292524]">{formatPeriodMonth(payment.periodStart)}</p>
                    <p className="text-[11px] text-[#8a8578]">{formatTxnDate(payment.transactionDate)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-[13px] font-semibold text-[#1c1a17]">{payment.reference}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#6f6a5e]">
                      <span>{payment.payerName ?? 'Unknown payer'}</span>
                      <span>{payment.accountSuffix ? `••${payment.accountSuffix}` : 'Account not supplied'}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {hasRent ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-stone-700">
                          Rent R {formatRand(payment.rentAmount)}
                        </span>
                      ) : null}
                      {hasDeposit ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                          Deposit R {formatRand(payment.depositAmount)}
                        </span>
                      ) : null}
                      {hasCredit ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-bold text-violet-700">
                          Held R {formatRand(payment.creditAmount)}
                        </span>
                      ) : null}
                      {!hasRent && !hasDeposit && !hasCredit ? (
                        <span className="rounded-full bg-[#f1efe9] px-2 py-0.5 text-[10.5px] font-bold text-[#78716c]">
                          Unallocated
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                          payment.signedOff ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                        }`}
                      >
                        {payment.signedOff ? 'Signed off' : 'Awaiting sign-off'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[13px] font-bold text-[#1c1a17] sm:text-right">R {formatRand(payment.amount)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderReferenceRules(row: UnitTableRow) {
    const activeRules = row.matchRules.filter((rule) => rule.isActive);
    const keywordRules = row.matchKeywords.filter(Boolean);
    const hasRules = row.expectedReference || keywordRules.length > 0 || activeRules.length > 0;
    if (!hasRules) return null;
    return (
      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-indigo-700">Known reference bindings</p>
            <p className="mt-1 text-[12px] text-indigo-900/80">
              These are the values used to keep stubborn or changed tenant references tied to this unit.
            </p>
          </div>
          {activeRules.length > 0 ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-800">
              {activeRules.length} active rule{activeRules.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.expectedReference ? (
            <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-[12px] font-semibold text-indigo-950">
              Expected: {row.expectedReference}
            </span>
          ) : null}
          {keywordRules.map((keyword) => (
            <span
              key={`keyword-${keyword}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-[12px] font-semibold text-indigo-900"
            >
              Hint: {keyword}
              <button
                type="button"
                onClick={() => handleRemoveKnownReferenceHint(row.unitId, keyword)}
                disabled={pendingAction}
                className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900 disabled:cursor-wait disabled:opacity-40"
                aria-label={`Delete known reference hint ${keyword}`}
                title="Delete known reference hint"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {activeRules.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-[12px] font-semibold text-indigo-900"
            >
              {matchRuleLabel(rule)}
              <button
                type="button"
                onClick={() => handleRemoveKnownReferenceRule(row.unitId, rule)}
                disabled={pendingAction}
                className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900 disabled:cursor-wait disabled:opacity-40"
                aria-label={`Delete known reference ${matchRuleLabel(rule)}`}
                title="Delete known reference"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
    );
  }

  function renderInlineDetail(row: UnitTableRow) {
    const rowCandidates = sortReferencesForUnit(row, table.referencePool);
    const hasActiveCreditAllocations = row.creditAllocations.length > 0;
    const releaseGuardMessage = hasActiveCreditAllocations
      ? 'Reverse the allocation rows below before releasing this bank reference.'
      : null;
    const depositHeadroom = Math.max(0, row.depositAmount - row.depositBalance);
    const rentCoverage = rentCoverageAmount(row);
    const canMovePrimaryReferenceToDeposit =
      Boolean(row.referenceId) &&
      !row.signedOff &&
      row.receivedAmount !== null &&
      row.receivedAmount > 0.001 &&
      !hasActiveCreditAllocations &&
      depositHeadroom >= row.receivedAmount - 0.001 &&
      row.depositContributedAmount <= 0.001 &&
      row.creditFromMatchedReferencesAmount <= 0.001;
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
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#a39d8d]">Rent coverage</p>
            <p className="mt-1 text-[13px] text-[#292524]">
              {rentCoverage !== null ? `R ${formatRand(rentCoverage)}` : '-'}
              {row.status === 'partial' && row.outstandingAmount !== null ? (
                <span className="font-semibold text-[#b45309]"> · {formatRand(row.outstandingAmount)} outstanding</span>
              ) : null}
              {row.status === 'overpaid' && row.depositSplit ? (
                <span className="font-semibold text-[#b45309]">
                  {' '}· rent covered + R {formatRand(row.depositSplit.depositPortion + row.depositSplit.surplusAmount)} extra to assign
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

        {renderUnitLedger(row)}

        {renderDepositLifecycle(row)}

        {renderRecentPayments(row)}

        {row.matchedReferences.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-sky-700">
              Incoming bank {row.matchedReferences.length === 1 ? 'reference' : `references · ${row.matchedReferences.length}`}
            </p>
            <div className="mt-2 space-y-2">
              {row.matchedReferences.map((reference) => (
                <div key={reference.id} className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="break-words text-[14px] font-bold text-sky-950">{reference.reference}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() =>
                          setPeriodMovePrompt({
                            unitId: row.unitId,
                            referenceId: reference.id,
                            referenceText: reference.reference,
                            amount: reference.amount,
                            sourcePeriodKey: table.periodKey,
                            targetPeriodKey: shiftPeriod(table.periodKey, 1),
                            reason: 'Tenant paid early; apply this rent payment to the next billing period.',
                          })
                        }
                        className="self-start rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11.5px] font-semibold text-violet-800 transition hover:border-violet-500 disabled:cursor-wait disabled:text-stone-400"
                      >
                        Move to next month
                      </button>
                      <button
                        type="button"
                        disabled={pendingAction || hasActiveCreditAllocations}
                        onClick={() => handleReleaseReference(reference.id, row.unitId, reference.reference)}
                        title={hasActiveCreditAllocations ? 'Reverse allocation rows below before releasing this reference' : 'Release reference to pool'}
                        className={`self-start rounded-full border border-sky-200 bg-white px-3 py-1 text-[11.5px] font-semibold transition hover:border-sky-500 disabled:text-stone-400 ${
                          hasActiveCreditAllocations ? 'cursor-not-allowed text-stone-400' : pendingAction ? 'cursor-wait text-stone-400' : 'text-sky-800'
                        }`}
                      >
                        {hasActiveCreditAllocations ? 'Reverse allocations below first' : reference.signedOff ? 'Reverse & release' : 'Release to pool'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-sky-900/80">
                    <span>Payer: {reference.payerName ?? 'not supplied'}</span>
                    <span>Account: {reference.accountSuffix ? `••${reference.accountSuffix}` : 'not supplied'}</span>
                    <span>Date: {formatTxnDate(reference.transactionDate)}</span>
                    <span>Amount: R {formatRand(reference.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
            {row.matchedReferences.length > 1 ? (
              <p className="mt-2 text-[12px] font-semibold text-sky-950">Combined received: R {formatRand(row.receivedAmount ?? 0)}</p>
            ) : null}
            {releaseGuardMessage ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                {releaseGuardMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        {periodMovePrompt && periodMovePrompt.unitId === row.unitId ? (
          <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-violet-700">
              Confirm rent-period move
            </p>
            <p className="mt-1 text-[13.5px] font-bold text-violet-950">
              Move the full R {formatRand(periodMovePrompt.amount)} payment to{' '}
              {formatPeriodMonth(`${periodMovePrompt.targetPeriodKey}-01`)}?
            </p>
            <p className="mt-1 text-[12px] leading-5 text-violet-900/80">
              The bank transaction date and reference remain unchanged. Rent totals and status will be recalculated for both{' '}
              {formatPeriodMonth(`${periodMovePrompt.sourcePeriodKey}-01`)} and{' '}
              {formatPeriodMonth(`${periodMovePrompt.targetPeriodKey}-01`)}. Deposit or held-credit allocations must be reversed first.
            </p>
            <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.07em] text-violet-700" htmlFor={`period-move-reason-${row.unitId}`}>
              Reason
            </label>
            <input
              id={`period-move-reason-${row.unitId}`}
              value={periodMovePrompt.reason}
              onChange={(event) =>
                setPeriodMovePrompt((current) => (current ? { ...current, reason: event.target.value } : current))
              }
              className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-[12.5px] text-violet-950 outline-none focus:border-violet-500"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingAction || !periodMovePrompt.reason.trim()}
                onClick={() => handleMoveReferenceToNextPeriod(periodMovePrompt)}
                className="rounded-full bg-violet-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-wait disabled:bg-stone-400"
              >
                Confirm move
              </button>
              <button
                type="button"
                disabled={pendingAction}
                onClick={() => setPeriodMovePrompt(null)}
                className="rounded-full border border-violet-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-violet-800 disabled:cursor-wait"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {renderReferenceRules(row)}

        {drawerNotice && selectedUnitId === row.unitId ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">
            {drawerNotice}
          </p>
        ) : null}

        {rulePrompt && rulePrompt.unitId === row.unitId ? (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3">
            <p className="text-[13px] font-semibold text-sky-900">
              Add this as a known reference for {rulePrompt.unitLabel}?
            </p>
            <p className="mt-1 text-[12px] text-sky-800">
              &ldquo;{rulePrompt.referenceText}&rdquo; wouldn&apos;t have matched automatically — save it as a known
              reference and next month it matches {rulePrompt.unitLabel} without you.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => handleAddReferenceRule(rulePrompt)}
                disabled={pendingAction}
                className="rounded-full bg-[#0369a1] px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
              >
                Add known reference
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

        {renderOverpaymentDecision(row)}

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
          {row.signedOff && row.referenceId ? (
            <button
              type="button"
              onClick={() =>
                handleReleaseReference(
                  row.referenceId as string,
                  row.unitId,
                  row.reference ?? 'reference',
                )
              }
              disabled={pendingAction || hasActiveCreditAllocations}
              title={hasActiveCreditAllocations ? 'Reverse allocation rows below before releasing this reference' : 'Reverse and release primary reference'}
              className={`rounded-full border border-[#e7e3d6] bg-white px-[18px] py-2.5 text-[13px] font-semibold ${
                hasActiveCreditAllocations ? 'cursor-not-allowed text-stone-400' : pendingAction ? 'cursor-wait text-stone-400' : 'text-[#57534e]'
              }`}
            >
              {hasActiveCreditAllocations ? 'Reverse allocations below first' : 'Reverse & release primary ref'}
            </button>
          ) : null}
          {canMovePrimaryReferenceToDeposit ? (
            <button
              type="button"
              onClick={() => handleMoveToDeposit(row)}
              disabled={pendingAction}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-[18px] py-2.5 text-[13px] font-semibold text-emerald-800 disabled:cursor-wait disabled:opacity-60"
            >
              Move to deposit
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
                  const rentCoverage = rentCoverageAmount(row);
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
                          <div className="lg:hidden">{renderMoneySignals(row)}</div>
                        </div>
                        <div className="min-w-0 max-lg:hidden" onClick={(event) => event.stopPropagation()}>
                          {renderReference(row)}
                          {row.transactionDate ? <p className="mt-0.5 text-[10.5px] text-[#a39d8d]">{formatTxnDate(row.transactionDate)}</p> : null}
                        </div>
                        <div className="whitespace-nowrap text-[13.5px] font-semibold text-[#292524] max-lg:hidden">
                          {rentCoverage !== null ? `R ${formatRand(rentCoverage)}` : 'R -'}
                          <span className="text-xs font-medium text-[#a39d8d]"> / {formatRand(row.expectedAmount)}</span>
                          {renderMoneySignals(row)}
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
