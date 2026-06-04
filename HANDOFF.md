# Project Handoff — HambaCustomerService (whatsapp_project)

**Last updated:** 2026-06-04, local auth bypass + KB text-source cleanup
**Repo:** github.com/sanelen/whatsapp_project
**Local folder:** `/Users/macdaddy/Documents/DEV/HambaCustomerService`
**Working branch:** `sanelengcobo/aut-9-extend-supabase-schema-for-tenant-register-and-assistant`
**Production branch:** `main` (currently at `2174bde`, == working branch tip)
**Vercel project:** `whatsapp-project` (team "sanele's projects") — production **READY**
**Supabase project:** `hambatrading` (ref `ddlykzackuehdexldazv`, eu-central-1, ACTIVE_HEALTHY)
**Linear project:** WhatsApp Tenant Assistant Guardrails (team Automatemylife)

> Read this top-to-bottom to resume. The "Pick up here" section at the bottom is the
> shortest path back into the work.

---

## 1. What this project is

A Next.js 16 (App Router, Turbopack) app for Hamba Trading: a multi-tenant
organization/property chatbot workspace backed by Supabase, with a knowledge-base-
grounded reply pipeline and pluggable LLM providers (OpenAI / Anthropic / DeepSeek).

> ⚠️ **Framework caveat (see `AGENTS.md`):** this is a modified Next.js with breaking
> changes vs. stock. Read `node_modules/next/dist/docs/` before writing Next code.

---

## 2. Project structure — IMPORTANT: it changed on 2026-05-30

The repo was **flattened**. This is the single biggest thing to understand.

### Before (old `main`, commit `569efde`)
Two apps living side by side under the repo root:
```
.gitignore
SAChatbot/      ← a Next.js app (package.json, src/, supabase/, ...)
SAWhatsApp/     ← Twilio WhatsApp platform + docs
  platform/                     (Next.js app: Twilio webhook, assistant pipeline)
  SESSION_HANDOFF.md
  whatsapp-progress-tracker.html
  whatsapp-system-design.html
```

### Now (current `main`, commit `2174bde`) — the flattened structure WE USE
The old **`SAChatbot/` app was promoted to the repo root**, and **`SAWhatsApp/` was
deleted entirely**.
```
package.json            ← "next": "16.2.6", engines.node "22.x"
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs
AGENTS.md  CLAUDE.md  README.md
src/
  app/
    layout.tsx  page.tsx  globals.css  favicon.ico
    api/
      chat/route.ts              ← LLM chat (OpenAI/Anthropic/DeepSeek) + KB grounding
      history/route.ts
      models/route.ts            ← model catalog + live listing per provider
      settings/prompt/route.ts
      workspace/route.ts
      kb/{search,list,upload,update,delete}/route.ts
    organizations/[organizationId]/page.tsx
    properties/[propertyId]/page.tsx
    properties/[propertyId]/chatbot/page.tsx
  lib/
    supabase.ts                  ← createClient + getPromptSettings; reads NEXT_PUBLIC_* + service role
    types.ts  workspace.ts  workspace-routes.ts
  components/workspace/workspace-route.tsx
supabase/
  schema.sql                     ← customers, conversations, messages, knowledge_base, prompt_settings, ...
  workspace-schema.sql           ← organizations, properties, property_chatbot_settings
scripts/                         ← check-runtime.mjs (predev/prebuild guard: Node >=22, npm >=10)
data/  public/
health-check.sh  start-all.sh
```

### What was REMOVED in the flatten (and is NOT in current `main`)
- The entire **`SAWhatsApp/platform`** Twilio WhatsApp app — inbound webhook
  (`app/api/webhooks/twilio/route.ts`), `lib/assistant.ts` reply pipeline, etc.
- `SAWhatsApp/SESSION_HANDOFF.md` and the two HTML tracker/design pages.
- ✅ Confirmed: **no Twilio/webhook code exists anywhere in the new `src/`.**

