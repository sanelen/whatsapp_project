import Link from 'next/link';

const appLinks = [
  {
    href: '/property-assistance',
    title: 'Chatbox',
    description:
      'Open the existing assistant workspace for organizations, properties, and tenant-facing chat flows.',
    eyebrow: 'Existing assistant',
  },
  {
    href: '/monthly-payments',
    title: 'Dashboard',
    description:
      'Enter the payments and CRM view for monthly rent tracking, reconciliation, and account visibility.',
    eyebrow: 'New view',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_34%,#e2e8f0_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <section className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Hamba operations
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Where do you want to go?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              The entry layer now splits the existing chat workspace from the dashboard so
              Hamba can move between assistant operations and monthly payments cleanly.
            </p>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-slate-50">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-200">Live now</p>
                <p className="mt-2 text-lg font-semibold">Chatbox workspace</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Next build</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">Dashboard home</p>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-12 grid gap-5 lg:grid-cols-2">
          {appLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-[30px] border border-slate-200/80 bg-white/85 p-7 shadow-[0_22px_60px_rgba(15,23,42,0.10)] transition hover:-translate-y-1 hover:border-sky-300 hover:shadow-[0_28px_70px_rgba(14,116,144,0.16)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                {link.eyebrow}
              </p>
              <div className="mt-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    {link.title}
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                    {link.description}
                  </p>
                </div>
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-lg text-white transition group-hover:bg-sky-700">
                  →
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
