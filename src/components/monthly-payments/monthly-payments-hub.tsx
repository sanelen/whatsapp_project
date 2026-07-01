'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { MonthlyPaymentsDashboardSnapshot } from '@/lib/monthly-payments';
import { BankImportControls } from './bank-import-controls';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

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

// Compact rand for tight spaces (month cards): R21k, R1.5k, R750.
function formatCompactCurrency(amount: number): string {
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return `R${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return `R${Math.round(amount)}`;
}

// When no expected target is set, a collected/expected percentage is undefined.
// Show "—" instead of a misleading 0% so the rand amounts carry the meaning.
function rateLabel(collected: number, expected: number, rate: number): string {
  if (expected > 0) return `${Math.round(rate * 100)}%`;
  return collected > 0 ? '—' : '0%';
}

// Fill the bar from collected money even when there is no expected target,
// so deposits are visually reflected rather than leaving the bar empty.
function barWidth(collected: number, expected: number, rate: number): string {
  if (expected > 0) return progressWidth(rate);
  return collected > 0 ? '100%' : '0%';
}

export function MonthlyPaymentsHub({ dashboard }: MonthlyPaymentsHubProps) {
  const isMissingTables = dashboard.setupState === 'missing_tables';
  const isEmpty = dashboard.setupState === 'empty' || dashboard.locations.length === 0;
  const currentPeriod = dashboard.recentMonths.find((month) => month.isCurrent)?.key ?? dashboard.recentMonths.at(-1)?.key ?? '';
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  // Refresh re-reads the dashboard snapshot from the database (server component).
  // It must NOT trigger a bank import — importing only happens via the Import button.
  function refreshFromDatabase() {
    startRefresh(() => {
      router.refresh();
    });
  }
  const selectedMonth = useMemo(
    () => dashboard.recentMonths.find((month) => month.key === selectedPeriod) ?? dashboard.recentMonths.at(2),
    [dashboard.recentMonths, selectedPeriod]
  );
  const selectedRollingTotal = selectedMonth?.rollingTotal ?? dashboard.rollingTotal;
  const selectedLocations = selectedMonth?.locations ?? dashboard.locations;
  const selectedUnmatchedReferenceCount =
    selectedMonth?.unmatchedReferenceCount ?? dashboard.unmatchedReferenceCount;
  const primaryLocationLink = useMemo(() => {
    const propertyLocation = selectedLocations.find((location) => !location.id.startsWith('inferred:'));
    if (!propertyLocation) return '/monthly-payments/locations';
    return `/monthly-payments/${propertyLocation.id}?period=${selectedPeriod}`;
  }, [selectedLocations, selectedPeriod]);
  const selectedMonthIndex = dashboard.recentMonths.findIndex((month) => month.key === selectedPeriod);
  // For months with no expected target, size the mini-bars by collected money
  // relative to the busiest month so you can still compare where money came in.
  const maxMonthCollected = Math.max(0, ...dashboard.recentMonths.map((month) => month.collectedAmount));

  function monthBarHeight(month: MonthlyPaymentsDashboardSnapshot['recentMonths'][number]): string {
    if (month.expectedAmount > 0) return progressWidth(month.collectionRate);
    if (month.collectedAmount > 0 && maxMonthCollected > 0) {
      return progressWidth(month.collectedAmount / maxMonthCollected);
    }
    return '0%';
  }

  function moveSelectedMonth(direction: -1 | 1) {
    if (selectedMonthIndex === -1) return;
    const nextMonth = dashboard.recentMonths[selectedMonthIndex + direction];
    if (nextMonth) {
      setSelectedPeriod(nextMonth.key);
    }
  }

  function openProperty(propertyId: string) {
    router.push(`/monthly-payments/${propertyId}?period=${selectedPeriod}`);
  }

  return (
    <MonthlyPaymentsShell active="dashboard" operationsHref={primaryLocationLink}>
      <section className="rounded-[30px] border border-white/80 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                {dashboard.organizationLabel} · all locations
              </p>
              <h2 className="mt-2 text-[2.2rem] font-semibold tracking-tight text-slate-950 sm:text-[2.6rem]">
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
              onImported={refreshFromDatabase}
              periods={dashboard.recentMonths.map((month) => ({
                key: month.key,
                label: month.label,
                isCurrent: month.isCurrent,
              }))}
            />
          ) : null}

          <section className="mt-5 rounded-[24px] border border-slate-200 bg-[#fcfcfa] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recent months - tap to view
              </p>
              <button
                type="button"
                onClick={refreshFromDatabase}
                disabled={isRefreshing}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-wait disabled:text-slate-400"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : undefined} />
                Refresh {selectedMonth?.label ?? 'month'}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-2.5">
              {dashboard.recentMonths.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setSelectedPeriod(month.key)}
                  className={`rounded-[18px] border px-2.5 py-2 text-center transition ${
                    month.key === selectedPeriod
                      ? 'border-slate-900 bg-white shadow-sm'
                      : 'border-slate-200 bg-white/80 hover:border-sky-300 hover:bg-white'
                  }`}
                >
                  <div className="mx-auto flex h-10 w-8 items-end justify-center">
                    <div className="flex h-8 w-4 items-end overflow-hidden rounded-[4px] border border-slate-300 bg-slate-100">
                      <div
                        className={`w-full ${
                          month.key === selectedPeriod
                            ? 'bg-[repeating-linear-gradient(45deg,rgba(14,165,233,0.35),rgba(14,165,233,0.35)_8px,rgba(15,118,110,0.25)_8px,rgba(15,118,110,0.25)_16px)]'
                            : 'bg-slate-300/80'
                        }`}
                        style={{ height: monthBarHeight(month) }}
                      />
                    </div>
                  </div>
                  <p
                    className={`mt-1.5 text-[0.92rem] font-semibold ${
                      month.key === selectedPeriod ? 'text-slate-950' : 'text-slate-500'
                    }`}
                  >
                    {month.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {(() => {
                      const value =
                        month.expectedAmount > 0
                          ? formatPercent(month.collectionRate)
                          : month.collectedAmount > 0
                            ? formatCompactCurrency(month.collectedAmount)
                            : '0%';
                      return month.key === selectedPeriod ? `${value} ●` : value;
                    })()}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-[24px] border-2 border-slate-300 bg-[#fcfcfa] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Rolling total - collected vs expected
              </p>
              <p className="text-sm font-semibold text-slate-500">
                  {rateLabel(
                  selectedRollingTotal.collectedAmount,
                  selectedRollingTotal.expectedAmount,
                  selectedRollingTotal.collectionRate
                )}
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[2.7rem]">
                  {formatCurrency(selectedRollingTotal.collectedAmount)}
                </p>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">
                  / {formatCurrency(selectedRollingTotal.expectedAmount)} expected
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  occupied {selectedRollingTotal.occupiedCount}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full border border-slate-400 bg-white" />
                  blocked {selectedRollingTotal.blockedCount}
                </span>
                <span className="inline-flex items-center gap-2 text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {selectedRollingTotal.paidCount} paid
                </span>
                <span className="inline-flex items-center gap-2 text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {selectedRollingTotal.dueCount} due
                </span>
                <span className="inline-flex items-center gap-2 text-rose-600">
                  <span className="text-xs">▲</span>
                  {selectedRollingTotal.overdueCount} overdue
                </span>
              </div>
            </div>

            {selectedUnmatchedReferenceCount > 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                {selectedUnmatchedReferenceCount} unmatched deposits are still sitting outside unit rows for this billing window.
              </p>
            ) : null}

            <div className="mt-4 h-4 overflow-hidden rounded-full border border-slate-300 bg-white">
              <div
                className="h-full bg-[repeating-linear-gradient(45deg,#0ea5e9,#0ea5e9_8px,#0f766e_8px,#0f766e_16px)]"
                style={{
                  width: barWidth(
                    selectedRollingTotal.collectedAmount,
                    selectedRollingTotal.expectedAmount,
                    selectedRollingTotal.collectionRate
                  ),
                }}
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
                  Each card rolls up expected versus collected income for the selected billing month.
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
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {selectedLocations.map((location) => {
                  const isProperty = !location.id.startsWith('inferred:');
                  const cardClassName =
                    'block rounded-[18px] border border-slate-300 bg-[#fcfcfa] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]' +
                    (isProperty ? ' transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md' : '');
                  const cardBody = (
                    <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[1.15rem] font-semibold text-slate-950">{location.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatCurrency(location.matchedCollectedAmount)} / {formatCurrency(location.expectedAmount)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        {rateLabel(location.matchedCollectedAmount, location.expectedAmount, location.collectionRate)}
                      </span>
                    </div>

                    <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-slate-300 bg-white">
                      <div
                        className="h-full bg-[linear-gradient(90deg,#0ea5e9_0%,#0f766e_100%)]"
                        style={{ width: barWidth(location.matchedCollectedAmount, location.expectedAmount, location.collectionRate) }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
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
                    {location.unmatchedReferenceCount > 0 ? (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {location.unmatchedReferenceCount} unmatched refs waiting · {formatCurrency(location.unmatchedCollectedAmount)}
                      </p>
                    ) : null}
                    {isProperty ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/monthly-payments/${location.id}?period=${selectedPeriod}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
                        >
                          Open units
                        </Link>
                        <Link
                          href={`/monthly-payments/locations/${location.id}?period=${selectedPeriod}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-800"
                        >
                          Manage rooms
                        </Link>
                      </div>
                    ) : null}
                    </>
                  );
                  return (
                    <article
                      key={location.id}
                      onClick={isProperty ? () => openProperty(location.id) : undefined}
                      className={
                        cardClassName +
                        (isProperty ? ' cursor-pointer' : ' opacity-95')
                      }
                    >
                      {cardBody}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-6 rounded-[24px] border border-dashed border-sky-300 bg-[linear-gradient(180deg,#f0f9ff_0%,#eff6ff_100%)] px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-900">
                  Reference pool - {selectedUnmatchedReferenceCount} unmatched deposits
                  <span className="ml-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700">
                    live
                  </span>
                </p>
                <p className="mt-2 text-sm leading-6 text-sky-800/80">
                  Match and sign-off now happens inside the property unit table instead of a separate queue screen.
                </p>
              </div>
              <Link
                href={primaryLocationLink}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
              >
                Open unit table
                <ArrowRight size={16} />
              </Link>
            </div>
          </section>
      </section>
    </MonthlyPaymentsShell>
  );
}