To recover any of it: `git show 569efde:SAWhatsApp/platform/<path>`.
This removal is tracked in **AUT-15** (decision needed — see below).

---

## 3. What we did this session (2026-05-30)

All committed to `main` (and the working branch — they're at the same tip).

| # | Change | Commit |
|---|--------|--------|
| 1 | **Fixed production deploy** — fast-forwarded `main` `569efde → 2174bde` so prod builds the flattened structure (was failing: *"No Next.js version detected"*) | (ff merge) |
| 2 | **DeepSeek API key env fallback** — `resolveApiKey()` in `chat/route.ts` + `models/route.ts` now read `DEEPSEEK_API_KEY` (was silently falling through to `OPENAI_API_KEY`) | `2deaca8` |
| 3 | **Pinned Node** `engines.node` `">=22"` → `"22.x"` (stops Vercel auto-upgrade warning) | `2174bde` |
| 4 | **Created `.env.local`** (git-ignored) with all 8 vars, **live-validated** (all HTTP 200) | (local only) |
| 5 | **Wrote this `HANDOFF.md`** | (this file) |

**Why the deploy was broken:** Vercel builds prod from `main`; `main` still had the
old nested layout with no root `package.json`, so Next.js couldn't be detected. The
flattened structure only existed on the feature branch. The fast-forward fixed it.
Latest prod deploy `dpl_7DreGY6e55NL3mmbiK1eqZFfnZbC` = **READY**.

---

## 4. Environment variables

`.env.local` (repo root, **git-ignored** via `.env.*`) — local only, validated live.

| Variable | Source | Notes |
|----------|--------|-------|
| `APP_URL` | default | `http://localhost:3000` (set to prod URL on Vercel) |
| `ANTHROPIC_API_KEY` | provided | valid |
| `OPENAI_API_KEY` | provided | valid |
| `DEEPSEEK_API_KEY` | provided | valid; base URL auto-defaults to `https://api.deepseek.com/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase MCP | `https://ddlykzackuehdexldazv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase MCP | `sb_publishable_...` (preferred by app) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase MCP | legacy JWT (fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | provided | role=service_role; **server only**, bypasses RLS |

- Key-resolution order in code: DB setting (`prompt_settings.llm_api_key`) > env var.
- ⚠️ **These are NOT on Vercel yet.** `.env.local` does not deploy. Prod app cannot
  reach Supabase/LLMs until they're added in Vercel settings → **AUT-14**.

---

## 5. Linear tickets

Created/updated this session (project: WhatsApp Tenant Assistant Guardrails):

| Ticket | Status | What |
|--------|--------|------|
| **AUT-9** | In Review | Original schema issue. Added a progress comment; **left In Review** (schema unification + migration not done). |
| **AUT-13** | ✅ Done | Record of this session's deploy fix + env + DeepSeek/Node config. |
| **AUT-14** | Todo (Urgent) | **Set Vercel production env vars** — next concrete action. |
| **AUT-15** | Todo (High) | **Reconcile removed `SAWhatsApp/platform`** vs AUT-5/7/8/12 (decision needed). |
| **AUT-16** | ✅ Done | Supabase Auth shipped and dashboard wiring completed; follow-up logout/auth-test UX added locally. |

Pre-existing, now affected by the flatten (referenced in AUT-15):
- AUT-5 (analyze/stabilize WhatsApp platform), AUT-7 (greeting/intake),
  AUT-8 (human handoff / bot pause), AUT-12 (e2e Twilio validation) — all point at
  `SAWhatsApp/platform` paths that no longer exist on `main`.
- AUT-11 (seed knowledge base) — Todo, structure-agnostic.

---

## 6. Open items / not done

1. **AUT-14 — Vercel prod env vars.** Highest priority; app is deployed but blind to
   Supabase/LLMs without it. Vercel MCP can't write settings — use dashboard or `vercel env`.
2. **AUT-15 — SAWhatsApp decision.** Was dropping the Twilio platform intentional? If
   yes, re-scope/close AUT-5/7/8/12; if no, port the webhook+assistant into `src/`.
3. **AUT-9 schema work.** Unify `supabase/schema.sql` + `workspace-schema.sql`; the
   tenant-register migration is likely **not applied** to live Supabase (earlier
   integration tests 4 pass / 4 fail; `CREATE TABLE IF NOT EXISTS` skips pre-existing
   `organizations`/`properties`).
4. **Schema verification** vs live `hambatrading` — offered, not run.
5. **E2E smoke test** (`npm run dev` + real chat request) — offered, not run.
6. **`HANDOFF.md` commit** — this file may still be uncommitted; commit + push if desired.
7. **(Cosmetic)** Vercel dashboard Node version still says 24.x; build now uses 22.x
   from `engines` and logs an informational notice. Set dashboard to 22.x to silence.

---

## 7. Tooling / environment notes

- **`gh` CLI: NOT installed.** PRs were not creatable programmatically; pushes done via git.
- **Vercel CLI**: present (v54.x) but **not logged in**.
- **Supabase CLI**: available via `npx` but **not logged in**. The Supabase **MCP** IS
  connected (used to pull URL + publishable/anon keys; cannot read the secret service_role).
- **Vercel MCP**: connected; can read projects/deployments/logs but **cannot write
  project settings** (no env-var write tool).
- Build/runtime guard: `scripts/check-runtime.mjs` requires Node ≥22, npm ≥10
  (runs on predev/prebuild/prestart/prelint).
- Scripts: `npm run dev` (webpack), `build`, `start`, `lint`, `typecheck`, `test`
  (node --test on `src/**/*.test.ts(x)`).

---

## 8. Pick up here (fastest resume path)

1. `cd /Users/macdaddy/Documents/DEV/HambaCustomerService` — confirm branch + clean tree.
2. **Commit/push the current auth UX follow-up if desired:** files changed after the last
   commit are listed in §10 below (`/auth-test`, login messages, tests, and this handoff).
3. **Do AUT-14 next:** add the 8 env vars from `.env.local` to Vercel (Production),
   then redeploy and verify chat/KB/workspace work in prod.
4. **Resolve AUT-15:** confirm with the owner whether `SAWhatsApp/platform` was meant
   to be dropped; update AUT-5/7/8/12 accordingly.
5. **Then AUT-9:** apply/verify the tenant-register migration on live Supabase and
   unify the two schema files.
6. Reference key files: `src/app/api/chat/route.ts` (provider routing + KB grounding),
   `src/lib/supabase.ts` (client + settings), `supabase/*.sql` (schema).

---

## 9. Authentication (added/completed 2026-05-30, AUT-16)

Supabase Auth — **Google OAuth + email/password**, open sign-up, gating everything
except `/login` and `/auth/*`. Code shipped to `main` in earlier AUT-16 work; dashboard
OAuth wiring was completed this session; a follow-up auth test/logout page and clearer
login-failure UX are currently local/uncommitted.

### Architecture (Next 16 `proxy`, NOT `middleware`)
- `src/proxy.ts` — refreshes the Supabase session each request; unauthenticated →
  `/login?redirect=…` for pages, `401` for `/api/*`; logged-in users on `/login` → `/`.
- `src/lib/supabase/{env,client,server,proxy}.ts` — SSR clients (`@supabase/ssr` added).
- `src/lib/auth/dal.ts` — `getUser()` (cached), `requireUser()`, `getApiUser()`.
- `src/lib/auth/api-guard.ts` — `requireApiAuth()` 401 helper; applied to all 10 API
  route files (14 handlers).
- `src/app/login/{page,login-form}.tsx` — the login form (Google + email/password +
  sign-up toggle).
- `src/app/auth/callback/route.ts` — OAuth/email code → session exchange.
- `src/app/auth/signout/route.ts` — POST sign-out.
- `src/app/auth-test/page.tsx` — protected smoke-test page that displays signed-in email
  and posts to `/auth/signout`.
- `src/lib/auth/login-messages.ts` — normalized user-facing login/OAuth failure messages.
- `workspace-route.tsx` — top-nav shows signed-in email + Sign out.

### Dashboard setup completed
- Google Cloud project: `Hamba Customer Service` (`hamba-customer-service`).
- Google Auth Platform: External, app name `Hamba Customer Service`, support/developer
  contact `info.hambatrading@gmail.com`.
- Google OAuth web client: `Hamba Web`; authorized redirect URI exactly:
  `https://ddlykzackuehdexldazv.supabase.co/auth/v1/callback`.
- Google Auth Platform remains in **Testing**; test user added:
  `info.hambatrading@gmail.com`.
- Supabase Auth → Sign In / Providers → Google: enabled with the OAuth client ID/secret.
  **Do not print or commit the client secret.**
- Supabase Auth → URL Configuration:
  - Site URL: `https://hambatrading.co.za`
  - Redirect allow-list:
    - `http://localhost:3000/**`
    - `https://hambatrading.co.za/**`
    - `https://whatsapp-project-kappa.vercel.app/**`

### Login/logout UX follow-up (local, uncommitted)
- Failed email/password or OAuth attempts stay on `/login` and show a clear user-facing
  message. Unknown/unregistered users are directed to use **Sign up**.
- The login form now uses `method="post"` as the no-JS/pre-hydration fallback so dummy
  or real passwords are not leaked into the URL if React has not hydrated yet.
- We intentionally do **not** auto-create a user after failed sign-in; that would be a
  surprising/security-sensitive UX. The explicit Sign up path creates the Supabase user.
- New protected `/auth-test` page verifies session + logout without touching workspace data.

### Verified locally this session
- Supabase connector: project `hambatrading` / `ddlykzackuehdexldazv` is `ACTIVE_HEALTHY`.
- Supabase dashboard: Google provider shows `Enabled`.
- Supabase dashboard: Site URL + all 3 redirect URLs are present.
- Local smoke:
  - `/` → 307 `/login`
  - `/login` → 200
  - unauthenticated `/api/models` → 401
  - Google sign-in as `info.hambatrading@gmail.com` → Supabase callback → authenticated
    workspace → Sign out → `/login`
- Manual browser visual walkthrough completed in Chrome:
  - Opened `http://localhost:3000/auth-test` while signed out → redirected to
    `/login?redirect=%2Fauth-test`.
  - Submitted dummy email/password (`not-registered@example.com` / fake password) →
    stayed on `/login?redirect=%2Fauth-test`; displayed the red
    "Login failed... choose Sign up" message; password did **not** appear in the URL
    after the `method="post"` fallback patch.
  - Clicked "Continue with Google" → Google account chooser → selected
    `info.hambatrading@gmail.com` → returned to `/auth-test`.
  - `/auth-test` showed `You are signed in` and signed-in email
    `info.hambatrading@gmail.com`.
  - Clicked "Sign out and return to login" → returned to `/login`.
- Local environment note from visual testing:
  - A Hermes gateway/WhatsApp bridge was auto-binding `127.0.0.1:3000` and serving
    `Cannot GET ...`, which intercepted Chrome's `localhost:3000` requests while Next was
    only reachable on the IPv6/all-interface listener. It was stopped for the visual test.
    At handoff, `launchctl list | grep -i hermes` and `lsof -nP -iTCP:3000 -sTCP:LISTEN`
    returned no entries.
- Final checks rerun at end of session:
  - `npm run typecheck` passed (rerun alone after a parallel build/typecheck race touched
    `.next/types`)
  - `npm test` passed, **23/23** (0 fail, 0 skipped)
  - `npm run build` passed; Next.js generated 18 static pages and includes dynamic
    `/auth-test`, `/auth/callback`, `/auth/signout`, and API routes.

### Remaining auth dependency
Production auth still depends on **AUT-14**: add the required Vercel production env vars
from `.env.local`, then redeploy. OAuth/dashboard wiring is done; prod still needs its
runtime environment before Supabase/LLM-backed features are reliable.

### Trade-off noted
Each API request runs its own `auth.getUser()` in addition to the proxy's check (defense
in depth). Can be reduced to proxy-only `/api/*` gating later if latency matters.

