'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Search } from 'lucide-react';
import type { ReferencePoolView, ReferencePoolViewRow } from '@/lib/monthly-payments';
import { filterUnmatchedRows, summarizeUnmatchedAccounts, summarizeUnmatchedLocations } from '@/lib/reconciliation-workspace';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

const tableColumns =
  'minmax(150px,1.35fr) minmax(145px,1.2fr) minmax(82px,0.65fr) minmax(82px,0.65fr) minmax(98px,0.75fr) minmax(108px,0.85fr) minmax(125px,0.95fr) minmax(76px,0.55fr)';

function formatRand(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTxnDate(value: string): string {
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

function ReferenceRows({
  rows,
  emptyMessage,
}: {
  rows: ReferencePoolViewRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-[13px] text-slate-500">{emptyMessage}</div>;
  }

  return rows.map((row, index) => (
    <div
      key={row.id}
      className={index > 0 ? 'border-t border-slate-200' : undefined}
    >
      <div className="px-3.5 py-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-[13px] font-semibold leading-5 text-slate-900">{row.reference}</p>
            {row.payerName && row.payerName !== row.reference ? (
              <p className="mt-0.5 break-words text-[11.5px] leading-4 text-slate-500">{row.payerName}</p>
            ) : null}
          </div>
          <p className="shrink-0 text-[13px] font-semibold text-slate-900">{formatRand(row.amount)}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span>{formatTxnDate(row.transactionDate)}</span>
          <span aria-hidden="true">·</span>
          <span>{row.billingPeriodLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{row.propertyId ? row.propertyName : `Unassigned property · source: ${row.propertyName}`}</span>
          {row.accountSuffix ? <span>••{row.accountSuffix}</span> : null}
        </div>
        {row.propertyId ? (
          <Link
            href={`/monthly-payments/${row.propertyId}?period=${row.billingPeriodKey}`}
            className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-slate-950 px-3 text-[11.5px] font-semibold text-white"
          >
            Review payment
            <ArrowRight size={13} />
          </Link>
        ) : (
          <Link href={`/monthly-payments/import-audit?period=${row.billingPeriodKey}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
            Review import <ArrowRight size={13} />
          </Link>
        )}
      </div>

      <div
        className="hidden min-w-[980px] items-center gap-3 px-3.5 py-2.5 md:grid"
        style={{ gridTemplateColumns: tableColumns }}
      >
        <span className="text-[13.5px] font-medium leading-5 text-slate-800">{row.reference}</span>
        <span className="text-[13px] leading-5 text-slate-500">{row.payerName ?? '—'}</span>
        <span className="text-[13px] leading-5 text-slate-500">
          {row.accountSuffix ? `••${row.accountSuffix}` : '—'}
        </span>
        <span className="text-[13px] leading-5 text-slate-500">{formatTxnDate(row.transactionDate)}</span>
        <span className="text-[12.5px] font-semibold leading-5 text-slate-700">{row.billingPeriodLabel}</span>
        <span className="text-[13.5px] font-medium leading-5 text-slate-800">{formatRand(row.amount)}</span>
        <span className="text-[13px] leading-5 text-slate-500">
          {row.propertyId ? row.propertyName : <>Unassigned property<span className="block text-xs">Source: {row.propertyName}</span></>}
        </span>
        {row.propertyId ? (
          <Link
            href={`/monthly-payments/${row.propertyId}?period=${row.billingPeriodKey}`}
            className="inline-flex items-center justify-end gap-1 text-[12.5px] font-semibold text-sky-800"
          >
            review
            <ArrowRight size={13} />
          </Link>
        ) : (
          <Link href={`/monthly-payments/import-audit?period=${row.billingPeriodKey}`} className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-amber-800">
            Import <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  ));
}

export function ReferencePoolViewPanel({ view }: { view: ReferencePoolView }) {
  const [query, setQuery] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const accounts = summarizeUnmatchedAccounts(view.rows);
  const filteredRows = filterUnmatchedRows(view.rows, query, propertyFilter, accountFilter);
  const filteredLocations = summarizeUnmatchedLocations(filteredRows);
  const hasFilters = Boolean(query || propertyFilter !== 'all' || accountFilter !== 'all');
  const previousHref = `/monthly-payments/reconcile?period=${shiftPeriod(view.periodKey, -1)}`;
  const nextHref = `/monthly-payments/reconcile?period=${shiftPeriod(view.periodKey, 1)}`;
  const currentRows = filteredRows.filter((row) => !row.isCarryover);
  const carryoverRows = filteredRows.filter((row) => row.isCarryover);
  const propertyOptions = view.locations.filter((location) => location.propertyId);
  const primaryPropertyId = view.rows.find((row) => row.propertyId)?.propertyId
    ?? view.locations.find((location) => location.propertyId)?.propertyId;
  const operationsHref = primaryPropertyId
    ? `/monthly-payments/${primaryPropertyId}?period=${view.periodKey}`
    : '/monthly-payments/locations';

  return (
    <MonthlyPaymentsShell
      active="reference-pool"
      operationsHref={operationsHref}
      referencePoolHref={`/monthly-payments/reconcile?period=${view.periodKey}`}
    >
      <section className="mx-auto max-w-[1280px] rounded-[16px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.1)] sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Reconcile
          </p>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav className="text-[13px] font-medium text-slate-500">
                <Link href="/monthly-payments" className="hover:text-slate-800">
                  {view.organizationLabel}
                </Link>
                <span className="px-1.5 text-slate-400">›</span>
                <span className="font-semibold text-slate-950">Reconcile</span>
              </nav>
              <h1 className="mt-2 text-[25px] font-semibold text-slate-950">
                Payments needing a unit
              </h1>
              <p className="mt-1.5 text-[13px] text-slate-500">
                {view.periodLabel} cycle · bank transactions {view.billingWindowLabel}
              </p>
            </div>

            <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-300 bg-white text-[13px] font-semibold text-slate-950 shadow-sm">
              <Link
                href={previousHref}
                className="border-r border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </Link>
              <span className="min-w-[110px] px-4 py-2 text-center">{view.periodLabel}</span>
              <Link
                href={nextHref}
                className="border-l border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600">
              Bank account
              <select aria-label="Bank account" value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setPropertyFilter('all'); }} className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All accounts ({view.rows.length})</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.id === 'unknown' ? 'Unknown account' : `Ending ${account.id}`} ({account.count})</option>)}
              </select>
            </label>
            <label className="flex min-w-0 grow basis-[240px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
              <Search size={16} aria-hidden="true" />
              <input aria-label="Search unmatched payments" placeholder="Reference, payer, account or period" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm" />
            </label>
            <select aria-label="Payment property" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">All properties</option>
              <option value="unassigned">Unassigned property</option>
              {propertyOptions.map((location) => <option key={location.id} value={location.propertyId!}>{location.name}</option>)}
            </select>
            <span role="status" className="text-xs text-slate-600">{filteredRows.length} of {view.rows.length} payments</span>
          </div>

          <section className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-3">
              <section className="overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900">Current cycle</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">Payments received in this bank window.</p>
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700">
                    {currentRows.length} · {formatRand(currentRows.reduce((sum, row) => sum + row.amount, 0))}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <div
                    className="hidden min-w-[980px] border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid"
                    style={{ gridTemplateColumns: tableColumns }}
                  >
                    <span>Reference</span>
                    <span>Payer</span>
                    <span>Account</span>
                    <span>Date</span>
                    <span>Period</span>
                    <span>Recv R</span>
                    <span>Location</span>
                    <span className="text-right">Review</span>
                  </div>
                  <ReferenceRows rows={currentRows} emptyMessage={hasFilters ? 'No current payments match these filters.' : 'No unmatched deposits in this billing window.'} />
                </div>
              </section>

              <section className="overflow-hidden rounded-[16px] border border-amber-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-amber-950">Still waiting from earlier months</p>
                    <p className="mt-0.5 text-[11.5px] text-amber-800">
                      Review in the original billing period.
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold text-amber-950">
                    {carryoverRows.length} · {formatRand(carryoverRows.reduce((sum, row) => sum + row.amount, 0))}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <ReferenceRows rows={carryoverRows} emptyMessage={hasFilters ? 'No older payments match these filters.' : 'No older unmatched deposits.'} />
                </div>
              </section>
            </div>

            <aside className="rounded-[16px] border border-slate-200 bg-white p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {hasFilters ? 'Filtered unmatched payments' : 'All unmatched payments'}
              </p>
              <p className="mt-2 text-[22px] font-semibold text-slate-950">{filteredRows.length}</p>
              <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500">
                payments needing review
              </p>
              <p className="mt-2.5 text-[15px] font-semibold text-slate-800">{formatRand(filteredRows.reduce((sum, row) => sum + row.amount, 0))}</p>

              <div className="mt-3 space-y-2">
                {filteredLocations.length === 0 ? (
                  <p className="text-[13px] text-slate-500">No location buckets yet.</p>
                ) : (
                  filteredLocations.map((location) => (
                    <div key={location.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900">{location.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{location.referenceCount} refs</p>
                        </div>
                        {location.propertyId ? (
                          <Link
                            href={`/monthly-payments/${location.propertyId}?period=${view.periodKey}`}
                            className="text-[11px] font-semibold text-sky-800"
                          >
                            open
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12.5px] font-medium text-slate-700">{formatRand(location.totalAmount)}</p>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </section>
      </section>
    </MonthlyPaymentsShell>
  );
}
