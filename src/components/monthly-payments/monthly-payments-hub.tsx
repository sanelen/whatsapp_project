'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Landmark, ReceiptText, RefreshCw } from 'lucide-react';
import type { MonthlyPaymentsDashboardSnapshot } from '@/lib/monthly-payments';
import { BankImportControls } from './bank-import-controls';

type MonthlyPaymentsHubProps = {
  dashboard: MonthlyPaymentsDashboardSnapshot;
};

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function progressWidth(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
}

export function MonthlyPaymentsHub({ dashboard }: MonthlyPaymentsHubProps) {
  const isMissingTables = dashboard.setupState === 'missing_tables';
  const isEmpty = dashboard.setupState === 'empty' || dashboard.locations.length === 0;
  const currentPeriod = dashboard.recentMonths.find((month) => month.isCurrent)?.key ?? dashboard.recentMonths.at(-1)?.key ?? '';
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [runRequestToken, setRunRequestToken] = useState(0);
  const selectedMonth = useMemo(
    () => dashboard.recentMonths.find((month) => month.key === selectedPeriod) ?? dashboard.recentMonths.at(2),
    [dashboard.recentMonths, selectedPeriod]
  );
  const selectedMonthIndex = dashboard.recentMonths.findIndex((month) => month.key === selectedPeriod);

  function moveSelectedMonth(direction: -1 | 1) {
    if (selectedMonthIndex === -1) return;
    const nextMonth = dashboard.recentMonths[selectedMonthIndex + direction];
    if (nextMonth) {
      setSelectedPeriod(nextMonth.key);
    }
  }

  return (
    <main className="payments-page-scroll min-h-screen overflow-y-auto bg-[linear-gradient(180deg,#e0f2fe_0%,#f8fafc_42%,#dbeafe_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="self-start rounded-[28px] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)] lg:sticky lg:top-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
            Monthly Payments
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Approach A is live first: a month view over rolling totals, recent history,
            location performance, and the unmatched reference pool.
          </p>

          <div className="mt-8 space-y-3">
            <div className="rounded-[22px] border border-sky-300 bg-sky-400/20 px-4 py-4 text-white">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-300/20 text-sky-100">
                  <Landmark size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Approach A</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Dashboard home with month history, rolling total, and location cards.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4 text-slate-300">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-slate-300">
                  <ReceiptText size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Reference Pool</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    The match and sign-off flow is next after the dashboard home settles.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4 text-slate-300">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-slate-300">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Status Board</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Kanban and per-unit states will come after the dashboard summary layer.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[22px] border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quick links</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Home
              </Link>
              <Link
                href="/property-assistance"
                className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-300 hover:text-sky-100"
              >
                Chatbox
              </Link>
            </div>
          </div>
        </aside>

        <section className="rounded-[30px] border border-white/80 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                {dashboard.organizationLabel} · all locations
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Where are we this month?
              </h2>
            </div>

            <div className="inline-flex items-center overflow-hidden rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-950 shadow-sm">
              <button
                type="button"
                onClick={() => moveSelectedMonth(-1)}
                disabled={selectedMonthIndex <= 0}
                className="border-r border-slate-300 px-4 py-3 text-slate-500 disabled:text-slate-300"
              >
                ‹
              </button>
              <span className="px-5 py-3">
                {selectedMonth ? `${selectedMonth.label} ${selectedPeriod.slice(0, 4)}` : dashboard.monthLabel}
              </span>
              <button
                type="button"
                onClick={() => moveSelectedMonth(1)}
                disabled={selectedMonthIndex === -1 || selectedMonthIndex >= dashboard.recentMonths.length - 1}
                className="border-l border-slate-300 px-4 py-3 text-slate-500 disabled:text-slate-300"
                title="Next month"
              >
                ›
              </button>
            </div>
          </div>

          {currentPeriod ? (
            <BankImportControls
              defaultPeriod={currentPeriod}
              selectedPeriod={selectedPeriod}
              onSelectedPeriodChange={setSelectedPeriod}
              runRequestToken={runRequestToken}
              periods={dashboard.recentMonths.map((month) => ({
                key: month.key,
                label: month.label,
                isCurrent: month.isCurrent,
              }))}
            />
          ) : null}

          <section className="mt-6 rounded-[24px] border border-slate-200 bg-[#fcfcfa] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recent months - tap to view
              </p>
              <button
                type="button"
                onClick={() => setRunRequestToken((token) => token + 1)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:text-sky-800"
              >
                <RefreshCw size={13} />
                Refresh {selectedMonth?.label ?? 'month'}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
              {dashboard.recentMonths.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setSelectedPeriod(month.key)}
                  className={`rounded-[20px] border p-3 text-center transition ${
                    month.key === selectedPeriod
                      ? 'border-slate-900 bg-white shadow-sm'
                      : 'border-slate-200 bg-white/80 hover:border-sky-300 hover:bg-white'
                  }`}
                >
                  <div className="mx-auto flex h-12 w-10 items-end justify-center">
                    <div className="flex h-10 w-5 items-end overflow-hidden rounded-[4px] border border-slate-300 bg-slate-100">
                      <div
                        className={`w-full ${
                          month.key === selectedPeriod
                            ? 'bg-[repeating-linear-gradient(45deg,rgba(14,165,233,0.35),rgba(14,165,233,0.35)_8px,rgba(15,118,110,0.25)_8px,rgba(15,118,110,0.25)_16px)]'
                            : 'bg-slate-300/80'
                        }`}
                        style={{ height: progressWidth(month.collectionRate) }}
                      />
                    </div>
                  </div>
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      month.key === selectedPeriod ? 'text-slate-950' : 'text-slate-500'
                    }`}
                  >
                    {month.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {month.key === selectedPeriod ? `${formatPercent(month.collectionRate)} ●` : formatPercent(month.collectionRate)}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border-2 border-slate-300 bg-[#fcfcfa] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Rolling total - collected vs expected
              </p>
              <p className="text-sm font-semibold text-slate-500">
                {formatPercent(dashboard.rollingTotal.collectionRate)}
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.85rem]">
                  {formatCurrency(dashboard.rollingTotal.collectedAmount)}
                </p>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">
                  / {formatCurrency(dashboard.rollingTotal.expectedAmount)} expected
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  occupied {dashboard.rollingTotal.occupiedCount}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full border border-slate-400 bg-white" />
                  blocked {dashboard.rollingTotal.blockedCount}
                </span>
                <span className="inline-flex items-center gap-2 text-rose-600">
                  <span className="text-xs">▲</span>
                  {dashboard.rollingTotal.overdueCount} overdue
                </span>
              </div>
            </div>

            <div className="mt-4 h-4 overflow-hidden rounded-full border border-slate-300 bg-white">
              <div
                className="h-full bg-[repeating-linear-gradient(45deg,#0ea5e9,#0ea5e9_8px,#0f766e_8px,#0f766e_16px)]"
                style={{ width: progressWidth(dashboard.rollingTotal.collectionRate) }}
              />
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  By location
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Each card rolls up expected versus collected income for the current month.
                </p>
              </div>
            </div>

            {isMissingTables ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-lg font-semibold text-slate-900">
                  Payments tables are not available in the connected database yet
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  The code is now expecting `property_units`, `unit_payment_periods`, and
                  `payment_references`. Apply the new migration before loading live dashboard data.
                </p>
              </div>
            ) : isEmpty ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="text-lg font-semibold text-slate-900">No dashboard locations yet</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Organizations and properties are ready, but the dashboard still needs units and
                  payment-period rows before the monthly summary can fill out.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {dashboard.locations.map((location) => (
                  <article
                    key={location.id}
                    className="rounded-[20px] border border-slate-300 bg-[#fcfcfa] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">{location.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatCurrency(location.collectedAmount)} / {formatCurrency(location.expectedAmount)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        {formatPercent(location.collectionRate)}
                      </span>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full border border-slate-300 bg-white">
                      <div
                        className="h-full bg-[linear-gradient(90deg,#0ea5e9_0%,#0f766e_100%)]"
                        style={{ width: progressWidth(location.collectionRate) }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                        {location.paidCount} paid
                      </span>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                        {location.dueCount} due
                      </span>
                      {location.overdueCount > 0 ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                          {location.overdueCount} overdue
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 rounded-[24px] border border-dashed border-sky-300 bg-[linear-gradient(180deg,#f0f9ff_0%,#eff6ff_100%)] px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-900">
                  Reference pool - {dashboard.unmatchedReferenceCount} unmatched deposits
                  <span className="ml-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700">
                    live
                  </span>
                </p>
                <p className="mt-2 text-sm leading-6 text-sky-800/80">
                  Match and sign-off is the next dashboard slice after this home view.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                Match & sign off
                <ArrowRight size={16} />
              </span>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
