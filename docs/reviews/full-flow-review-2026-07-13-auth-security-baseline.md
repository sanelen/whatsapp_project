# Auth security baseline full-flow review — 2026-07-13

**Verdict: ship with two documented caveats.** The approved-account boundary is
enforced at the callback, request proxy, and server data layer; local development
remains usable. Repository privacy and the unpatched Excel parser need separate owner
decisions.

## Target

- Scope: Google sign-in → workspace chooser → protected page/API access.
- Trigger: pre-release security hardening.
- Change: Google-only login, exact server-side email allowlist, fail-closed production
  behavior, baseline response headers, dependency overrides, and security runbook.

## Review lenses

### Architecture and flow

The flow has no phantom step: `/login` starts Google OAuth, `/auth/callback` validates
the returned identity, `/` presents the existing chooser, and protected routes repeat
authorization through both proxy and DAL. `AUTH_ALLOWED_EMAILS` is one server-side
configuration source, not duplicated in code or the database. Local bypass remains
strictly non-production.

### QA and testing

- ✅ 134 unit/source-contract tests pass, including allowlist normalization, provider
  enforcement, production fail-closed behavior, and development fallback.
- ✅ TypeScript, ESLint (0 errors), and the 29-route production build pass.
- ✅ Browser: an unauthenticated production-mode request redirects to the Google-only
  login page; protected API returns `401`.
- ✅ Local development on port 3001 remains directly accessible under the configured
  non-production bypass.
- ⚠️ A second real Google identity was present in Supabase before this change. The new
  app boundary denies it, but Supabase may retain its user record until separately
  removed by an administrator.

### UI and accessibility

The login screen is now a single, clearly named command with an alert region for
errors. Removing the alternative form reduces ambiguity and keyboard stops. The
existing powder-blue chooser is unchanged. No new color-only state or multi-step UI
was introduced.

### Roadmap fit

This is in scope as a cross-cutting production control and is recorded in FR-5.4,
ARCHITECTURE, and `docs/SECURITY.md`. No existing Linear item owns recurring security
review, so a gap is recorded in `docs/LINEAR-SYNC.md`.

## Tensions

- QA and architecture support release, but repository privacy is a governance issue,
  not a code-test issue: a public repository can reveal operational screenshots and
  business metadata without triggering secret scanning.
- Authentication is Google-only in the app, while Supabase's leaked-password advisor
  remains enabled as a warning. That warning is low priority unless password login is
  reintroduced.

## Prioritized follow-ups

1. Decide whether to make the GitHub repository private. If it stays public, remove or
   redact real operational screenshots and scrub any sensitive history before sharing.
2. Replace or isolate `xlsx@0.18.5` before accepting untrusted Excel workbooks; it is
   the only remaining production `npm audit` high advisory.
3. Remove the unapproved historical Supabase user and revoke its sessions if the owner
   wants the identity record gone as well as blocked at the app boundary.
4. Add a small authenticated browser test for approved vs. denied Google identities
   when a safe test tenant is available.

## Screenshot checklist

- [x] Google-only login renders at production-mode `/login`.
- [x] Unauthenticated `/` redirects to `/login`.
- [x] Local development bypass still opens `/` directly.
- [ ] Approved Google account completes OAuth on the deployed release.
- [ ] Unapproved Google account visibly returns the access-denied message on the
  deployed release.
