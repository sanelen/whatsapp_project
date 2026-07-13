import Link from 'next/link';
import { Building2, ClipboardList, FileCheck2, Landmark, ReceiptText, Settings2 } from 'lucide-react';

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
  { id: 'dashboard', label: 'Dashboard', href: '/monthly-payments', icon: Landmark },
  { id: 'locations', label: 'Locations', href: '/monthly-payments/locations', icon: Building2 },
  { id: 'units', label: 'Match & sign off', href: '/monthly-payments', icon: ReceiptText },
  { id: 'reference-pool', label: 'Reference pool', href: '/monthly-payments/reference-pool', icon: ClipboardList },
  { id: 'import-audit', label: 'Import audit', href: '/monthly-payments/import-audit', icon: FileCheck2 },
  { id: 'import-configuration', label: 'Import configuration', href: '/monthly-payments/import-configuration', icon: Settings2 },
] as const;

export function MonthlyPaymentsNavigation({
  active,
  operationsHref = '/monthly-payments/locations',
  referencePoolHref = '/monthly-payments/reference-pool',
  importAuditHref = '/monthly-payments/import-audit',
}: MonthlyPaymentsNavigationProps) {
  const activeId = active === 'room-manager' ? 'locations' : active;

  function itemHref(itemId: (typeof navItems)[number]['id'], defaultHref: string) {
    if (itemId === 'units') return operationsHref;
    if (itemId === 'reference-pool') return referencePoolHref;
    if (itemId === 'import-audit') return importAuditHref;
    return defaultHref;
  }

  return (
    <aside className="hamba-ops__sidebar hamba-payments-nav self-start border p-4 text-white lg:sticky lg:top-0 lg:min-h-screen lg:w-[248px] lg:shrink-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
        Monthly Payments
      </p>
      <h1 className="hamba-display mt-1.5 text-[25px]">Portfolio ledger</h1>
      <p className="mt-1.5 text-[12.5px] leading-5 text-slate-300">
        Collections, source records, and property operations in one place.
      </p>

      <nav className="hamba-ops__nav mt-4 space-y-2" aria-label="Monthly payments">
        {navItems.map((item) => {
          const isActive = item.id === activeId;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={itemHref(item.id, item.href)}
              aria-current={isActive ? 'page' : undefined}
              className={`block border px-3 py-2.5 transition ${
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
                <p className="text-[13px] font-semibold">{item.label}</p>
              </div>
            </Link>
          );
        })}
      </nav>

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
