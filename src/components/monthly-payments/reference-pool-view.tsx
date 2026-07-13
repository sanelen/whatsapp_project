'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import type { ReferencePoolView } from '@/lib/monthly-payments';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

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

export function ReferencePoolViewPanel({ view }: { view: ReferencePoolView }) {
  const previousHref = `/monthly-payments/reference-pool?period=${shiftPeriod(view.periodKey, -1)}`;
  const nextHref = `/monthly-payments/reference-pool?period=${shiftPeriod(view.periodKey, 1)}`;
  const tableColumns =
    'minmax(150px,1.4fr) minmax(150px,1.25fr) minmax(88px,0.8fr) minmax(84px,0.72fr) minmax(112px,0.95fr) minmax(132px,1fr) minmax(76px,0.55fr)';
  const primaryPropertyId = view.rows.find((row) => row.propertyId)?.propertyId
    ?? view.locations.find((location) => location.propertyId)?.propertyId;
  const operationsHref = primaryPropertyId
    ? `/monthly-payments/${primaryPropertyId}?period=${view.periodKey}`
    : '/monthly-payments/locations';

  return (
    <MonthlyPaymentsShell
      active="reference-pool"
      operationsHref={operationsHref}
      referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}
    >
      <section className="rounded-[20px] border border-white/80 bg-white/88 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Reference pool
          </p>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav className="text-[13px] font-medium text-slate-500">
                <Link href="/monthly-payments" className="hover:text-slate-800">
                  {view.organizationLabel}
                </Link>
                <span className="px-1.5 text-slate-400">›</span>
                <span className="font-semibold text-slate-950">Reference Pool</span>
              </nav>
              <p className="mt-1.5 text-[13px] text-slate-500">
                Billing window: <span className="font-medium text-slate-700">{view.billingWindowLabel}</span>
              </p>
              <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-500">
                This is the unmatched deposits layer we did not surface yet. Review the live references here before matching them into per-unit rows.
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

          <section className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="overflow-x-auto">
                <div
                  className="grid min-w-[860px] border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                  style={{ gridTemplateColumns: tableColumns }}
                >
                  <span>Reference</span>
                  <span>Payer</span>
                  <span>Account</span>
                  <span>Date</span>
                  <span>Recv R</span>
                  <span>Location</span>
                  <span className="text-right">Open</span>
                </div>

                {view.rows.length === 0 ? (
                  <div className="px-4 py-6 text-[13px] text-slate-500">No unmatched deposits for this month.</div>
                ) : (
                  view.rows.map((row, index) => (
                    <div
                      key={row.id}
                      className={`grid min-w-[860px] items-center gap-3 px-3.5 py-2.5 ${
                        index > 0 ? 'border-t border-slate-200' : ''
                      }`}
                      style={{ gridTemplateColumns: tableColumns }}
                    >
                      <span className="text-[13.5px] font-medium leading-5 text-slate-800">{row.reference}</span>
                      <span className="text-[13px] leading-5 text-slate-500">{row.payerName ?? '—'}</span>
                      <span className="text-[13px] leading-5 text-slate-500">
                        {row.accountSuffix ? `••${row.accountSuffix}` : '—'}
                      </span>
                      <span className="text-[13px] leading-5 text-slate-500">{formatTxnDate(row.transactionDate)}</span>
                      <span className="text-[13.5px] font-medium leading-5 text-slate-800">{formatRand(row.amount)}</span>
                      <span className="text-[13px] leading-5 text-slate-500">
                        {row.propertyName}
                      </span>
                      {row.propertyId ? (
                        <Link
                          href={`/monthly-payments/${row.propertyId}?period=${view.periodKey}`}
                          className="inline-flex items-center justify-end gap-1 text-[12.5px] font-semibold text-sky-800"
                        >
                          open
                          <ArrowRight size={13} />
                        </Link>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside className="rounded-[16px] border border-slate-200 bg-white p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Summary
              </p>
              <p className="mt-2 text-[22px] font-semibold text-slate-950">{view.totals.unmatchedCount}</p>
              <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500">unmatched deposits in this billing window</p>
              <p className="mt-2.5 text-[15px] font-semibold text-slate-800">{formatRand(view.totals.totalAmount)}</p>

              <div className="mt-3 space-y-2">
                {view.locations.length === 0 ? (
                  <p className="text-[13px] text-slate-500">No location buckets yet.</p>
                ) : (
                  view.locations.map((location) => (
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
