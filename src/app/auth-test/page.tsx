import { requireUser } from '@/lib/auth/dal';

export const metadata = {
  title: 'Auth test — Hamba',
};

export default async function AuthTestPage() {
  const user = await requireUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Auth test page
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">You are signed in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use this page to verify that protected routes, session display, and logout all work without
          touching workspace data.
        </p>

        <dl className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <dt className="font-semibold text-slate-500">Signed-in email</dt>
            <dd className="mt-1 break-all font-medium text-slate-950">
              {user.email ?? 'No email on this account'}
            </dd>
          </div>
        </dl>

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Sign out and return to login
          </button>
        </form>
      </section>
    </main>
  );
}
