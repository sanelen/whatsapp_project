import type { Metadata } from 'next';
import { ArrowRight, FileText, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { PropertyShowcase } from '@/components/public/property-showcase';

export const metadata: Metadata = {
  title: 'Hamba Trading | Durban studio rentals',
  description: 'Browse Hamba Trading studio and en-suite rentals in Berea, Newlands West, and Newlands East.',
};

const whatsappUrl =
  'https://wa.me/27812674647?text=Hello%20Hamba%20Trading%2C%20I%20need%20help%20with%20a%20property.';

const publicInformation = [
  { href: '/privacy', title: 'Privacy policy', description: 'How personal and tenant information is handled.' },
  { href: '/terms', title: 'Terms of service', description: 'Terms for rental enquiries and digital services.' },
  { href: '/data-deletion', title: 'Data deletion', description: 'How to request deletion of personal information.' },
];

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
            href="/staff"
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
              Property help starts here.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
              Ask about properties, availability, applications, payments, or tenant support on
              WhatsApp. Internal operations remain available only to approved Hamba staff.
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
              Start a conversation with Hamba Trading using our official WhatsApp number.
            </p>
          </a>
        </section>

        <PropertyShowcase />

        <section className="mt-14" aria-labelledby="public-information-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">
                Public information
              </p>
              <h2 id="public-information-heading" className="mt-2 text-2xl font-semibold text-slate-950">
                Privacy, terms, and data requests
              </h2>
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <ShieldCheck aria-hidden size={16} /> No sign-in required
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {publicInformation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[24px] border border-white/80 bg-white/80 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <FileText aria-hidden className="text-sky-800" size={21} />
                  <ArrowRight aria-hidden className="transition group-hover:translate-x-1" size={18} />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-sky-900/20 px-5 py-6 text-sm text-slate-600 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Hamba Trading</p>
          <p>Property rentals and tenant support</p>
        </div>
      </footer>
    </main>
  );
}