---

## 10. End-of-session local changes (not committed yet)

Current dirty tree at handoff:
```
 M HANDOFF.md
 M src/app/login/login-form.tsx
 M src/app/workspace-pages.test.tsx
?? src/app/auth-test/
?? src/lib/auth/login-messages.test.ts
?? src/lib/auth/login-messages.ts
```

What those changes do:
- `src/app/auth-test/page.tsx` — protected standalone auth/logout smoke page.
- `src/lib/auth/login-messages.ts` — maps Supabase/OAuth errors to friendlier login UX.
- `src/lib/auth/login-messages.test.ts` — unit coverage for login error messages.
- `src/app/login/login-form.tsx` — uses friendly error mapping and tells first-time users
  to use Sign up.
- `src/app/workspace-pages.test.tsx` — adds a route contract test for `/auth-test` without
  importing server-only auth code.
- `HANDOFF.md` — this updated handoff.

Suggested commit message:
```
Add auth smoke page and login failure messaging
```

---

## 11. Next scoped work — AUT-17 (created 2026-05-30)

Created Linear issue **AUT-17**:
`Wire document upload to 768-dim vector retrieval and harden assistant pipeline`

Why it exists:
- Current chat route already passes `temperature` to providers and fetches KB context.
- Current KB upload/search still uses plain `knowledge_base` rows and `ilike` text search.
- Supabase schema does **not** yet include pgvector, `vector(768)`, document chunks,
  embedding metadata, or a vector-match RPC.
