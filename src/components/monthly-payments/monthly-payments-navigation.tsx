import Link from 'next/link';
import {
  Building2,
  ChevronDown,
  FileCheck2,
  LayoutDashboard,
  ReceiptText,
  Settings2,
} from 'lucide-react';

export type MonthlyPaymentsNavigationSection =
  | 'dashboard'
  | 'locations'
  | 'units'
  | 'reference-pool'
  | 'import-audit'
  | 'import-configuration'
  | 'room-manager';

type MonthlyPaymentsNavigationProps = {
  active: MonthlyPaymentsNavigationSection;
  operationsHref?: string;
  referencePoolHref?: string;
  importAuditHref?: string;
};

const navItems = [
  { id: 'overview', label: 'Overview', href: '/monthly-payments', icon: LayoutDashboard },
  { id: 'reconcile', label: 'Reconcile', href: '/monthly-payments/reconcile', icon: ReceiptText },
  { id: 'properties', label: 'Properties', href: '/monthly-payments/locations', icon: Building2 },
] as const;

export function MonthlyPaymentsNavigation({
  active,
  referencePoolHref = '/monthly-payments/reconcile',
  importAuditHref = '/monthly-payments/import-audit',
}: MonthlyPaymentsNavigationProps) {
  const activeId =
    active === 'dashboard'
      ? 'overview'
      : active === 'units' || active === 'reference-pool'
        ? 'reconcile'
        : active === 'locations' || active === 'room-manager'
          ? 'properties'
          : null;
  const isAdminActive = active === 'import-audit' || active === 'import-configuration';

  function itemHref(itemId: (typeof navItems)[number]['id'], defaultHref: string) {
    if (itemId === 'reconcile') return referencePoolHref;
    if (itemId === 'properties') return '/monthly-payments/locations';
    return defaultHref;
  }

  return (
    <aside className="hamba-ops__sidebar hamba-payments-nav self-start border p-3.5 text-white lg:sticky lg:top-0 lg:min-h-screen lg:w-[224px] lg:shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">
        Hamba operations
      </p>
      <p className="hamba-display mt-1 text-[23px]">Payments</p>
      <p className="mt-1 text-[11.5px] leading-4 text-slate-300">
        Portfolio ledger
      </p>

      <nav className="hamba-ops__nav mt-4 space-y-1.5" aria-label="Monthly payments">
        {navItems.map((item) => {
          const isActive = item.id === activeId;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={itemHref(item.id, item.href)}
              aria-current={isActive ? 'page' : undefined}
              className={`block border px-2.5 py-2 transition ${
                isActive
                  ? 'border-sky-300 bg-sky-400/20 text-white'
                  : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-sky-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center ${
                    isActive ? 'bg-sky-300/20 text-sky-100' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Icon size={14} />
                </span>
                <p className="text-[12.5px] font-semibold">{item.label}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      <details className="hamba-payments-admin mt-3 border border-slate-800 bg-slate-900/60" open={isAdminActive || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11.5px] font-semibold text-slate-300">
          Imports &amp; audit
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-800 p-1.5">
          <Link
            href={importAuditHref}
            aria-current={active === 'import-audit' ? 'page' : undefined}
            className={`flex items-center gap-2 px-2.5 py-2 text-[11.5px] font-semibold transition ${
              active === 'import-audit' ? 'bg-sky-400/20 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileCheck2 size={14} />
            Import audit
          </Link>
          <Link
            href="/monthly-payments/import-configuration"
            aria-current={active === 'import-configuration' ? 'page' : undefined}
            className={`flex items-center gap-2 px-2.5 py-2 text-[11.5px] font-semibold transition ${
              active === 'import-configuration' ? 'bg-sky-400/20 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings2 size={14} />
            Configuration
          </Link>
        </div>
      </details>

      <div className="hamba-ops__quick-links mt-4 border border-slate-800 bg-slate-900/80 p-3 lg:mt-auto">
        <p className="text-[10.5px] uppercase tracking-[0.16em] text-slate-400">Quick links</p>
        <div className="mt-2.5 flex gap-2">
          <Link href="/" className="flex-1 bg-white px-3 py-1.5 text-center text-[12.5px] font-semibold text-slate-950 transition hover:bg-sky-100">
            Home
          </Link>
          <Link href="/property-assistance" className="flex-1 border border-slate-700 px-3 py-1.5 text-center text-[12.5px] font-semibold text-white transition hover:border-sky-300 hover:text-sky-100">
            Chatbox
          </Link>
        </div>
      </div>
    </aside>
  );
}
