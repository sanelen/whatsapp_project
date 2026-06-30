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

  return (
    <MonthlyPaymentsShell
      active="reference-pool"
      referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}
    >
      <section className="rounded-[30px] border border-white/80 bg-white/88 px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:px-9">
          <p className="px-2 text-[1.1rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Reference pool
          </p>

          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <nav className="text-[1.1rem] font-medium text-slate-500">
                <Link href="/monthly-payments" className="hover:text-slate-800">
                  {view.organizationLabel}
                </Link>
                <span className="px-2 text-slate-400">›</span>
                <span className="font-semibold text-slate-950">Reference Pool</span>
              </nav>
              <p className="mt-3 text-[0.98rem] text-slate-500">
                Billing window: <span className="font-medium text-slate-700">{view.billingWindowLabel}</span>
              </p>
              <p className="mt-2 max-w-3xl text-[1rem] text-slate-500">
                This is the unmatched deposits layer we did not surface yet. Review the live references here before matching them into per-unit rows.
              </p>
            </div>

            <div className="inline-flex items-center overflow-hidden rounded-2xl border border-slate-300 bg-white text-[1.05rem] font-semibold text-slate-950 shadow-sm">
              <Link
                href={previousHref}
                className="border-r border-slate-300 px-4 py-3 text-slate-600 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </Link>
              <span className="min-w-[154px] px-6 py-3 text-center">{view.periodLabel}</span>
              <Link
                href={nextHref}
                className="border-l border-slate-300 px-4 py-3 text-slate-600 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>

          <section className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="grid grid-cols-[1.15fr_1fr_0.8fr_0.85fr_1fr_1.15fr] border-b border-slate-200 bg-slate-50 px-4 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>Reference</span>
                <span>Payer</span>
                <span>Account</span>
                <span>Date</span>
                <span>Recv R</span>
                <span>Location</span>
              </div>

              {view.rows.length === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-500">No unmatched deposits for this month.</div>
              ) : (
                view.rows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`grid grid-cols-[1.15fr_1fr_0.8fr_0.85fr_1fr_1.15fr] items-center gap-4 px-4 py-4 ${
                      index > 0 ? 'border-t border-slate-200' : ''
                    }`}
                  >
                    <span className="text-[1rem] font-medium text-slate-800">{row.reference}</span>
                    <span className="text-[0.98rem] text-slate-500">{row.payerName ?? '—'}</span>
                    <span className="text-[0.98rem] text-slate-500">
                      {row.accountSuffix ? `••${row.accountSuffix}` : '—'}
                    </span>
                    <span className="text-[0.98rem] text-slate-500">{formatTxnDate(row.transactionDate)}</span>
                    <span className="text-[1rem] font-medium text-slate-800">{formatRand(row.amount)}</span>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[0.98rem] text-slate-500">{row.propertyName}</span>
                      {row.propertyId ? (
                        <Link
                          href={`/monthly-payments/${row.propertyId}?period=${view.periodKey}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-sky-800"
                        >
                          open
                          <ArrowRight size={14} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Summary
              </p>
              <p className="mt-4 text-3xl font-semibold text-slate-950">{view.totals.unmatchedCount}</p>
              <p className="mt-1 text-sm text-slate-500">unmatched deposits in this billing window</p>
              <p className="mt-4 text-xl font-semibold text-slate-800">{formatRand(view.totals.totalAmount)}</p>

              <div className="mt-6 space-y-3">
                {view.locations.length === 0 ? (
                  <p className="text-sm text-slate-500">No location buckets yet.</p>
                ) : (
                  view.locations.map((location) => (
                    <div key={location.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{location.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{location.referenceCount} refs</p>
                        </div>
                        {location.propertyId ? (
                          <Link
                            href={`/monthly-payments/${location.propertyId}?period=${view.periodKey}`}
                            className="text-xs font-semibold text-sky-800"
                          >
                            open
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-700">{formatRand(location.totalAmount)}</p>
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