- The next milestone is to make document upload -> chunking -> 768-dim embedding ->
  vector retrieval -> grounded chat work end-to-end.

Reference UI inspected in Chrome:
- ChatNexus chatbot overview/test page:
  `https://app.chatnexus.io/dashboard/chatbots/chatbot/overview/7e5c1268-b42e-44e6-9fb9-5dc30b0d4d88`
- Useful patterns: left chatbot navigation, chatbot test panel, right-side
  Instructions/Settings drawer, temperature/top-k/model controls, and Knowledge Base
  tabs for Overview, File, Text, Website, API, Database, and Tools.

Implementation notes for AUT-17:
- Audit race conditions around duplicate saves/uploads, stale React state, slow network
  retries, streaming cancellation, and rapid tab changes.
- Add Supabase migration for pgvector + 768-dim chunk embeddings, scoped by
  organization/property/chatbot as appropriate.
- Replace `/api/kb/search` text matching with vector similarity retrieval.
- Wire `/api/chat` to retrieved chunks with top-k/context limits and safe fallback.
- Add UI for upload/indexing status and retrieval-preview testing.
- Verify with `npm run typecheck`, `npm test`, and `npm run build`.

### AUT-17 implementation started

- Added `knowledge_vectors` pgvector migration with `embedding vector(768)`, metadata,
  source type/id/name, chunk fields, HNSW cosine index, RLS, and `match_knowledge_vectors`.
