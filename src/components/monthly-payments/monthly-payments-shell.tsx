'use client';

import type { ReactNode } from 'react';
import {
  MonthlyPaymentsNavigation,
  type MonthlyPaymentsNavigationSection,
} from './monthly-payments-navigation';

type MonthlyPaymentsShellSection = MonthlyPaymentsNavigationSection;

type MonthlyPaymentsShellProps = {
  active: MonthlyPaymentsShellSection;
  children: ReactNode;
  operationsHref?: string;
  referencePoolHref?: string;
  importAuditHref?: string;
};

export function MonthlyPaymentsShell({
  active,
  children,
  operationsHref = '/monthly-payments/locations',
  referencePoolHref = '/monthly-payments/reference-pool',
  importAuditHref = '/monthly-payments/import-audit',
}: MonthlyPaymentsShellProps) {
  return (
    <main className="hamba-ops payments-page-scroll min-h-screen overflow-y-auto text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <MonthlyPaymentsNavigation
          active={active}
          operationsHref={operationsHref}
          referencePoolHref={referencePoolHref}
          importAuditHref={importAuditHref}
        />

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </div>
    </main>
  );
}
