# Auth

Supabase Auth: **Google OAuth + email/password**, open sign-up. Everything is gated
except `/login` and `/auth/*`. Built on Next 16 `proxy` (NOT `middleware`).

## Flow / files
- `src/proxy.ts` — refreshes Supabase session each request. Unauthenticated: pages →
  `307 /login?redirect=…`, `/api/*` → `401`. Logged-in users hitting `/login` → `/`.
- `src/lib/supabase/{env,client,server,proxy}.ts` — `@supabase/ssr` clients.
- `src/lib/auth/dal.ts` — `getUser()` (request-cached), `requireUser()`, `getApiUser()`.
- `src/lib/auth/api-guard.ts` — `requireApiAuth()` 401 helper; applied to **all** API
  handlers (defense in depth alongside proxy).
- `src/app/login/{page,login-form}.tsx` — login form. Uses `method="post"` fallback so
  passwords aren't leaked to URL pre-hydration. Failures stay on `/login`, show a friendly
  message via `src/lib/auth/login-messages.ts`; unknown users told to use Sign up (NO
  auto-create on failed sign-in).
- `src/app/auth/callback/route.ts` — OAuth/email code → session exchange.
- `src/app/auth/signout/route.ts` — POST sign-out.
- `src/app/auth-test/page.tsx` — protected smoke page (shows email + sign-out).

## Local auth bypass (browser-testing only)
- Env `NEXT_PUBLIC_LOCAL_AUTH_BYPASS=true` in `.env.local`. Logic in `src/lib/auth/local-testing.ts`.
- **Only activates outside production builds.** `proxy.ts`, `dal.ts`, and api-guard treat
  requests as a signed-in mock user; UI suppresses real sign-out. Lets automation reach
  protected localhost routes without getting trapped at `/login`. Restart `npm run dev`
  after flipping it.

## Dashboard wiring (done)
- Google OAuth redirect URI: `https://ddlykzackuehdexldazv.supabase.co/auth/v1/callback`.
- Supabase Site URL `https://hambatrading.co.za`; redirect allow-list includes
  `localhost:3000/**`, `hambatrading.co.za/**`, `whatsapp-project-kappa.vercel.app/**`.
- Prod auth still blocked on **AUT-14** (Vercel env vars not set).
