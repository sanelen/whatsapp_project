# Conventions

- **TS strict everywhere.** No emit; types verified via `npm run typecheck`.
- **Imports use `@/` alias** for anything under `src/` (e.g. `@/lib/auth/dal`).
- **Tests colocated** as `*.test.ts(x)` beside source; written for `node --test` +
  `node:assert` (not Jest/Vitest). Keep tests importable without server-only code (see
  `workspace-pages.test.tsx` route-contract pattern: assert routes without importing the
  server auth module).
- **API routes** are App Router `route.ts` handlers under `src/app/api/.../route.ts`.
  Every API handler calls `requireApiAuth()` from `src/lib/auth/api-guard.ts` (returns 401)
  — auth is enforced both in `proxy` AND per-route (defense in depth).
- **Two Supabase access layers — don't conflate:**
  - `src/lib/supabase.ts` (legacy): service-role client + `getPromptSettings`; bypasses RLS,
    server-only.
  - `src/lib/supabase/{client,server,proxy}.ts`: `@supabase/ssr` clients for the auth/session flow.
- **LLM key resolution order:** DB setting `prompt_settings.llm_api_key` > provider env var.
  Each provider has its own env key; DeepSeek must read `DEEPSEEK_API_KEY` (do not fall
  through to `OPENAI_API_KEY`).
- **Workspace nav icons** use `lucide-react` with `currentColor` (dark-mode-ready); mapping
  lives in `src/components/workspace/workspace-route.tsx`.
- **KB text source** keyed by `property:<propertyId>:text`; overwrite flow refreshes vector rows.
- Do NOT print or commit secrets (service_role key, OAuth client secret). `.env.*` is git-ignored.
