# Suggested Commands

All via npm. Every `pre*` hook runs `check:runtime` first (Node≥22, npm≥10) — a failing
runtime guard blocks dev/build/start/lint with a clear error.

- `npm run dev` — dev server. **NOTE: uses webpack** (`next dev --webpack`), not Turbopack,
  despite Turbopack config. `NODE_ENV=development`. Serves on :3000.
- `npm run build` — `NODE_ENV=production next build`.
- `npm run start` — prod server (`next start`).
- `npm run lint` — `eslint` (flat config `eslint.config.mjs`).
- `npm run typecheck` — `tsc --noEmit --incremental false`.
- `npm test` — `node --import tsx --test 'src/**/*.test.ts' 'src/**/*.test.tsx'`.
  Test files live next to source as `*.test.ts(x)`.
- `npm run check:runtime` — standalone runtime guard.
- `npm run audit:vector-pipeline` — end-to-end KB/vector pipeline audit.
- `npm run transcribe -- "<file>"` — transcribe owner voice notes into `docs/voice-notes/`.

## Project scripts
- `./start-all.sh`, `./health-check.sh` are legacy from the old two-app layout and still
  reference removed `SAWhatsApp/` / `SAChatbot/` paths. Prefer root `npm run dev`.

## Serena / Codex
- Serena is registered for Codex via `serena setup codex`.
- Project config: `.serena/project.yml`; shared memories: `.serena/memories/*.md`.
- Local-only Serena files are ignored by `.serena/.gitignore`: `.serena/cache/`,
  `.serena/project.local.yml`.
- Useful checks: `serena project health-check`, `serena project index`,
  `serena memories check`.

## Env / port gotcha (from HANDOFF)
- A Hermes/WhatsApp bridge daemon has been seen auto-binding `127.0.0.1:3000`, shadowing
  Next (which may only listen on IPv6/all-interfaces). If `localhost:3000` serves
  "Cannot GET", check: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `launchctl list | grep -i hermes`.

## Tooling availability (as of last handoff)
- `gh` CLI: **NOT installed** (push via git, no programmatic PRs).
- Vercel CLI present (~v54) but **not logged in**; Vercel MCP can read but **not write**
  project settings (env vars must be set via dashboard).
- Supabase CLI via `npx`, not logged in. Supabase **MCP** is connected (cannot read
  secret service_role key).

## macOS (Darwin) note
- BSD coreutils. Prefer `sed -i ''` form, `grep -E`. Use `lsof`/`launchctl` per above.
