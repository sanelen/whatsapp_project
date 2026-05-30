# Project Handoff — HambaCustomerService (whatsapp_project)

**Last updated:** 2026-05-30
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
2. **Do AUT-14 first:** add the 8 env vars from `.env.local` to Vercel (Production),
   then redeploy and verify chat/KB/workspace work in prod.
3. **Resolve AUT-15:** confirm with the owner whether `SAWhatsApp/platform` was meant
   to be dropped; update AUT-5/7/8/12 accordingly.
4. **Then AUT-9:** apply/verify the tenant-register migration on live Supabase and
   unify the two schema files.
5. Reference key files: `src/app/api/chat/route.ts` (provider routing + KB grounding),
   `src/lib/supabase.ts` (client + settings), `supabase/*.sql` (schema).