- Applied the migration to live Supabase project `hambatrading` / `ddlykzackuehdexldazv`.
- Added OpenAI `text-embedding-3-small` indexing with `dimensions: 768`.
- `/api/kb/upload` and `/api/kb/update` now save KB rows and attempt vector indexing.
- `/api/kb/search` now tries vector retrieval first and falls back to existing text search.
- `/api/chat` labels retrieved KB context as vector vs text fallback.
- Knowledge Base UI now has ChatNexus-style tabs, overview cards, file/text indexing,
  retrieval preview, and placeholder metadata-ready tabs for Website/API/Database/Tools.
- Verified live vector smoke test: 1 chunk indexed at 768 dims; vector query returned the
  smoke source with similarity `0.517`; smoke KB row and test auth user were cleaned up.
- Checks passed: `npm test` 26/26, `npm run typecheck`, `npm run lint`, `npm run build`.

### AUT-17 update — 2026-06-04

- Removed the legacy Knowledge Base block from the UI and switched the Text tab to a
  stable overwrite flow keyed by `property:<propertyId>:text`.
- `knowledge_base` now stores `source_type`, `source_id`, `source_name`, and `metadata`
  alongside the content; vector rows are refreshed when Text overwrite is used.
- Added a **local browser-testing auth bypass** controlled by
  `NEXT_PUBLIC_LOCAL_AUTH_BYPASS=true` in `.env.local`.
  - Safety: it only activates outside production builds.
  - Behavior: `src/proxy.ts`, `src/lib/auth/dal.ts`, and the API auth guard all treat
    requests as signed in with a local mock user.
  - UI: workspace/auth-test show the bypass state and suppress real sign-out flows.
  - Use case: lets Browser/in-app automation test protected routes on `localhost`
    without getting trapped at `/login`.
