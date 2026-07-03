# Session Handover — 2026-07-03 (nightly run)

## Summary

Nightly gap-work run. Four things happened, all verified (typecheck ✓, 90/90
tests ✓, production build ✓ via the /tmp recipe):

1. **Rescued the 2026-07-02 late-day work** (coverageRate/collectionRate split,
   shared `monthly-payment-status.ts`, period-state recompute) — it was sitting
   uncommitted in the working tree. Committed to side ref
   `refs/nightly/session-2026-07-03-a` (`176e193`).
2. **Validated the dashboard improvement with real before/after screenshots**
   (see "Screenshot validation" below) and fixed a copy bug it exposed: the
   rolling-total denominator said "R 40 700,00 **matched to units**" when that
   number is the **expected** amount (`monthly-payments-hub.tsx` line ~245,
   now "expected").
3. **FR-5.3 shipped**: RLS enabled on `public.prompt_settings` + grants revoked
   from anon/authenticated. Applied to live Supabase (ddlykzackuehdexldazv) and
   committed as `supabase/migrations/20260703031500_enable_rls_prompt_settings.sql`.
   Verified live: anon → 42501 permission denied; service_role reads fine;
   advisor ERROR finding cleared. Table stores `llm_api_key`, so this mattered.
4. **NFR-2.1 units-table density pass 2 shipped** — full-page height on an
   8-room property dropped ~1670px → ~1220px; the table itself ~940px → ~600px.
   No label/behavior changes (e2e text selectors untouched); sizes, paddings,
   grid ratios, and `whitespace-nowrap` on action links/pills only.

Also: **FR-2.11 (Drive → Supabase reverse import) turned out to already be
code-complete** — `importDrivePayments` is wired into `runBankImport` for
`source=drive|both` and exposed in the UI/API. The gap list was stale. Marked
Partial pending one live Drive pull by the owner.

## Screenshot validation (before/after)

New this session: a static-render harness that screenshots the real components
with fixture data — no dev server or Supabase needed (the sandbox cannot reach
Supabase, so live pages are impossible here).

- `docs/audits/screenshots/2026-07-03-dashboard-coverage-before.png` — old hub
  (pre-coverageRate): July card 9%, rolling total 9%, Essenwood/Musgrave 0%
  despite R9,200/R3,500 matched — the "0% but money is here" complaint.
- `...-dashboard-coverage-after.png` — current hub: July 62% coverage, per-card
  coverage 69/61/47%, signed-off rand amounts still shown as the stricter number.
- `...-units-density-before.png` / `...-units-density-after.png` — NFR-2.1
  pass 2, same fixture, 1600px viewport.

How it works (rebuild any time): copy the component to /tmp with relative
imports redirected, esbuild-bundle with stubs for `next/link`/`next/navigation`
(+ a stubbed `BankImportControls`), compile `globals.css` with the Tailwind v4
CLI, screenshot with Playwright's chromium-headless-shell. Note for sandbox
reruns: repo `node_modules` binaries are macOS — install linux `esbuild` +
`@tailwindcss/cli` in /tmp; headless shell needs a stub `libXdamage.so.1`
(gcc one-liner) via `LD_LIBRARY_PATH`.

## Commits (side refs — see cleanup below)

- `refs/nightly/session-2026-07-03-a` = `176e193` — rescued late-day close-out.
- `refs/nightly/session-2026-07-03-b` = `bca772b` — this run's work: hub copy
  fix, units density pass, RLS migration file, docs, screenshots, this
  handover. Parented on `176e193`. (This sha line was added after the commit,
  so `git status` will show this one file modified — safe to amend/commit.)

## Cleanup (San, ~30 seconds, on your machine)

1. `rm .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock`
   (stale zero-byte locks the sandbox cannot delete; also
   `.git/refs/heads/codex/monthly-payments.lock` if still present)
2. `git update-ref refs/heads/codex/monthly-payments f8b0dd8`
   (chain: `bca772b` → `74b51d0` FR-2.7a drawer fix → `cff45b3` surplus
   rulings → `ef3bdcc` TEST rooms + headed runner → `f8b0dd8` FR-2.8
   surplus-credit ledger build — see "Owner session addendum" below)
   — fast-forwards the branch onto the full chain
   (`115cf7d → 02ed1c6 → cccb2ea → 0704cba → 2d8941c → 176e193 → session-b`).
