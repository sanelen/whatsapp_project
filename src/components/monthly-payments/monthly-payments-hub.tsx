'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import type { MonthlyPaymentsDashboardSnapshot } from '@/lib/monthly-payments';
import { BankImportControls } from './bank-import-controls';

type MonthlyPaymentsHubProps = {
  dashboard: MonthlyPaymentsDashboardSnapshot;
};

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function progressWidth(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return `R${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return `R${Math.round(amount)}`;
}

function rateLabel(collected: number, expected: number, rate: number): string {
  if (expected > 0) return `${Math.round(rate * 100)}%`;
  return collected > 0 ? '-' : '0%';
}

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

  const selectedMonth = useMemo(
    () => dashboard.recentMonths.find((month) => month.key === selectedPeriod) ?? dashboard.recentMonths.at(2),
    [dashboard.recentMonths, selectedPeriod]
  );
  const selectedRollingTotal = selectedMonth?.rollingTotal ?? dashboard.rollingTotal;
  const selectedLocations = selectedMonth?.locations ?? dashboard.locations;
  const selectedUnmatchedReferenceCount =
    selectedMonth?.unmatchedReferenceCount ?? dashboard.unmatchedReferenceCount;
  const selectedMonthIndex = dashboard.recentMonths.findIndex((month) => month.key === selectedPeriod);
  const maxMonthCollected = Math.max(0, ...dashboard.recentMonths.map((month) => month.collectedAmount));
  const primaryLocationLink = useMemo(() => {
    const propertyLocation = selectedLocations.find((location) => !location.id.startsWith('inferred:'));
    if (!propertyLocation) return '/monthly-payments/locations';
    return `/monthly-payments/${propertyLocation.id}?period=${selectedPeriod}`;
  }, [selectedLocations, selectedPeriod]);

  function refreshFromDatabase() {
    startRefresh(() => {
      router.refresh();
    });
  }

  function monthBarHeight(month: MonthlyPaymentsDashboardSnapshot['recentMonths'][number]): string {
    if (month.expectedAmount > 0) return progressWidth(month.coverageRate);
    if (month.collectedAmount > 0 && maxMonthCollected > 0) {
      return progressWidth(month.collectedAmount / maxMonthCollected);
    }
    return '0%';
  }

  function moveSelectedMonth(direction: -1 | 1) {
    if (selectedMonthIndex === -1) return;
    const nextMonth = dashboard.recentMonths[selectedMonthIndex + direction];
    if (nextMonth) setSelectedPeriod(nextMonth.key);
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#1c1a17]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] shrink-0 flex-col gap-[26px] bg-[#0f172a] px-[18px] py-[22px] text-white lg:flex">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7dd3fc]">
              Monthly Payments
            </p>
            <p className="mt-2 text-[22px] font-bold tracking-normal">Workspace</p>
          </div>
          <nav className="flex flex-col gap-1.5">
            <Link href="/monthly-payments" className="rounded-xl bg-sky-300/15 px-3 py-2.5 text-[13.5px] font-semibold text-white">
              Dashboard
            </Link>
            <Link href="/monthly-payments/locations" className="rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-slate-400">
              Locations
            </Link>
            <Link href={primaryLocationLink} className="rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-slate-400">
              Match & sign off
            </Link>
            <Link href={`/monthly-payments/reference-pool?period=${selectedPeriod}`} className="rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-slate-400">
              Reference pool
            </Link>
          </nav>
          <div className="mt-auto flex gap-2 border-t border-white/10 pt-4">
            <Link href="/" className="flex-1 rounded-full bg-white py-2.5 text-center text-[12.5px] font-bold text-[#0f172a]">
              Home
            </Link>
            <Link href="/property-assistance" className="flex-1 rounded-full border border-white/20 py-2.5 text-center text-[12.5px] font-bold text-white">
              Chatbox
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[960px]">
            <nav className="text-[13px] text-[#8a8578]">
              <Link href="/monthly-payments" className="hover:text-[#292524]">
                {dashboard.organizationLabel}
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span>all locations</span>
            </nav>

            <div className="mt-2.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="m-0 text-[30px] font-bold tracking-normal text-[#1c1a17]">
                  Where are we this month?
                </h1>
                <p className="mt-1.5 text-[13.5px] text-[#8a8578]">
                  {selectedMonth ? `${selectedMonth.label} ${selectedPeriod.slice(0, 4)}` : dashboard.monthLabel} summary across all locations.
                </p>
              </div>

              <div className="inline-flex w-fit items-center overflow-hidden rounded-full border border-[#e7e3d6] bg-white">
                <button
                  type="button"
                  onClick={() => moveSelectedMonth(-1)}
                  disabled={selectedMonthIndex <= 0}
                  className="px-3 py-2 text-sm text-[#57534e] disabled:text-[#c7c2b4]"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="min-w-[88px] px-2.5 py-2 text-center text-[13.5px] font-semibold text-[#1c1a17]">
                  {selectedMonth ? `${selectedMonth.label} ${selectedPeriod.slice(0, 4)}` : dashboard.monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => moveSelectedMonth(1)}
                  disabled={selectedMonthIndex === -1 || selectedMonthIndex >= dashboard.recentMonths.length - 1}
                  className="px-3 py-2 text-sm text-[#57534e] disabled:text-[#c7c2b4]"
                  aria-label="Next month"
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

            <section className="mt-3 rounded-[14px] border border-[#e7e3d6] bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#a39d8d]">
                  Recent months
                </p>
                <button
                  type="button"
                  onClick={refreshFromDatabase}
                  disabled={isRefreshing}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e7e3d6] bg-white px-3 text-[12px] font-bold text-[#57534e] disabled:cursor-wait disabled:text-[#a39d8d]"
                >
                  <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : undefined} />
                  Refresh {selectedMonth?.label ?? 'month'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dashboard.recentMonths.map((month) => {
                  const active = month.key === selectedPeriod;
                  const metric =
                    month.expectedAmount > 0
                      ? formatPercent(month.coverageRate)
                      : month.collectedAmount > 0
                        ? formatCompactCurrency(month.collectedAmount)
                        : '0%';
                  return (
                    <button
                      key={month.key}
                      type="button"
                      onClick={() => setSelectedPeriod(month.key)}
                      className={`min-w-[64px] flex-1 rounded-xl border p-2 text-left ${
                        active ? 'border-[#1c1a17] bg-[#fbfaf6]' : 'border-[#e7e3d6] bg-white'
                      }`}
                    >
                      <div className="flex h-5 items-end overflow-hidden rounded bg-[#f1efe9]">
                        <div
                          className={`w-full rounded-[3px] ${active ? 'bg-[#0369a1]' : 'bg-[#c7c2b4]'}`}
                          style={{ height: monthBarHeight(month) }}
                        />
                      </div>
                      <p className={`mt-1.5 text-[12px] font-bold ${active ? 'text-[#1c1a17]' : 'text-[#8a8578]'}`}>
                        {month.label}
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-[#a39d8d]">{metric}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-3 overflow-hidden rounded-[14px] border border-[#e7e3d6] bg-white">
              <div className="border-b border-[#f0ece0] px-3.5 py-3">
                <p className="text-[19px] font-bold text-[#1c1a17]">
                  {formatCurrency(selectedRollingTotal.matchedCollectedAmount)}{' '}
                  <span className="text-[12px] font-medium text-[#a39d8d]">
                    / {formatCurrency(selectedRollingTotal.expectedAmount)} expected
                  </span>
                </p>
                <p className="mt-1 text-[11px] font-semibold text-[#0f7b53]">
                  {formatCurrency(selectedRollingTotal.signedOffCollectedAmount)} signed off
                </p>
                {selectedRollingTotal.pendingCollectedAmount > 0 ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#0369a1]">
                    + {formatCurrency(selectedRollingTotal.pendingCollectedAmount)} matched, awaiting sign-off
                  </p>
                ) : null}
                {selectedRollingTotal.unmatchedCollectedAmount > 0 ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#b45309]">
                    + {formatCurrency(selectedRollingTotal.unmatchedCollectedAmount)} imported, not yet matched
                  </p>
                ) : null}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1efe9]">
                  <div
                    className="h-full bg-[#0369a1]"
                    style={{
                      width: barWidth(
                        selectedRollingTotal.matchedCollectedAmount,
                        selectedRollingTotal.expectedAmount,
                        selectedRollingTotal.coverageRate
                      ),
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4">
                <HubStat label="Paid" value={String(selectedRollingTotal.paidCount)} valueClassName="text-[#0f7b53]" />
                <HubStat label="Sign-off" value={String(selectedRollingTotal.pendingCount)} valueClassName="text-[#0369a1]" />
                <HubStat label="Due" value={String(selectedRollingTotal.dueCount)} valueClassName="text-[#b45309]" />
                <HubStat label="Overdue" value={String(selectedRollingTotal.overdueCount)} valueClassName="text-[#b91c1c]" isLast />
              </div>
              {selectedUnmatchedReferenceCount > 0 ? (
                <p className="border-t border-[#f0ece0] px-3.5 py-2 text-[10.5px] text-[#8a8578]">
                  {selectedUnmatchedReferenceCount} unmatched deposits still sitting outside unit rows.
                </p>
              ) : null}
            </section>

            <section className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#a39d8d]">By location</p>

              {isMissingTables ? (
                <div className="mt-2 rounded-[14px] border border-dashed border-[#e7e3d6] bg-white px-4 py-5">
                  <p className="text-[14px] font-bold text-[#1c1a17]">
                    Payments tables are not available in the connected database yet
                  </p>
                  <p className="mt-1 text-[12.5px] leading-5 text-[#8a8578]">
                    Apply the monthly payments migrations before loading live dashboard data.
                  </p>
                </div>
              ) : isEmpty ? (
                <div className="mt-2 rounded-[14px] border border-dashed border-[#e7e3d6] bg-white px-4 py-5">
                  <p className="text-[14px] font-bold text-[#1c1a17]">No dashboard locations yet</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-[#8a8578]">
                    Add units and payment periods before the monthly summary can fill out.
                  </p>
                </div>
              ) : (
                <div className="mt-2 overflow-hidden rounded-[14px] border border-[#e7e3d6] bg-white">
                  {selectedLocations.map((location, index) => {
                    const isProperty = !location.id.startsWith('inferred:');
                    return (
                      <article key={location.id} className={index > 0 ? 'border-t border-[#f0ece0]' : undefined}>
                        <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5">
                          <div className="min-w-0 flex-[1_1_140px]">
                            <h2 className="truncate text-[13px] font-bold text-[#1c1a17]">{location.name}</h2>
                            <p className="mt-0.5 text-[10.5px] text-[#a39d8d]">
                              {formatCurrency(location.matchedCollectedAmount)} / {formatCurrency(location.expectedAmount)}
                            </p>
                            <p className="mt-0.5 text-[10.5px] font-semibold text-[#0f7b53]">
                              {formatCurrency(location.signedOffCollectedAmount)} signed off
                            </p>
                          </div>

                          <div className="min-w-[100px] flex-[1_1_110px]">
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#f1efe9]">
                              <div
                                className="h-full bg-[#0369a1]"
                                style={{ width: barWidth(location.matchedCollectedAmount, location.expectedAmount, location.coverageRate) }}
                              />
                            </div>
                            <p className="mt-1 text-[10.5px] font-bold text-[#57534e]">
                              {rateLabel(location.matchedCollectedAmount, location.expectedAmount, location.coverageRate)}
                            </p>
                          </div>

                          <div className="flex min-w-[150px] flex-[1_1_170px] flex-wrap gap-1.5">
                            <span className="rounded-full bg-[#e8f6ee] px-2 py-1 text-[10px] font-bold text-[#0f7b53]">
                              {location.paidCount} paid
                            </span>
                            {location.pendingCount > 0 ? (
                              <span className="rounded-full bg-[#e6f3fb] px-2 py-1 text-[10px] font-bold text-[#0369a1]">
                                {location.pendingCount} sign-off
                              </span>
                            ) : null}
                            <span className="rounded-full bg-[#fdf3e3] px-2 py-1 text-[10px] font-bold text-[#b45309]">
                              {location.dueCount} due
                            </span>
                            {location.overdueCount > 0 ? (
                              <span className="rounded-full bg-[#fbe7e7] px-2 py-1 text-[10px] font-bold text-[#b91c1c]">
                                {location.overdueCount} overdue
                              </span>
                            ) : null}
                          </div>

                          {isProperty ? (
                            <div className="flex flex-none gap-1.5">
                              <Link
                                href={`/monthly-payments/${location.id}?period=${selectedPeriod}`}
                                className="rounded-full bg-[#1c1a17] px-3 py-1.5 text-[11px] font-bold text-white"
                              >
                                Open units
                              </Link>
                              <Link
                                href={`/monthly-payments/locations/${location.id}?period=${selectedPeriod}`}
                                className="rounded-full border border-[#e7e3d6] bg-white px-3 py-1.5 text-[11px] font-bold text-[#292524]"
                              >
                                Manage rooms
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-[#e7e3d6] bg-white px-4 py-3">
              <div>
                <p className="text-[12px] font-bold text-[#1c1a17]">
                  Reference pool · {selectedUnmatchedReferenceCount} unmatched deposits
                </p>
                <p className="mt-0.5 text-[11px] text-[#8a8578]">
                  Match and sign-off happens inside the property unit table.
                </p>
              </div>
              <Link
                href={primaryLocationLink}
                className="rounded-full bg-[#0369a1] px-4 py-2 text-[12px] font-bold text-white"
              >
                Open unit table →
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function HubStat({
  label,
  value,
  valueClassName,
  isLast = false,
}: {
  label: string;
  value: string;
  valueClassName: string;
  isLast?: boolean;
}) {
  return (
    <div className={`border-b border-[#f0ece0] px-3.5 py-2 sm:border-b-0 ${isLast ? '' : 'sm:border-r'}`}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#a39d8d]">{label}</p>
      <p className={`mt-0.5 text-[13px] font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}
