'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Lock, TriangleAlert, X } from 'lucide-react';
import type {
  PropertyUnitsTable,
  ReferencePoolRow,
  UnitTableMatchRule,
  UnitTableRow,
  UnitTableStatus,
} from '@/lib/monthly-payments';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

function formatRand(amount: number): string {
  return amount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

const STATUS_STYLES: Record<UnitTableStatus, string> = {
  paid: 'border-emerald-600/70 bg-emerald-50 text-emerald-800',
  unpaid: 'border-amber-600/70 bg-amber-50 text-amber-800',
  partial: 'border-amber-600/70 bg-amber-50 text-amber-800',
  mismatch: 'border-rose-600/70 bg-rose-50 text-rose-800',
  overdue: 'border-rose-600/70 bg-rose-50 text-rose-800',
  blocked: 'border-stone-400 bg-stone-100 text-stone-600',
};

function statusLabel(row: UnitTableRow): string {
  if (row.status === 'overdue' && row.overdueDays) return `overdue ${row.overdueDays}d`;
  if (row.status === 'mismatch' && row.depositSplit) return 'overpaid';
  return row.status;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase();
}

function roomLabelHints(label: string) {
  const normalized = normalizeText(label);
  const digits = normalized.replace(/\D/g, '');
  const hints = new Set<string>();
  if (normalized) hints.add(normalized);
  if (digits) {
    hints.add(digits);
    hints.add(`ROOM ${digits}`);
    hints.add(`ROOM${digits}`);
    hints.add(`NO.${digits}`);
    hints.add(`NO ${digits}`);
  }
  return Array.from(hints);
}

function uniqueHints(row: UnitTableRow) {
  return Array.from(new Set([...row.matchKeywords, ...roomLabelHints(row.label)])).slice(0, 8);
}

function matchesRule(rule: UnitTableMatchRule, reference: ReferencePoolRow) {
  const referenceText = normalizeText(reference.reference);
  const payerText = normalizeText(reference.payerName);
  const matcherValue = normalizeText(rule.matcherValue);

  switch (rule.matcherType) {
    case 'reference_equals':
      return matcherValue.length > 0 && referenceText === matcherValue;
    case 'reference_contains':
      return matcherValue.length > 0 && referenceText.includes(matcherValue);
    case 'payer_name_contains':
      return matcherValue.length > 0 && payerText.includes(matcherValue);
    case 'amount_equals':
      return rule.amountValue !== null && Math.abs(reference.amount - rule.amountValue) <= 0.001;
    case 'reference_regex':
      if (!rule.matcherValue.trim()) return false;
      try {
        return new RegExp(rule.matcherValue, 'iu').test(reference.reference);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function scoreReferenceForUnit(row: UnitTableRow, reference: ReferencePoolRow) {
  let score = 0;
  const referenceText = normalizeText(reference.reference);
  const payerText = normalizeText(reference.payerName);
  const expectedRef = normalizeText(row.expectedReference);

  if (expectedRef && referenceText === expectedRef) score += 120;
  else if (expectedRef && referenceText.includes(expectedRef)) score += 90;

  for (const keyword of [...row.matchKeywords, ...roomLabelHints(row.label)]) {
    const token = normalizeText(keyword);
    if (!token) continue;
    if (referenceText.includes(token)) score += 24;
    if (payerText.includes(token)) score += 18;
  }

  for (const rule of row.matchRules) {
    if (!rule.isActive) continue;
    if (!matchesRule(rule, reference)) continue;

    switch (rule.matcherType) {
      case 'reference_equals':
        score += 110;
        break;
      case 'reference_regex':
        score += 72;
        break;
      case 'payer_name_contains':
        score += 38;
        break;
      case 'amount_equals':
        score += 34;
        break;
      case 'reference_contains':
      default:
        score += 52;
        break;
    }
  }

  if (Math.abs(reference.amount - row.expectedAmount) <= 0.001) score += 35;
  else if (reference.amount > 0 && row.expectedAmount > 0) {
    const variance = Math.abs(reference.amount - row.expectedAmount) / row.expectedAmount;
    if (variance <= 0.1) score += 10;
  }

  return score;
}

function sortReferencesForRow(row: UnitTableRow, references: ReferencePoolRow[]) {
  return references
    .map((reference) => ({
      reference,
      score: scoreReferenceForUnit(row, reference),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.reference.transactionDate < right.reference.transactionDate ? 1 : -1;
    });
}

async function postReferenceAction(body: Record<string, string>) {
  const response = await fetch('/api/monthly-payments/references', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Monthly payments action failed');
  }
}

function renderRuleLabel(rule: UnitTableMatchRule) {
  if (rule.matcherType === 'amount_equals') {
    return `amount ${formatRand(rule.amountValue ?? 0)}`;
  }
  const labels: Record<UnitTableMatchRule['matcherType'], string> = {
    reference_contains: 'ref contains',
    reference_equals: 'ref equals',
    reference_regex: 'regex',
    payer_name_contains: 'payer',
    amount_equals: 'amount',
  };
  return `${labels[rule.matcherType]} ${rule.matcherValue}`;
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

  const selectedRow = useMemo(
    () => rows.find((row) => row.unitId === selectedUnitId) ?? null,
    [rows, selectedUnitId]
  );
  const candidateReferences = useMemo(
    () => (selectedRow ? sortReferencesForRow(selectedRow, table.referencePool) : []),
    [selectedRow, table.referencePool]
  );

  function refreshTable() {
    setErrorMessage(null);
    router.refresh();
  }

  function openMatchDrawer(row: UnitTableRow) {
    setErrorMessage(null);
    setSelectedUnitId(row.unitId);
  }

  function closeMatchDrawer() {
    setSelectedUnitId(null);
    setErrorMessage(null);
  }

  function handleMatch(referenceId: string, unitId: string) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'match',
          paymentReferenceId: referenceId,
          propertyId: table.propertyId,
          unitId,
        });
        closeMatchDrawer();
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to match reference');
      }
    });
  }

  function handleSignOff(referenceId: string) {
    startTransition(async () => {
      try {
        await postReferenceAction({
          action: 'sign_off',
          paymentReferenceId: referenceId,
        });
        refreshTable();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to sign off reference');
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

  function rowAction(row: UnitTableRow) {
    if (row.signedOff && row.referenceId) {
      return (
        <div className="flex flex-col items-start gap-1 text-stone-600">
          <span className="text-sm">✓ signed</span>
          <button
            type="button"
            onClick={() => handleReverse(row.referenceId as string)}
            disabled={pendingAction}
            className="text-sm font-semibold text-sky-800 underline underline-offset-2 disabled:text-stone-400"
          >
            reverse sign-off
          </button>
        </div>
      );
    }

    if (row.status === 'blocked') {
      return <button type="button" className="text-sm text-stone-600">blocked</button>;
    }

    if (row.referenceId && row.status !== 'mismatch') {
      return (
        <button
          type="button"
          onClick={() => handleSignOff(row.referenceId as string)}
          disabled={pendingAction}
          className="inline-flex h-9 items-center justify-center rounded-2xl bg-stone-800 px-3.5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-wait disabled:bg-stone-500"
        >
          Sign off
        </button>
      );
    }

    if (row.status === 'mismatch') {
      return (
        <button
          type="button"
          onClick={() => openMatchDrawer(row)}
          className="text-sm font-semibold text-rose-700 underline underline-offset-2"
        >
          review
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => openMatchDrawer(row)}
        className="text-sm font-semibold text-sky-800 underline underline-offset-2"
      >
        match ref
      </button>
    );
  }

  function renderReference(row: UnitTableRow) {
    if (row.reference) {
      return (
        <button
          type="button"
          onClick={() => openMatchDrawer(row)}
          className="inline-flex items-center gap-2 text-left text-[0.94rem] font-medium text-stone-700"
        >
          <span>{row.reference}</span>
          {row.status === 'mismatch' ? <TriangleAlert size={14} className="text-rose-700" /> : null}
          {row.locked ? <Lock size={14} className="text-amber-600" /> : null}
        </button>
      );
    }

    if (row.status === 'blocked') {
      return <span className="text-[0.94rem] text-stone-400">excluded</span>;
    }

    return (
      <button
        type="button"
        onClick={() => openMatchDrawer(row)}
        className="inline-flex items-center rounded-[16px] border border-dashed border-sky-700 px-3 py-1.5 text-[0.86rem] font-semibold text-sky-800"
      >
        + match ref
      </button>
    );
  }

  return (
    <MonthlyPaymentsShell
      active="units"
      operationsHref={`${base}?period=${table.periodKey}`}
      referencePoolHref={`/monthly-payments/reference-pool?period=${table.periodKey}`}
    >
      <section className="rounded-[30px] border border-white/80 bg-white/90 px-4 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Hamba operations
          </p>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav className="text-[0.95rem] font-medium text-slate-500">
                <Link href="/monthly-payments" className="hover:text-slate-800">
                  {table.organizationLabel}
                </Link>
                <span className="px-2 text-slate-400">›</span>
                <Link href="/monthly-payments/locations" className="hover:text-slate-800">
                  Locations
                </Link>
                <span className="px-2 text-slate-400">›</span>
                <span>{table.propertyName}</span>
                <span className="px-2 text-slate-400">›</span>
                <span className="font-semibold text-slate-950">Units</span>
              </nav>
              <h1 className="mt-2.5 text-[2rem] font-semibold tracking-tight text-slate-950">
                {table.propertyName} units
              </h1>
              <p className="mt-3 text-[0.95rem] text-slate-500">
                Billing window: <span className="font-medium text-slate-700">{table.billingWindowLabel}</span>
              </p>
              {table.activityHint ? (
                <p className="mt-2 text-[0.95rem] text-slate-500">{table.activityHint}</p>
              ) : null}
              {errorMessage ? (
                <p className="mt-2 text-[0.95rem] text-rose-700">{errorMessage}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-start gap-3 lg:justify-end">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">This month</p>
                <p className="mt-1.5 text-base font-semibold text-slate-950">
                  R {formatRand(table.totals.collected)}
                  <span className="font-normal text-slate-500"> / {formatRand(table.totals.expected)} expd</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {table.totals.paidCount} paid · {table.totals.dueCount} due · {table.totals.overdueCount} overdue
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center overflow-hidden rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-950 shadow-sm">
                <Link
                  href={`${base}?period=${shiftPeriod(table.periodKey, -1)}`}
                  className="border-r border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </Link>
                <span className="min-w-[132px] px-4 py-2 text-center">{table.periodLabel}</span>
                <Link
                  href={`${base}?period=${shiftPeriod(table.periodKey, 1)}`}
                  className="border-l border-slate-300 px-3 py-2 text-slate-300 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </Link>
              </div>

              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm"
              >
                Filter
                <ChevronDown size={14} />
              </button>
              </div>
            </div>
          </div>

          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    This property in {table.periodLabel}
                  </p>
                  <p className="mt-1 font-medium text-slate-700">
                    {table.totals.paidCount} paid · {table.totals.dueCount} due · {table.totals.overdueCount} overdue
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">
                    {table.totals.unmatchedCount} unmatched
                    {table.totals.unmatchedCount > 0 ? ` · R ${formatRand(table.totals.unmatchedAmount)}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Deposits still outside unit rows for this billing window
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="grid grid-cols-[1fr_1.4fr_0.82fr_1.18fr_0.72fr_0.86fr_1fr_0.86fr] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Unit</span>
                  <span>Contact</span>
                  <span>Exp R</span>
                  <span>Reference</span>
                  <span>Date</span>
                  <span>Recv R</span>
                  <span>Status</span>
                  <span />
                </div>

                {rows.length === 0 ? (
                  <div className="px-6 py-10 text-sm text-slate-500">
                    {isMissingTables ? (
                      'Payments tables are not available in the connected database yet.'
                    ) : table.referencePool.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-base font-medium text-slate-700">
                          No unit rows are set up for this property yet, but imported bank references already exist for this month.
                        </p>
                        <p>
                          You can still review the live reference data below while we backfill `property_units` and `unit_payment_periods`.
                        </p>
                      </div>
                    ) : (
                      'No units are set up for this property yet.'
                    )}
                  </div>
                ) : (
                  rows.map((row, index) => (
                    <div
                      key={row.unitId}
                      className={`grid grid-cols-[1fr_1.4fr_0.82fr_1.18fr_0.72fr_0.86fr_1fr_0.86fr] items-center gap-3 px-4 py-2.5 ${
                        index > 0 ? 'border-t border-slate-200' : ''
                      } ${row.status === 'blocked' ? 'text-slate-400' : ''} ${
                        selectedRow?.unitId === row.unitId ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div>
                        <div className="text-[0.98rem] font-semibold text-slate-950">{row.label}</div>
                        <Link
                          href={`${roomManagerBase}&unitId=${row.unitId}`}
                          className="mt-0.5 inline-flex text-[0.82rem] font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-800"
                        >
                          manage room
                        </Link>
                      </div>
                      <div className="space-y-0.5 text-[0.88rem] leading-5 text-slate-500">
                        {row.contacts.length ? (
                          row.contacts.slice(0, 2).map((contact) => <div key={contact}>{maskPhone(contact)}</div>)
                        ) : (
                          <div>— vacant —</div>
                        )}
                      </div>
                      <div className="text-[0.95rem] font-medium text-slate-800">
                        {row.expectedAmount > 0 ? formatRand(row.expectedAmount) : '0'}
                      </div>
                      <div>{renderReference(row)}</div>
                      <div className="text-[0.95rem] text-slate-500">{formatTxnDate(row.transactionDate)}</div>
                      <div className={`text-[0.95rem] font-medium ${row.status === 'mismatch' && !row.depositSplit ? 'text-rose-700' : 'text-slate-800'}`}>
                        {row.receivedAmount !== null ? formatRand(row.receivedAmount) : '—'}
                        {row.status === 'mismatch' && row.depositSplit ? (
                          <div className="mt-0.5 text-[0.75rem] font-semibold leading-4 text-amber-700">
                            rent {formatRand(row.depositSplit.rentPortion)} + deposit {formatRand(row.depositSplit.depositPortion)}
                            {row.depositSplit.surplusAmount > 0 ? ` (+${formatRand(row.depositSplit.surplusAmount)} over)` : ''}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <span
                          className={`inline-flex rounded-full border-2 px-3 py-1 text-[0.82rem] font-semibold capitalize ${
                            row.status === 'mismatch' && row.depositSplit
                              ? 'border-amber-500/70 bg-amber-50 text-amber-800'
                              : STATUS_STYLES[row.status]
                          }`}
                        >
                          {statusLabel(row)}
                        </span>
                        {row.signedOff ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-slate-500">
                            <Lock size={11} className="text-amber-600" />
                            signed off
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        {rowAction(row)}
                        <Link
                          href={`${roomManagerBase}&unitId=${row.unitId}`}
                          className="text-[0.88rem] font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-800"
                        >
                          edit source
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-6 rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
                {selectedRow ? (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Match & sign off
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">{selectedRow.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Property-scoped matching for {table.periodLabel}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeMatchDrawer}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Target room</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{selectedRow.label}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Expected R {formatRand(selectedRow.expectedAmount)} · {statusLabel(selectedRow)}
                        </p>
                        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">Primary ref</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {selectedRow.expectedReference || 'Not set'}
                        </p>
                      </div>

                      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Hint coverage</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {uniqueHints(selectedRow).map((hint, index) => (
                            <span
                              key={`${selectedRow.unitId}-hint-${index}-${hint}`}
                              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              {hint}
                            </span>
                          ))}
                          {selectedRow.matchKeywords.length === 0 && selectedRow.matchRules.length === 0 ? (
                            <span className="text-sm text-slate-500">No keyword hints yet</span>
                          ) : null}
                        </div>
                        {selectedRow.matchRules.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            {selectedRow.matchRules.slice(0, 4).map((rule) => (
                              <div key={rule.id} className="rounded-[14px] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                {renderRuleLabel(rule)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <Link
                          href={`${roomManagerBase}&unitId=${selectedRow.unitId}`}
                          className="mt-4 inline-flex text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
                        >
                          Open room setup for {selectedRow.label}
                        </Link>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Candidates
                          </p>
                          <p className="text-sm text-slate-500">{candidateReferences.length} refs</p>
                        </div>
                        <div className="mt-3 space-y-3">
                          {candidateReferences.length === 0 ? (
                            <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                              No unmatched references for this property in this billing window.
                            </div>
                          ) : (
                            candidateReferences.map(({ reference, score }) => (
                              <div
                                key={reference.id}
                                className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-base font-semibold text-slate-950">{reference.reference}</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {reference.payerName ?? 'Unknown payer'} · {reference.accountSuffix ? `••${reference.accountSuffix}` : 'no account'} · {formatTxnDate(reference.transactionDate)}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                                    {score >= 90 ? 'strong' : score >= 45 ? 'likely' : 'manual'}
                                  </span>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-4">
                                  <div className="text-sm text-slate-600">
                                    Amount <span className="font-semibold text-slate-900">R {formatRand(reference.amount)}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleMatch(reference.id, selectedRow.unitId)}
                                    disabled={pendingAction}
                                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-500"
                                  >
                                    Match
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      Match & sign off
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Click any <span className="font-semibold text-slate-700">match ref</span> action in the unit table to open a property-scoped candidate panel here.
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </section>

          <div className="mt-5 flex flex-col gap-3 text-[0.95rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium">
              {table.totals.unitCount} units · {table.totals.blockedCount} blocked · subtotal{' '}
              <span className="font-semibold text-slate-800">R {formatRand(table.totals.collected)}</span> /{' '}
              {formatRand(table.totals.expected)} expd
            </p>
            <p className="inline-flex items-center gap-2">
              <Lock size={14} className="text-amber-600" /> = locked after sign-off
            </p>
          </div>

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Reference pool
                </p>
                <p className="mt-2 text-[0.95rem] text-slate-500">
                  Imported unmatched deposits for {table.periodLabel} ({table.billingWindowLabel}). These are the live records available to match into unit rows.
                </p>
              </div>
              <p className="text-[0.95rem] font-medium text-slate-600">
                {table.referencePool.length} unmatched · <span className="font-semibold text-slate-800">R {formatRand(referencePoolTotal)}</span>
              </p>
            </div>

            <div className="mt-3 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-[1.45fr_1.1fr_0.8fr_0.8fr_0.9fr] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[0.74rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>Reference</span>
                <span>Payer</span>
                <span>Account</span>
                <span>Date</span>
                <span>Recv R</span>
              </div>

              {table.referencePool.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500">No unmatched deposits for this month.</div>
              ) : (
                table.referencePool.map((reference, index) => (
                  <div
                    key={reference.id}
                    className={`grid grid-cols-[1.45fr_1.1fr_0.8fr_0.8fr_0.9fr] items-center gap-3 px-4 py-3 ${
                      index > 0 ? 'border-t border-slate-200' : ''
                    }`}
                  >
                    <span className="text-[0.95rem] font-medium text-slate-800">{reference.reference}</span>
                    <span className="text-[0.92rem] text-slate-500">{reference.payerName ?? '—'}</span>
                    <span className="text-[0.92rem] text-slate-500">
                      {reference.accountSuffix ? `••${reference.accountSuffix}` : '—'}
                    </span>
                    <span className="text-[0.92rem] text-slate-500">{formatTxnDate(reference.transactionDate)}</span>
                    <span className="text-[0.95rem] font-medium text-slate-800">{formatRand(reference.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
      </section>

      {selectedRow ? (
        <div className="xl:hidden">
          <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={closeMatchDrawer} />
          <section className="fixed inset-x-4 bottom-4 top-20 z-50 overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Match & sign off
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{selectedRow.label}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Property-scoped matching for {table.periodLabel}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMatchDrawer}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Target room</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{selectedRow.label}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Expected R {formatRand(selectedRow.expectedAmount)} · {statusLabel(selectedRow)}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">Primary ref</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedRow.expectedReference || 'Not set'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {uniqueHints(selectedRow).map((hint, index) => (
                    <span
                      key={`${selectedRow.unitId}-hint-mobile-${index}-${hint}`}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {hint}
                    </span>
                  ))}
                </div>
                <Link
                  href={`${roomManagerBase}&unitId=${selectedRow.unitId}`}
                  className="mt-4 inline-flex text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
                >
                  Open room setup for {selectedRow.label}
                </Link>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Unmatched references
                  </p>
                  <p className="text-sm text-slate-500">{candidateReferences.length} candidates</p>
                </div>
                <div className="mt-3 space-y-3">
                  {candidateReferences.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      No unmatched references for this property in this billing window.
                    </div>
                  ) : (
                    candidateReferences.map(({ reference, score }) => (
                      <div
                        key={reference.id}
                        className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-950">{reference.reference}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {reference.payerName ?? 'Unknown payer'} · {reference.accountSuffix ? `••${reference.accountSuffix}` : 'no account'} · {formatTxnDate(reference.transactionDate)}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                            {score >= 90 ? 'strong' : score >= 45 ? 'likely' : 'manual'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <div className="text-sm text-slate-600">
                            Amount <span className="font-semibold text-slate-900">R {formatRand(reference.amount)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMatch(reference.id, selectedRow.unitId)}
                            disabled={pendingAction}
                            className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-500"
                          >
                            Match
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </MonthlyPaymentsShell>
  );
}
