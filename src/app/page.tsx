import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Building2,
  Landmark,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
} from 'lucide-react';
import Link from 'next/link';

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
    description:
      'Manage the tenant assistant, property knowledge, replies, and conversation settings.',
    eyebrow: 'Assistant workspace',
    icon: MessagesSquare,
  },
  {
    href: '/monthly-payments',
    title: 'Payments dashboard',
    description:
      'Review monthly rent, imported payments, tenant confirmations, matching, and sign-off.',
    eyebrow: 'Payments & CRM',
    icon: Landmark,
  },
  {
    href: '/admin/leases',
    title: 'Admin console',
    description:
      'Maintain property information and prepare controlled lease agreements for tenants.',
    eyebrow: 'Property administration',
    icon: Building2,
  },
];

const whatsappUrl =
  'https://wa.me/27812674647?text=Hello%20Hamba%20Trading%2C%20I%20need%20help%20with%20a%20property.';

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[#dcebf2] text-slate-950">
      <header className="border-b border-sky-900/25 bg-[#dcebf2]/95">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Hamba Trading home">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
              HT
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.18em] text-slate-950">
                Hamba Trading
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">Property management</span>
            </span>
          </Link>

          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            <LockKeyhole aria-hidden size={16} strokeWidth={2} />
            Staff sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-800">
              Hamba Trading
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.05] text-slate-950 sm:text-6xl">
              Where do you want to go?
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
              Tenants can start a WhatsApp conversation immediately. Hamba staff can open the
              assistant, payment operations, or property administration from one clear place.
            </p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="group rounded-[28px] bg-slate-950 p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] transition hover:-translate-y-1 hover:bg-sky-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-300 text-slate-950">
                <MessageCircle aria-hidden size={24} strokeWidth={2} />
              </span>
              <ArrowRight aria-hidden className="transition group-hover:translate-x-1" size={22} />
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
              Tenant help · Public
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Chat with Hamba on WhatsApp</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
              Ask about properties, availability, applications, payments, or tenant support.
            </p>
          </a>
        </section>

        <section className="mt-14" aria-labelledby="staff-workspace-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                Staff workspace
              </p>
              <h2 id="staff-workspace-heading" className="mt-2 text-2xl font-semibold text-slate-950">
                Open the tool you need
              </h2>
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <LockKeyhole aria-hidden size={15} /> Google sign-in required
            </p>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {staffDestinations.map((destination) => {
              const Icon = destination.icon;

              return (
                <Link
                  key={destination.href}
                  href={destination.href}
                  className="group flex min-h-64 flex-col rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_55px_rgba(15,23,42,0.10)] transition hover:-translate-y-1 hover:border-sky-400 hover:shadow-[0_26px_65px_rgba(14,116,144,0.18)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 sm:p-7"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
                      <Icon aria-hidden size={21} strokeWidth={2} />
                    </span>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white transition group-hover:bg-sky-800">
                      <ArrowRight aria-hidden size={18} />
                    </span>
                  </div>
                  <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
                    {destination.eyebrow}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">{destination.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{destination.description}</p>
                  <p className="mt-auto flex items-center gap-2 pt-6 text-xs font-semibold text-slate-500">
                    <LockKeyhole aria-hidden size={14} /> Approved Hamba Google account
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="border-t border-sky-900/20 px-5 py-6 text-sm text-slate-600 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Hamba Trading</p>
          <p>Property rentals, tenant support, and payment operations</p>
        </div>
      </footer>
    </main>
  );
}
