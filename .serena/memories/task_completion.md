# Task Completion Checklist

Run all of these from repo root before considering a coding task done (the order the
project has used and that passes cleanly):

1. `npm run typecheck`  — `tsc --noEmit`, strict.
2. `npm test`           — `node --test` via tsx; expect all green (currently 40/40).
3. `npm run lint`       — eslint flat config.
4. `npm run build`      — production build must succeed (catches Next 16 / App Router issues
   that typecheck misses).

Notes:
- Run `typecheck` **alone**, not racing a parallel `build`, to avoid a `.next/types`
  write race that has produced spurious failures.
- Each command's `pre*` hook runs `check:runtime` first — ensure Node 22.x / npm ≥10.
- For KB/retrieval changes, also run `npm run audit:vector-pipeline` when env/API access is
  available; latest known audit was 0 findings / 32 checks.
- For Supabase schema changes: add a migration under `supabase/migrations/` (timestamped)
  and apply to live `hambatrading` (ref `ddlykzackuehdexldazv`) via Supabase MCP/CLI;
  verify with a smoke query. `schema.sql` + `workspace-schema.sql` are not yet unified.
- `gh` is not installed and Vercel/Supabase CLIs are not logged in — push via git; set
  Vercel prod env vars via dashboard (AUT-14 still open).
