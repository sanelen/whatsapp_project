'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Landmark, Settings2 } from 'lucide-react';
import type { MonthlyPaymentsLocationsView } from '@/lib/monthly-payments';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

function formatCurrency(amount: number) {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function progressWidth(collected: number, expected: number) {
  if (expected <= 0) return collected > 0 ? '100%' : '0%';
  const pct = Math.max(0, Math.min(100, Math.round((collected / expected) * 100)));
  return `${pct}%`;
}

export function LocationsAdmin({ view }: { view: MonthlyPaymentsLocationsView }) {
  return (
    <MonthlyPaymentsShell active="locations" referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}>
      <div className="rounded-[30px] border border-white/80 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              {view.organizationLabel} · rooms admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Locations
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the setup branch for monthly payments. Choose a property, manage the room
              definitions that feed matching, then jump back into unit operations when needed.
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{view.periodLabel}</p>
            <p className="mt-1">Billing window: {view.billingWindowLabel}</p>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {view.setupState === 'missing_tables' ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Payments tables are not available in the connected database yet.
            </div>
          ) : (
            view.cards.map((card) => (
              <article
                key={card.propertyId}
                className="rounded-[24px] border border-slate-300 bg-[#fcfcfa] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{card.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{card.location || 'Location not set'}</p>
                  </div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
                    <Building2 size={18} />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-100 px-3 py-3">
                    <p className="text-slate-500">Rooms</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{card.unitCount}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-3 py-3">
                    <p className="text-slate-500">Rule coverage</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {card.coveredUnitCount}/{card.unitCount || 0}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    {card.occupiedCount} occupied
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                    {card.vacantCount} vacant
                  </span>
                  <span className="rounded-full bg-stone-200 px-3 py-1 text-stone-700">
                    {card.blockedCount} blocked
                  </span>
                </div>

                <div className="mt-5 rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <p className="font-medium text-slate-700">Current month snapshot</p>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Landmark size={14} />
                      ops
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {formatCurrency(card.collectedAmount)} / {formatCurrency(card.expectedAmount)}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                    <div
                      className="h-full bg-[linear-gradient(90deg,#0ea5e9_0%,#0f766e_100%)]"
                      style={{ width: progressWidth(card.collectedAmount, card.expectedAmount) }}
                    />
                  </div>
                  {card.accountSuffixes.length > 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Accounts: {card.accountSuffixes.map((suffix) => `••${suffix}`).join(', ')}
                    </p>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/monthly-payments/locations/${card.propertyId}`}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Settings2 size={15} />
                    Manage rooms
                  </Link>
                  <Link
                    href={`/monthly-payments/${card.propertyId}?period=${view.periodKey}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
                  >
                    Open units
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </MonthlyPaymentsShell>
  );
}
