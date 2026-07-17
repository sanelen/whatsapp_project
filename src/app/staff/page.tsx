import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Building2, Home, Landmark, LogOut, MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/dal';

type StaffDestination = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
};

const staffDestinations: StaffDestination[] = [
  {
    href: '/property-assistance',
    title: 'Chatbox',
    description: 'Manage the tenant assistant, property knowledge, replies, and conversation settings.',
    eyebrow: 'Assistant workspace',
    icon: MessagesSquare,
  },
  {
    href: '/monthly-payments',
    title: 'Payments dashboard',
    description: 'Review monthly rent, imported payments, tenant confirmations, matching, and sign-off.',
    eyebrow: 'Payments & CRM',
    icon: Landmark,
  },
  {
    href: '/admin/leases',
    title: 'Admin console',
    description: 'Maintain property information and prepare controlled lease agreements for tenants.',
    eyebrow: 'Property administration',
    icon: Building2,
  },
];

export const metadata = {
  title: 'Staff workspace — Hamba',
};

export default async function StaffPage() {
  const user = await requireUser();

  return (
    <main className="min-h-screen overflow-y-auto bg-[#dcebf2] text-slate-950">
      <header className="border-b border-sky-900/25">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/staff" className="flex items-center gap-3" aria-label="Hamba staff workspace">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">HT</span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.18em]">Hamba Trading</span>
              <span className="mt-0.5 block text-xs text-slate-600">Staff workspace</span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="hidden text-xs text-slate-600 sm:inline">{user.email}</span>
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-900/20 bg-white/70 px-4 text-sm font-semibold text-slate-800">
              <Home aria-hidden size={16} /> Public website
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-lg transition hover:bg-sky-800">
                <LogOut aria-hidden size={16} /> Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-800">Protected staff area</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] text-slate-950 sm:text-6xl">Where do you want to go?</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">Choose the internal Hamba tool you need. These destinations are available only after an approved Google sign-in.</p>

        <section className="mt-12 grid gap-5 lg:grid-cols-3" aria-label="Staff tools">
          {staffDestinations.map((destination) => {
            const Icon = destination.icon;

            return (
              <Link key={destination.href} href={destination.href} className="group flex min-h-72 flex-col rounded-[28px] border border-white/80 bg-white/85 p-7 shadow-[0_20px_55px_rgba(15,23,42,0.10)] transition hover:-translate-y-1 hover:border-sky-400 hover:shadow-[0_26px_65px_rgba(14,116,144,0.18)]">
                <div className="flex items-start justify-between gap-4">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-800"><Icon aria-hidden size={21} strokeWidth={2} /></span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white transition group-hover:bg-sky-800"><ArrowRight aria-hidden size={18} /></span>
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">{destination.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">{destination.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{destination.description}</p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