- Replaced the property-workspace sidebar letter badges with **Lucide** icons in
  `src/components/workspace/workspace-route.tsx`.
  - Icon mapping: Overview=`LayoutDashboard`, Chatbot=`Bot`, Agents=`Users`,
    Conversations=`MessageSquareText`, Knowledge Base=`BriefcaseBusiness`,
    Analytics=`BarChart3`, Usage=`Gauge`, Settings=`Settings2`, Deploy=`Rocket`.
  - Styling uses `currentColor` and neutral container states so a future dark-mode
    pass can theme the nav without changing the icon structure.
- Added an **Overview analytics scaffold** for the property chatbot workspace.
  - New route: `src/app/api/analytics/overview/route.ts`
  - New analytics contract: `src/lib/overview-analytics.ts`
  - New tests: `src/lib/overview-analytics.test.ts`
  - UI now includes:
    - ChatNexus-style Overview header and two 3-card metric rows
    - filter dropdown for `24 Hours`, `7 Days`, `30 Days`, `Lifetime`
    - channel toggles for `All channels`, `Web widget`, `WhatsApp`, `API`
  - Metric mapping for the real system:
    - `Users` = unique `fingerprintId` count
    - `Tokens` = prompt + completion + cached token totals
    - `Messages` = tracked interaction/message totals
    - usage row = characters/tokens/messages against plan caps
  - Phase plan:
    - **Phase 1 (done):** cached mock data scaffold, fingerprint-ready schema contract,
      browser-visible UI.
    - **Phase 2:** replace the mock event reader with real Supabase reads using the same
      `propertyId + window + channel` filter contract.
    - **Phase 3:** seed/live backfill, then revalidate cached analytics on writes.
  - Caching:
    - Uses a cached server helper (`unstable_cache`) for the summary layer.
    - Client keeps per-filter results in local state so tab/filter revisits do not
      re-fetch the same overview payload during the session.
  - Application/test requirements captured:
    - keep `fingerprintId` on analytics events from the start
    - ensure filter inputs stay DB-ready (`propertyId`, `window`, `channel`)
    - preserve automated coverage for aggregation and filter logic
- After flipping the env var, restart `npm run dev`.

### Skills / connectors used in this phase

- Next.js local docs (`node_modules/next/dist/docs/...`) for `proxy` + auth guidance.
- Supabase connector for live schema confirmation/migration application.
- Linear connector for AUT-17 status tracking and requirement logging.