3. Optionally delete the consumed side refs:
   `git update-ref -d refs/nightly/docs-2026-07-02` (and `-day`, `-day-2`,
   `-day-3`, `session-2026-07-03-a`) — their commits are all in the chain.

## Still open / what to pick up next time

1. **FR-2.7 post-match/sign-off feedback strengthening** — now the top
   unblocked gap. The audit's "import auto-match scoping" question is related
   (open question 3 from 2026-07-02 handover).
2. **FR-2.8 surplus rule — BUILT (evening session 2026-07-03, owner present)**:
   `unit_credits` + `unit_credit_allocations` (migration 20260703140000 applied
   live), accept-split now holds surplus as credit instead of blocking (button
   reads "Accept split + hold credit"), drawer "Held credit" section offers the
   three destinations (arrears ≤ 3 months with real outstanding amounts,
   next-month advance, deposit while headroom > 0) with per-destination caps,
   reverse links for active allocations, and credit applied counts toward a
   period's paid state. Fully-funded-deposit overpayments no longer dead-end as
   mismatch (test ruling updated accordingly — supersedes the 2026-07-02
   "stay mismatch" rule). 7 new decision-rule tests; 97/97 passing; typecheck +
   production build clean. REMAINING: owner browser check on ESSEXROOM1
   (accept the split → credit appears → allocate), then un-fixme Flow 05
   headed specs against the TEST rooms.
   Also fixed in passing: 6 pre-existing `page.textContent()` type errors in
   the day session's new e2e specs (flow-00/flow-05/business-decision).
3. **FR-2.11** — owner: one live `source=drive` pull to promote to Shipped.
4. **NFR-2.1** — dashboard + locations/room-manager screens still need their
   density pass; reuse the screenshot harness to validate.
5. Supabase advisor WARNs (not tonight's scope): mutable search_path on
   `match_knowledge_vectors`; leaked-password protection disabled.
6. e2e suite still needs a machine with a live dev server (San).

## Post-run addendum (San came online)

Live browser verification WAS possible after all — via the Claude-in-Chrome
extension ("personal business chrome") against the dev server on
**localhost:3000** (not the 3001 in the dev script). Verified live with real
July data: dashboard coverage model (21%, R22,967/R110,200, signed-off shown
separately, "expected" copy fix present) and the berea units table density
pass (10 rooms in one viewport, no wrapped pills/buttons).

**Agreed workflow so we all see the same thing:** nightly runs should
browser-verify through Chrome + localhost:3000 whenever the dev server and
Chrome are left running; the static fixture harness is the fallback when they
aren't, and its shots must be labeled as fixture-data renders, not live.

### Owner session addendum (data + FR-2.7)

Live data changes applied to Supabase with San (all verified by SELECT):

- Deposits configured everywhere (were all 0): berea = rent per room;
  Quarry Heights all 18 rooms R2,200; West Rich all 12 rooms R1,400.
- West Rich rents: all 12 rooms → R1,900 across ALL periods (11 were 2,200;
  owner: "all rooms even before July are 1900").
- berea rents: owner ruled stored rent (3,800/4,000) is right; July + all
  other UNPAID periods for ESSEXROOM1/Room 02/Room 07 pulled down from
  5,000/5,300. Nothing signed-off touched. Zero rent↔expected mismatches
  remain database-wide.

FR-2.7 work from the owner's live matching session (commit `74b51d0`):
drawer now stays open after a match with a green confirmation (FR-2.7a,
shipped); sign-off "add reference to unit list?" prompt captured as FR-2.7b
(Planned) with e2e fixme stubs in `e2e/match-flow-feedback.spec.ts`.

Live surplus case now exists: ESSEXROOM1 July has R9,067 against R3,800 rent
with deposit headroom exhausted → R1,467 surplus hits the FR-2.8 BLOCKED rule.
Owner ruling on surplus handling is the blocker.

## Files touched this run

- src/components/monthly-payments/monthly-payments-hub.tsx (copy fix)
- src/components/monthly-payments/units-table.tsx (density pass 2)
- supabase/migrations/20260703031500_enable_rls_prompt_settings.sql (new)
- docs/audits/screenshots/2026-07-03-*.png (4 new screenshots)
- docs/REQUIREMENTS.md (FR-5.3 Shipped, FR-2.11 Partial, NFR-2.1 updated)
- docs/LINEAR-SYNC.md (gap list updated)
- docs/handovers/session-handover-2026-07-03.md (this file)
