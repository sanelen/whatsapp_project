'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Lock, TriangleAlert, X } from 'lucide-react';
import type { PropertyUnitsTable, ReferencePoolRow, UnitTableRow, UnitTableStatus } from '@/lib/monthly-payments';
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
  return row.status;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase();
}

function scoreReferenceForUnit(row: UnitTableRow, reference: ReferencePoolRow) {
  let score = 0;
  const referenceText = normalizeText(reference.reference);
  const payerText = normalizeText(reference.payerName);
  const expectedRef = normalizeText(row.expectedReference);

  if (expectedRef && referenceText === expectedRef) score += 120;
  else if (expectedRef && referenceText.includes(expectedRef)) score += 90;

  for (const keyword of row.matchKeywords) {
    const token = normalizeText(keyword);
    if (!token) continue;
    if (referenceText.includes(token)) score += 24;
    if (payerText.includes(token)) score += 18;
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

export function UnitsTable({ table }: { table: PropertyUnitsTable }) {
  const base = `/monthly-payments/${table.propertyId}`;
  const roomManagerBase = `/monthly-payments/locations/${table.propertyId}?period=${table.periodKey}`;
  const isMissingTables = table.setupState === 'missing_tables';
  const rows = table.rows;
  const referencePoolTotal = table.referencePool.reduce((sum, reference) => sum + reference.amount, 0);
  const router = useRouter();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
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
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-stone-800 px-4 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-wait disabled:bg-stone-500"
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
          className="inline-flex items-center gap-2 text-left text-[1.02rem] font-medium text-stone-700"
        >
          <span>{row.reference}</span>
          {row.status === 'mismatch' ? <TriangleAlert size={14} className="text-rose-700" /> : null}
          {row.locked ? <Lock size={14} className="text-amber-600" /> : null}
        </button>
      );
    }

    if (row.status === 'blocked') {
      return <span className="text-[1.02rem] text-stone-400">excluded</span>;
    }

    return (
      <button
        type="button"
        onClick={() => openMatchDrawer(row)}
        className="inline-flex items-center rounded-[18px] border border-dashed border-sky-700 px-4 py-2 text-[0.98rem] font-semibold text-sky-800"
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
      <section className="rounded-[30px] border border-white/80 bg-white/88 px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:px-9">
          <p className="px-2 text-[0.85rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Core view - per-unit table
          </p>

          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav className="text-[1.1rem] font-medium text-slate-500">
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
              <p className="mt-3 text-[0.98rem] text-slate-500">
                Billing window: <span className="font-medium text-slate-700">{table.billingWindowLabel}</span>
              </p>
              {table.activityHint ? (
                <p className="mt-2 text-[0.95rem] text-slate-500">{table.activityHint}</p>
              ) : null}
              {errorMessage ? (
                <p className="mt-2 text-[0.95rem] text-rose-700">{errorMessage}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex items-center overflow-hidden rounded-2xl border border-slate-300 bg-white text-[1.05rem] font-semibold text-slate-950 shadow-sm">
                <Link
                  href={`${base}?period=${shiftPeriod(table.periodKey, -1)}`}
                  className="border-r border-slate-300 px-4 py-3 text-slate-600 hover:bg-slate-50"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </Link>
                <span className="min-w-[154px] px-6 py-3 text-center">{table.periodLabel}</span>
                <Link
                  href={`${base}?period=${shiftPeriod(table.periodKey, 1)}`}
                  className="border-l border-slate-300 px-4 py-3 text-slate-300 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </Link>
              </div>

              <button
                type="button"
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm"
              >
                Filter
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          <section className="mt-7 rounded-[28px] border-[3px] border-stone-700 bg-white">
            <div className="grid grid-cols-[1fr_1.7fr_1fr_1.45fr_1fr_1fr_1.15fr_1.05fr] border-b-[3px] border-stone-700 bg-[#f0ede4] px-4 py-4 text-[0.9rem] font-semibold uppercase tracking-[0.08em] text-stone-500">
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
              <div className="px-6 py-10 text-sm text-stone-500">
                {isMissingTables ? (
                  'Payments tables are not available in the connected database yet.'
                ) : table.referencePool.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-stone-700">
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
                  className={`grid grid-cols-[1fr_1.7fr_1fr_1.45fr_1fr_1fr_1.15fr_1.05fr] items-center gap-4 px-4 py-5 ${
                    index > 0 ? 'border-t border-stone-200' : ''
                  } ${row.status === 'blocked' ? 'text-stone-400' : ''}`}
                >
                  <div>
                    <div className="text-[1.18rem] font-semibold text-stone-900">{row.label}</div>
                    <Link
                      href={`${roomManagerBase}&unitId=${row.unitId}`}
                      className="mt-1 inline-flex text-sm font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800"
                    >
                      manage room
                    </Link>
                  </div>
                  <div className="space-y-1 text-[1.02rem] text-stone-500">
                    {row.contacts.length ? (
                      row.contacts.slice(0, 2).map((contact) => <div key={contact}>{maskPhone(contact)}</div>)
                    ) : (
                      <div>— vacant —</div>
                    )}
                  </div>
                  <div className="text-[1.08rem] font-medium text-stone-800">
                    {row.expectedAmount > 0 ? formatRand(row.expectedAmount) : '0'}
                  </div>
                  <div>{renderReference(row)}</div>
                  <div className="text-[1rem] text-stone-500">{formatTxnDate(row.transactionDate)}</div>
                  <div className={`text-[1.08rem] font-medium ${row.status === 'mismatch' ? 'text-rose-700' : 'text-stone-800'}`}>
                    {row.receivedAmount !== null ? formatRand(row.receivedAmount) : '—'}
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full border-2 px-4 py-1.5 text-[0.95rem] font-semibold capitalize ${STATUS_STYLES[row.status]}`}>
                      {statusLabel(row)}
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {rowAction(row)}
                    <Link
                      href={`${roomManagerBase}&unitId=${row.unitId}`}
                      className="text-sm font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800"
                    >
                      edit source
                    </Link>
                  </div>
                </div>
              ))
            )}
          </section>

          <div className="mt-6 flex flex-col gap-3 text-[1rem] text-stone-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium">
              {table.totals.unitCount} units · {table.totals.blockedCount} blocked · subtotal{' '}
              <span className="font-semibold text-stone-800">R {formatRand(table.totals.collected)}</span> /{' '}
              {formatRand(table.totals.expected)} expd
            </p>
            <p className="inline-flex items-center gap-2">
              <Lock size={14} className="text-amber-600" /> = locked after sign-off
            </p>
          </div>

          <section className="mt-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.95rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Reference pool
                </p>
                <p className="mt-2 text-[1rem] text-stone-500">
                  Imported unmatched deposits for {table.periodLabel} ({table.billingWindowLabel}). These are the live records available to match into unit rows.
                </p>
              </div>
              <p className="text-[1rem] font-medium text-stone-600">
                {table.referencePool.length} unmatched · <span className="font-semibold text-stone-800">R {formatRand(referencePoolTotal)}</span>
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border-[3px] border-stone-700 bg-white">
              <div className="grid grid-cols-[1.5fr_1.2fr_0.9fr_0.95fr_1fr] border-b-[3px] border-stone-700 bg-[#f0ede4] px-4 py-4 text-[0.9rem] font-semibold uppercase tracking-[0.08em] text-stone-500">
                <span>Reference</span>
                <span>Payer</span>
                <span>Account</span>
                <span>Date</span>
                <span>Recv R</span>
              </div>

              {table.referencePool.length === 0 ? (
                <div className="px-6 py-8 text-sm text-stone-500">No unmatched deposits for this month.</div>
              ) : (
                table.referencePool.map((reference, index) => (
                  <div
                    key={reference.id}
                    className={`grid grid-cols-[1.5fr_1.2fr_0.9fr_0.95fr_1fr] items-center gap-4 px-4 py-4 ${
                      index > 0 ? 'border-t border-stone-200' : ''
                    }`}
                  >
                    <span className="text-[1rem] font-medium text-stone-800">{reference.reference}</span>
                    <span className="text-[0.98rem] text-stone-500">{reference.payerName ?? '—'}</span>
                    <span className="text-[0.98rem] text-stone-500">
                      {reference.accountSuffix ? `••${reference.accountSuffix}` : '—'}
                    </span>
                    <span className="text-[0.98rem] text-stone-500">{formatTxnDate(reference.transactionDate)}</span>
                    <span className="text-[1rem] font-medium text-stone-800">{formatRand(reference.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
      </section>

      {selectedRow ? (
          <section className="mt-6 rounded-[30px] border-[3px] border-stone-700 bg-white shadow-[0_18px_40px_rgba(120,113,108,0.14)]">
            <div className="flex items-start justify-between gap-4 border-b-[3px] border-stone-700 bg-[#f0ede4] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Match & sign off
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-stone-950">{selectedRow.label}</h3>
                <p className="mt-1 text-sm text-stone-500">
                  Property-scoped unmatched references. Pick one, match it to this row, then sign off from the table.
                </p>
                <Link
                  href={`${roomManagerBase}&unitId=${selectedRow.unitId}`}
                  className="mt-2 inline-flex text-sm font-semibold text-stone-600 underline underline-offset-2 hover:text-stone-900"
                >
                  Open room setup for {selectedRow.label}
                </Link>
              </div>
              <button
                type="button"
                onClick={closeMatchDrawer}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-0 lg:grid-cols-[1.25fr_0.95fr]">
              <div className="border-b-[3px] border-stone-700 p-5 lg:border-b-0 lg:border-r-[3px]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Unmatched references
                  </p>
                  <p className="text-sm text-stone-500">{candidateReferences.length} candidates</p>
                </div>
                <div className="mt-4 space-y-3">
                  {candidateReferences.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-stone-300 bg-[#fcfbf7] px-4 py-6 text-sm text-stone-500">
                      No unmatched references for this property in this billing window.
                    </div>
                  ) : (
                    candidateReferences.map(({ reference, score }) => (
                      <div
                        key={reference.id}
                        className="rounded-[18px] border border-stone-300 bg-[#fcfbf7] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-stone-950">{reference.reference}</p>
                            <p className="mt-1 text-sm text-stone-500">
                              {reference.payerName ?? 'Unknown payer'} · {reference.accountSuffix ? `••${reference.accountSuffix}` : 'no account'} · {formatTxnDate(reference.transactionDate)}
                            </p>
                          </div>
                          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                            {score >= 90 ? 'strong' : score >= 45 ? 'likely' : 'manual'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <div className="text-sm text-stone-600">
                            Amount <span className="font-semibold text-stone-900">R {formatRand(reference.amount)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMatch(reference.id, selectedRow.unitId)}
                            disabled={pendingAction}
                            className="inline-flex h-10 items-center justify-center rounded-2xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-stone-500"
                          >
                            Match to {selectedRow.label}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Target row
                </p>
                <div className="mt-4 rounded-[22px] border-[2px] border-stone-700 bg-[#fcfbf7] p-4">
                  <h4 className="text-xl font-semibold text-stone-950">{selectedRow.label}</h4>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-[16px] bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Expected amount</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">R {formatRand(selectedRow.expectedAmount)}</p>
                    </div>
                    <div className="rounded-[16px] bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Primary reference</p>
                      <p className="mt-1 text-base font-semibold text-stone-950">
                        {selectedRow.expectedReference || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-[16px] bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Keywords</p>
                      <p className="mt-1 text-sm text-stone-700">
                        {selectedRow.matchKeywords.length > 0 ? selectedRow.matchKeywords.join(', ') : 'No fallback keywords'}
                      </p>
                    </div>
                    <div className="rounded-[16px] bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Current row state</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-stone-900">{statusLabel(selectedRow)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
      ) : null}
    </MonthlyPaymentsShell>
  );
}
