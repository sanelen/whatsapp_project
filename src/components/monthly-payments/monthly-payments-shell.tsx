'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, ClipboardList, Landmark, ReceiptText } from 'lucide-react';

type MonthlyPaymentsShellSection =
  | 'dashboard'
  | 'locations'
  | 'units'
  | 'reference-pool'
  | 'room-manager';

type MonthlyPaymentsShellProps = {
  active: MonthlyPaymentsShellSection;
  children: ReactNode;
  operationsHref?: string;
  referencePoolHref?: string;
};

function navCardClass(isActive: boolean) {
  if (isActive) {
    return 'border-sky-300 bg-sky-400/20 text-white';
  }

  return 'border-slate-800 bg-slate-900/70 text-slate-300 transition hover:border-sky-300 hover:text-white';
}

function iconWrapClass(isActive: boolean) {
  if (isActive) {
    return 'bg-sky-300/20 text-sky-100';
  }

  return 'bg-slate-800 text-slate-300';
}

export function MonthlyPaymentsShell({
  active,
  children,
  operationsHref = '/monthly-payments',
  referencePoolHref = '/monthly-payments/reference-pool',
}: MonthlyPaymentsShellProps) {
  const locationsActive = active === 'locations' || active === 'room-manager';
  const operationsActive = active === 'units';
  const referencePoolActive = active === 'reference-pool';

  return (
    <main className="payments-page-scroll min-h-screen overflow-y-auto bg-[linear-gradient(180deg,#e0f2fe_0%,#f8fafc_42%,#dbeafe_100%)] px-4 py-4 text-slate-950 sm:px-5 lg:px-6">
      <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="self-start rounded-[20px] border border-white/70 bg-slate-950 p-4 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)] lg:sticky lg:top-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
            Monthly Payments
          </p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight">Workspace</h1>
          <p className="mt-1.5 text-[12.5px] leading-5 text-slate-300">
            One navigation spine for imports, dashboard review, unit operations, and room setup.
          </p>

          <div className="mt-4 space-y-2">
            <Link
              href="/monthly-payments"
              className={`block rounded-xl border px-3 py-2.5 ${navCardClass(active === 'dashboard')}`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconWrapClass(active === 'dashboard')}`}>
                  <Landmark size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">Dashboard</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-300">
                    Month overview, imports, rolling totals, and location performance.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/monthly-payments/locations"
              className={`block rounded-xl border px-3 py-2.5 ${navCardClass(locationsActive)}`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconWrapClass(locationsActive)}`}>
                  <Building2 size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">Locations</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                    Manage locations, rooms, references, and the source data behind matching.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href={operationsHref}
              className={`block rounded-xl border px-3 py-2.5 ${navCardClass(operationsActive)}`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconWrapClass(operationsActive)}`}>
                  <ReceiptText size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">Match & sign off</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                    Open a property and work the monthly unit table without leaving the flow.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href={referencePoolHref}
              className={`block rounded-xl border px-3 py-2.5 ${navCardClass(referencePoolActive)}`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconWrapClass(referencePoolActive)}`}>
                  <ClipboardList size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">Reference pool</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                    Review unmatched deposits and jump straight back into the right property.
                  </p>
                </div>
              </div>
            </Link>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[10.5px] uppercase tracking-[0.16em] text-slate-400">Quick links</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Home
              </Link>
              <Link
                href="/property-assistance"
                className="inline-flex items-center rounded-full border border-slate-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:border-sky-300 hover:text-sky-100"
              >
                Chatbox
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
