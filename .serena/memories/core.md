# Core — HambaCustomerService (aka whatsapp_project / sa-chatbot)

Multi-tenant org/property **chatbot workspace** for Hamba Trading. Next.js 16 App Router
on Supabase, with KB-grounded replies and pluggable LLM providers (OpenAI / Anthropic /
DeepSeek). `package.json` name is `sa-chatbot`; repo is `github.com/sanelen/whatsapp_project`.

## ⚠️ Non-negotiable invariants
- **Modified Next.js, NOT stock.** Breaking changes vs. public docs. Before writing any
  Next code, read `node_modules/next/dist/docs/` (per `AGENTS.md` / `CLAUDE.md`).
- **Auth uses Next 16 `proxy`, NOT `middleware`.** Entry: `src/proxy.ts`. See `mem:auth`.
- **Repo was flattened (2026-05-30):** old `SAChatbot/` app promoted to root; `SAWhatsApp/`
  (Twilio WhatsApp platform) deleted entirely. No Twilio/webhook code exists in `src/`.
  Recover old code via `git show 569efde:SAWhatsApp/platform/<path>`.
- Path alias `@/*` → `./src/*`.

## Source map
- `src/app/` — App Router. `layout.tsx`, `page.tsx`, `globals.css`.
- `src/app/api/` — route handlers: `chat/`, `history/`, `models/`, `settings/prompt/`,
  `workspace/`, `analytics/overview/`, `kb/{search,list,upload,update,delete}/`,
  auth callback/signout routes live under `src/app/auth/`.
- `src/app/{organizations/[organizationId],properties/[propertyId],properties/[propertyId]/chatbot}/page.tsx`
- `src/app/{login,auth-test}/`, `src/app/auth/{callback,signout}/route.ts`.
- `src/lib/supabase.ts` — legacy `createClient` + `getPromptSettings` (service-role, reads NEXT_PUBLIC_* + service key).
- `src/lib/supabase/{env,client,server,proxy}.ts` — `@supabase/ssr` clients (auth path).
- `src/lib/auth/` — `dal.ts`, `api-guard.ts`, `login-messages.ts`, `local-testing.ts`.
- `src/lib/kb/vector.ts` — embedding/vector retrieval. `src/lib/overview-analytics.ts`.
- `src/lib/{types,workspace,workspace-routes}.ts`. `src/components/workspace/workspace-route.tsx`.
- `supabase/schema.sql` + `supabase/workspace-schema.sql` (NOT yet unified) + `supabase/migrations/`.

## Domains (read as needed)
- LLM chat + KB grounding pipeline: `mem:chat_pipeline`.
- Auth (proxy gating, SSR clients, local bypass): `mem:auth`.
- KB / pgvector retrieval (AUT-17): `mem:knowledge_base`.
- Stack/versions: `mem:tech_stack`. Commands: `mem:suggested_commands`.
- Conventions: `mem:conventions`. Done criteria: `mem:task_completion`.

## External services / status
- Supabase project `hambatrading` (ref `ddlykzackuehdexldazv`, eu-central-1).
- Vercel project `whatsapp-project`. **Prod env vars NOT set yet (AUT-14)** — `.env.local`
  is local-only, does not deploy.
- Linear: team Automatemylife, project "WhatsApp Tenant Assistant Guardrails" (AUT-*).
- Living handoff doc at repo root: `HANDOFF.md` (session-by-session log; richer than memories).
- Serena is configured for Codex. Use `mem:core` as the entrypoint, then read only the
  domain memory needed for the task to reduce token-heavy rediscovery.
