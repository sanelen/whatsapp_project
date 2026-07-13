# Security baseline

This project uses a deliberately small security model: local development may use the
non-production auth bypass, while every Preview and Production request requires a
Supabase session for an explicitly allowed Google account.

## Authentication boundary

- `src/proxy.ts` performs the fast route/API gate and returns `403` for an
  authenticated but unapproved account.
- `src/lib/auth/dal.ts` repeats the allowlist check before server-side data access.
- `src/app/auth/callback/route.ts` rejects and signs out an unapproved OAuth user.
- The login UI exposes Google OAuth only. Email/password signup is not an application
  login path.
- `NEXT_PUBLIC_LOCAL_AUTH_BYPASS` is ignored when `NODE_ENV=production`.
- `AUTH_ALLOWED_EMAILS` is a server-only, comma-separated allowlist. It must be set
  in Vercel Preview and Production; production fails closed when it is absent.

Do not prefix the allowlist or any secret with `NEXT_PUBLIC_`. Supabase publishable
keys are intentionally public; the service-role key and provider API keys are not.

## Repository and deployment rules

- Keep `.env*`, private keys, OAuth tokens, bank exports, and downloaded customer
  files untracked. `.gitignore` covers `.env*` and `*.pem`.
- Store runtime secrets as Vercel Sensitive environment variables. Scope them only to
  the environments that need them.
- Do not paste secret values into issues, handovers, screenshots, test fixtures, build
  logs, or commit messages.
- Treat committed screenshots and operational documentation as publishable data. The
  repository is currently public, so screenshots containing real references, names,
  amounts, bank evidence, or email addresses must be redacted or removed before
  commit.
- If a real secret is ever committed, deleting the file in a later commit is not
  enough: rotate the credential first, then purge it from Git history.

## 2026-07-13 baseline scan

- GitHub secret scanning returned no alerts, and no secret-like files are tracked.
- Vercel stores all provider keys and the Supabase service-role key as encrypted,
  server-only variables. The Supabase URL and publishable/anon keys are the only
  intentionally browser-visible values.
- Supabase security advisors reported no error-level database findings. Several
  service-only tables have RLS enabled with no client policies, and leaked-password
  protection is disabled; the password warning is lower priority while Google-only
  login is enforced.
- `npm audit --omit=dev` reports one remaining high advisory in `xlsx@0.18.5`. The npm
  package has no patched release. Replace or isolate that parser before accepting
  untrusted Excel workbooks; CSV/PDF bank imports do not depend on it.
- `ws` and PostCSS are overridden to patched transitive releases and must be verified
  by the normal test/build suite when dependencies change.

## Lightweight recurring check

Run before a release and monthly thereafter:

```bash
git ls-files | rg -i '(\.env|credential|secret|token|private.key|\.pem$)'
npm audit --omit=dev
npm test
npm run typecheck
npm run build
```

Also review GitHub secret-scanning alerts, Supabase security advisors, Vercel runtime
logs, and the names/scopes (never pasted values) of Vercel environment variables.
