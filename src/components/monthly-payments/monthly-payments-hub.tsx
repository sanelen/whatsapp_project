'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { MonthlyPaymentsDashboardSnapshot } from '@/lib/monthly-payments';
import { BankImportControls } from './bank-import-controls';
import { MonthlyPaymentsNavigation } from './monthly-payments-navigation';

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

function formatBillingWindow(periodKey: string): string {
  const end = new Date(`${periodKey}-08T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  start.setUTCDate(9);
  const formatter = new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function coverageLabel(month: MonthlyPaymentsDashboardSnapshot['recentMonths'][number]): string {
  if (month.expectedAmount > 0 && month.rollingTotal.matchedCollectedAmount > month.expectedAmount) {
    return `${formatCompactCurrency(month.rollingTotal.matchedCollectedAmount - month.expectedAmount)} above rent`;
  }
  return `${formatPercent(month.coverageRate)} matched`;
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
  const billingWindowLabel = formatBillingWindow(selectedPeriod);
  const openWorkCount =
    selectedUnmatchedReferenceCount
    + selectedRollingTotal.pendingCount
    + selectedRollingTotal.dueCount;
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

  function visibleBarHeight(rate: number, hasMoney: boolean): string {
    if (!hasMoney) return '0%';
    return `${Math.max(10, Math.min(100, Math.round(rate * 100)))}%`;
  }

  function importedBarHeight(month: MonthlyPaymentsDashboardSnapshot['recentMonths'][number]): string {
    if (month.expectedAmount > 0) {
      return visibleBarHeight(month.collectedAmount / month.expectedAmount, month.collectedAmount > 0);
    }
    return visibleBarHeight(
      maxMonthCollected > 0 ? month.collectedAmount / maxMonthCollected : 0,
      month.collectedAmount > 0
    );
  }

  function matchedBarHeight(month: MonthlyPaymentsDashboardSnapshot['recentMonths'][number]): string {
    return visibleBarHeight(month.coverageRate, month.rollingTotal.matchedCollectedAmount > 0);
  }

  function moveSelectedMonth(direction: -1 | 1) {
    if (selectedMonthIndex === -1) return;
    const nextMonth = dashboard.recentMonths[selectedMonthIndex + direction];
    if (nextMonth) setSelectedPeriod(nextMonth.key);
  }

  return (
    <main className="hamba-dashboard min-h-screen text-[#102a3b]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <MonthlyPaymentsNavigation
          active="dashboard"
          operationsHref={primaryLocationLink}
          referencePoolHref={`/monthly-payments/reconcile?period=${selectedPeriod}`}
          importAuditHref={`/monthly-payments/import-audit?period=${selectedPeriod}`}
        />

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1080px]">
            <nav className="text-[13px] text-[#8a8578]">
              <Link href="/monthly-payments" className="hover:text-[#292524]">
                {dashboard.organizationLabel}
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span>all locations</span>
            </nav>

            <div className="mt-2.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#52758a]">
                  Billing cycle
                </p>
                <h1 className="hamba-display mt-1 text-[32px] leading-tight text-[#09263a]">
                  {selectedMonth ? `${selectedMonth.label} rent cycle` : dashboard.monthLabel}
                </h1>
                <p className="mt-1 text-[12px] text-[#6f6a5f]">
                  Bank transactions {billingWindowLabel} · all locations
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
                <span className="min-w-[88px] px-2.5 py-1.5 text-center text-[13px] font-semibold text-[#1c1a17]">
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

            <section className="mt-4 overflow-hidden rounded-[14px] border border-[#cfe3ed] bg-white shadow-[0_10px_28px_rgba(29,78,101,0.05)]">
              <div className="flex flex-col gap-3 border-b border-[#e5edf1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#52758a]">Work queue</p>
                  <p className="mt-0.5 text-[18px] font-bold text-[#142f3f]">
                    {openWorkCount} open items
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/monthly-payments/reconcile?period=${selectedPeriod}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#142f3f] px-3.5 text-[11.5px] font-bold text-white"
                  >
                    Reconcile payments
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/monthly-payments/locations"
                    className="inline-flex h-9 items-center rounded-full border border-[#cfdde4] bg-white px-3.5 text-[11.5px] font-bold text-[#29495b]"
                  >
                    View properties
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4">
                <QueueStat label="Unmatched" value={selectedUnmatchedReferenceCount} tone="amber" />
                <QueueStat label="Awaiting sign-off" value={selectedRollingTotal.pendingCount} tone="blue" />
                <QueueStat label="Rent due" value={selectedRollingTotal.dueCount} tone="neutral" />
                <QueueStat label="Overdue" value={selectedRollingTotal.overdueCount} tone="red" isLast />
              </div>
            </section>

            <section className="mt-3 rounded-[14px] border border-[#cfe3ed] bg-gradient-to-br from-white to-[#f3f9fc] px-3 py-2.5 shadow-[0_10px_28px_rgba(29,78,101,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#52758a]">
                    Recent months
                  </p>
                  <div className="flex items-center gap-2 text-[9.5px] font-semibold text-[#52758a]" aria-label="Payment bar legend">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#8fc4da]" />Imported</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0b78a8]" />Matched</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshFromDatabase}
                  disabled={isRefreshing}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#b9d8e7] bg-white/90 px-3 text-[12px] font-bold text-[#155e82] shadow-sm transition hover:border-[#79b4cf] hover:bg-[#edf8fc] disabled:cursor-wait disabled:text-[#8da8b7]"
                >
                  <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : undefined} />
                  Refresh {selectedMonth?.label ?? 'month'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dashboard.recentMonths.map((month) => {
                  const active = month.key === selectedPeriod;
                  const importedMetric = formatCompactCurrency(month.collectedAmount);
                  const matchedMetric = coverageLabel(month);
                  return (
                    <button
                      key={month.key}
                      type="button"
                      onClick={() => setSelectedPeriod(month.key)}
                      aria-label={`${month.label} ${month.key.slice(0, 4)}: ${importedMetric} imported, ${matchedMetric}`}
                      className={`min-w-[70px] flex-1 rounded-xl border p-2 text-left transition ${
                        active
                          ? 'border-[#2386b2] bg-[#eaf6fb] shadow-[0_5px_14px_rgba(11,120,168,0.12)]'
                          : 'border-[#d5e7ef] bg-white/90 hover:border-[#9cc8db] hover:bg-[#f5fbfd]'
                      }`}
                    >
                      <div className="relative h-5 overflow-hidden rounded bg-[#e8f3f8]">
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-[3px] bg-[#8fc4da]"
                          style={{ height: importedBarHeight(month) }}
                        />
                        <div
                          className={`absolute inset-x-0 bottom-0 rounded-[3px] ${active ? 'bg-[#075f8b]' : 'bg-[#0b78a8]'}`}
                          style={{ height: matchedBarHeight(month) }}
                        />
                      </div>
                      <p className={`mt-1.5 text-[12px] font-bold ${active ? 'text-[#092f46]' : 'text-[#365b70]'}`}>
                        {month.label}
                      </p>
                      <p className="mt-0.5 text-[9.5px] font-semibold text-[#3e718b]">{importedMetric} in</p>
                      <p className="mt-0.5 text-[9px] text-[#708f9f]">{matchedMetric}</p>
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
                  Continue reconciliation
                </p>
                <p className="mt-0.5 text-[11px] text-[#8a8578]">
                  {selectedUnmatchedReferenceCount} unmatched payments are waiting for review.
                </p>
              </div>
              <Link
                href={`/monthly-payments/reconcile?period=${selectedPeriod}`}
                className="rounded-full bg-[#0369a1] px-4 py-2 text-[12px] font-bold text-white"
              >
                Open queue →
              </Link>
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}

function QueueStat({
  label,
  value,
  tone,
  isLast = false,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'blue' | 'neutral' | 'red';
  isLast?: boolean;
}) {
  const toneClass = {
    amber: 'text-[#b45309]',
    blue: 'text-[#0369a1]',
    neutral: 'text-[#57534e]',
    red: 'text-[#b91c1c]',
  }[tone];

  return (
    <div className={`border-b border-[#e5edf1] px-4 py-3 sm:border-b-0 ${isLast ? '' : 'sm:border-r'}`}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#8a8578]">{label}</p>
      <p className={`mt-0.5 text-[18px] font-bold ${toneClass}`}>{value}</p>
    </div>
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
