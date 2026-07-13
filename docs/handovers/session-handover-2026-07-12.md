# Session Handover — 2026-07-12 (nightly run)

## Summary

Nightly gap-work run. Picked up exactly where the working tree left off: an
**uncommitted, unverified NFR-2.1 density pass (part 2)** on
`monthly-payments-shell.tsx`, `locations-admin.tsx`, and
`room-manager-view.tsx` was sitting in the tree (started in a prior session,
never committed). This run finished it, verified it, and committed it.

**NFR-2.1 density pass part 2 — shell + locations + room manager.** One
slice, fully verified (typecheck ✓, **104/104 tests** ✓, production build ✓
via the `$HOME/build` recipe):

- **Shell sidebar** (frames every payments page): nav cards px-4/py-3.5 →
  px-3/py-2.5, icons 9→7, fonts one step down, sidebar column 272/288 →
  248/260px, quick-links block tightened.
- **Locations cards**: already dense in the inherited diff; verified — cards
  drop from ~700px to ~475px tall, "Manage rooms"/"Open units" now fit on one
  row, whole 3-card grid fits one viewport.
- **Room manager** (finished this run — the inherited pass had missed these):
  local sidebar nav rows py-2.5/13.5px → py-2/13px, sidebar 260→248px wide,
  h1 30→26px (matches locations), intro copy 13.5→13px, StatCell px-4/py-2.5
  → px-3.5/py-2, Home/Chatbox buttons py-2.5→py-2. Room list rows ~20%
  shorter. RoomEditor + filters were already covered by the inherited diff.
- No label/text changes anywhere — e2e text selectors untouched.

## Screenshot validation (before/after — FIXTURE renders, not live)

Same fixtures, old (`dbb92a4`) vs new code, in `docs/audits/screenshots/`:

- `2026-07-12-locations-density-{before,after}-fixture.png`
- `2026-07-12-room-manager-density-{before,after}-fixture.png`

Both pairs also show the shell/sidebar changes. Labeled `-fixture` per the
agreed workflow; density is layout-only, so please sanity-check once on
localhost:3000 — no data mutation involved, any property will do.

## Commit — RESOLVED by the evening session (see continuation below)

~~The work was parked on side ref `refs/nightly/session-2026-07-12-a`.~~
**No cleanup needed anymore.** The evening session of 2026-07-12 cleared the
stuck `.git/index.lock` (deletion is now permitted in the sandbox) and
fast-forwarded `codex/monthly-payments` through `dbb92a4` (FR-2.7b) and both
2026-07-12 side-ref commits. Everything is on the branch; the consumed
`refs/nightly/*` refs can be deleted at your leisure.

---

# Continuation — 2026-07-12 evening session

## Summary

1. **Landed all parked side refs onto `codex/monthly-payments`** (FR-2.7b +
   morning density pass + search_path migration) and re-verified the landed
   state: typecheck ✓, 104/104 tests ✓, prod build ✓. Your manual side-ref
   merge steps are obsolete.
2. **NFR-2.1 finished — dashboard hub + reference pool** (the last two
   screens): hub inline sidebar 260→248px with nav/fonts one step down and
   h1 26px; reference pool from rem-scale demo sizing to the 13px operational
   scale (rows py-4→py-2.5, compact month switcher, tighter summary rail —
   all seven table columns now fit at 1440px). Verified: typecheck ✓,
   104/104 ✓, prod build ✓. Before/after fixture renders:
   `docs/audits/screenshots/2026-07-12-{hub,reference-pool}-density-{before,after}-fixture.png`
   — compared visually; only the intended sizing changed, content and
   behavior identical. **Every payments screen now has the pass-2 treatment.**
3. **Wrote `docs/PRODUCT-BRIEF.md`** from San's dictated instructions
   (2026-07-12): the product intent (units + payments; "has every tenant
   paid and is each deposit on the right unit?"), the Gmail → Drive → DB →
   match → sign-off pipeline, and the standing session doctrine — tests at
   session start, flow tests over element checks, before/after screenshots
   on every UI change, and an import health check every session. **Every
   future session must read it first.**

## Import health check (first run of the standing check — PASS)

DB-side via Supabase (read-only), 2026-07-12 evening:

- Gmail → Drive: **62/62 files archived to Drive** — no gaps.
- Parsing: 49 parsed, 13 `unsupported` (non-statement attachments, by
  design), **0 parser errors**.
- Entries → references, July billing window: **11 → 11** — nothing dropped;
  0 credit entries without a reference anywhere.
- Matching: 7/11 matched (3 signed off), **4 unmatched correctly visible in
  the reference pool** awaiting allocation.

## Gmail OAuth incident (same day, fixed live)

Import failed with `Failed to refresh Gmail OAuth access token (400)` —
expired refresh token (OAuth consent screen is in **Testing** mode, so Google
expires refresh tokens after 7 days; token was minted ~Jul 2–4). Fixed:

- Code (`dbb646e`): refresh errors now surface Google's `error` +
  `error_description` with a re-connect hint; OAuth refresh failure falls
  back to a configured service account instead of failing the import.
- Re-consent run via browser with San present: new refresh token stored in
  `.env.local` (info.hambatrading@gmail.com). Live import verified after:
  "Imported 1 references from 112 messages. 24 duplicate files skipped.
  2 files archived to Drive" — new deposit correctly landed unmatched in the
  reference pool (7→8).
- **⚠️ This token dies again ~Jul 19 unless San publishes the OAuth app to
  Production** (Google Cloud Console → OAuth consent screen → Publish app).

## Still open / what to pick up next time

1. **Standing import health check (per PRODUCT-BRIEF.md)** — passed DB-side
   AND live (import button) this session. If imports 400 again after ~Jul 19,
   it's the Testing-mode token expiry — re-run consent at
   `/api/monthly-payments/import/google-cloud` or get the app published to
   Production.
2. **Flow-test debt** — 15 of ~24 e2e spec files carry `fixme`/`skip`,
   mostly blocked on a seeded/disposable TEST property. Deciding/creating
   that fixture is the biggest unlock for the flow-testing doctrine.
2. **FR-2.7 owner browser check** — FR-2.7a (drawer stays open) + FR-2.7b
   (learning prompt) on a TEST room, then un-fixme
   `e2e/match-flow-feedback.spec.ts`.
3. **FR-2.8** — owner browser check on ESSEXROOM1 (accept split → credit →
   allocate), then un-fixme Flow 05 headed specs.
4. **FR-2.11** — owner: one live `source=drive` pull to promote to Shipped.
5. ~~Supabase advisor WARN: mutable search_path on `match_knowledge_vectors`~~
   — **fixed this run** (second slice): `set search_path = public, extensions`
   applied to the live project + committed as migration
   `20260712093000_pin_search_path_match_knowledge_vectors.sql`. Verified:
   advisor WARN cleared; function still returns rows with the caller's
   search_path stripped to `pg_catalog`. Remaining advisor items: **leaked
   password protection** is an Auth dashboard toggle only you can flip
   (Auth → Providers → Passwords → "Prevent use of leaked passwords"), and
   the `rls_enabled_no_policy` INFOs are the intentional service-role-only
   pattern — left alone.

## Files touched this run

- src/components/monthly-payments/room-manager-view.tsx (finishing edits:
  sidebar nav, h1, intro, StatCell, footer buttons)
- src/components/monthly-payments/monthly-payments-shell.tsx (inherited,
  verified + committed)
- src/components/monthly-payments/locations-admin.tsx (inherited, verified +
  committed)
- docs/audits/screenshots/2026-07-12-*-density-*-fixture.png (4 new)
- docs/REQUIREMENTS.md (NFR-2.1 scope/status updated)
- docs/LINEAR-SYNC.md (gap list updated)
- docs/handovers/session-handover-2026-07-12.md (this file)

---

# Continuation — Bank Import Reconciliation and Operator Audit

## Session Outcome

This continuation turned the bank import from a source toggle into a controlled,
explainable reconciliation flow. Operators can import only from Gmail or the shared
Drive Bank uploads folder, inspect what each file produced, understand the account
and matching policy, and continue unresolved work in the existing reference pool.

Final verification: **128/128 tests passed**, typecheck passed, and
`git diff --check` passed. Live July Drive audit: **4 files, 23 accepted
transactions, R56,700, 23/23 in the database, 18 matched/signed-off**.

## Owner Decisions Captured

1. No local file upload. A person must have Drive access and place CSV/PDF files in
   the controlled Bank uploads folder.
2. Gmail and Drive statements feed the same transaction/reference truth; source
   provenance must not create duplicate payments.
3. Account `7467` is internal and excluded everywhere. Outgoing payments, transfers,
   merchant reservations, statement debits, and interest received are not rent.
4. Dedicated/legacy accounts may lock to one property. Mixed account `6570` may
   contain Quarry Heights and West Rich; explicit references win, then account-scoped
   amount hints. Global amount rules are forbidden.
5. Ambiguity stays human. A payment naming two rooms must not be auto-matched.
6. Import audit validates evidence; Import configuration explains policy; Reference
   pool/unit views perform matching and sign-off.

## What Changed

### Ingestion and Data Safety

- Drive CSV/PDF import with file SHA dedupe, timestamped version/archive folders,
  selected billing-window placement, and property linkage.
- Cross-source transaction identity reconciles statement rows with Gmail/PDF rows.
- CSV parser prefers transaction timestamp over posting date.
- Canonical reference handling removes statement-only prefixes and normalizes room
  spacing/zero padding without collapsing multi-room references.
- Account policy supports excluded, property-locked, and mixed-routing roles.
- Existing internal-account and interest entries/references were removed from live
  operational data; excluded file hash metadata remains for dedupe/audit only.

### Operator Surfaces

- `/monthly-payments/import-audit`: period/source filters, file provenance, parser
  and archive state, accepted transaction totals, DB presence, unit match/sign-off.
- `/monthly-payments/import-configuration`: connected mailbox, masked account roles,
  parser policy, property mappings, and folded unit matching hints.
- Shared navigation links these pages to the dashboard and Reference pool.
- Local statement upload UI was removed.

### Matching Consistency

- Shared `unit-display.ts` makes room manager and payment views use the same
  occupancy source; occupied rooms no longer display as vacant because contacts are
  blank.
- Shared `reference-recommendations.ts` recognizes close forms such as `Qhroom07`
  versus `QHROOM7`; combined references remain recommendations for human review.

## Live Account Reconciliation

| Suffix | Policy | Result |
|---|---|---|
| `2815`, `6088` | Quarry Heights dedicated/legacy | Imported and routed to Quarry Heights |
| `4079`, `9613` | West Rich dedicated/legacy | `9613` property-locked to West Rich |
| `7904` | Essex/Berea property-locked | Statement duplicates reconciled with Gmail; only new payments retained |
| `6570` | Mixed legacy | 29 entries, R65,100; QH 26 / West 3; 28 matched |
| `7467` | Internal/excluded | 0 entries and 0 references; 14 hash-only metadata rows, no retained Drive binaries |

Interest cleanup left zero interest entries/references. The one known unresolved mixed
payment is R4,400 with a combined room reference; this is correct pending a split
workflow.

## Requirement and Test Map

| Requirement | Session meaning | Evidence |
|---|---|---|
| FR-2.4 | Close room tokens recommend/match; ambiguity stays human | auto-match and recommendation tests |
| FR-2.9/2.10 | Gmail/Drive accept only valid payments in the 9th→8th window | parser and billing-window tests |
| FR-2.11 | Drive reverse import is now live, not partial | live CSV/PDF pulls and July audit |
| FR-2.12 | File-to-DB-to-match validation is visible | route test, live audit screenshot |
| FR-2.13 | Operators can inspect source/account/parser policy | route test, live configuration screenshot |
| FR-2.14 | Re-importing files or the same payment through another source does not duplicate | SHA/fingerprint/cross-source tests and live reconciliation |
| FR-2.15 | Account role controls routing and exclusions before matching | exclusion, property-lock, mixed-account tests |
| NFR-2.3 | Audit, reference pool, and unit views read the same operational state | shared loaders/helpers and live comparison |

`src/lib/bank-import.test.ts` is the main policy regression suite. The two new route
render tests are in `src/app/workspace-pages.test.tsx`; recommendation and occupancy
regressions have dedicated helper tests.

## Migrations

Apply in filename order if setting up another database:

1. `20260712180008_add_account_scoped_bank_import_hints.sql`
2. `20260712201500_add_west_rich_old_account_mapping.sql`
3. `20260712205000_add_mixed_legacy_account_rules.sql`

These add account scoping, the West Rich legacy lock, and mixed-account routing
rules. Do not expose full account numbers in UI/docs; suffixes are sufficient.

## Documentation Delivered

- `docs/ARCHITECTURE.md`: source-to-truth and policy decision diagrams, ownership
  table, masked account register, architectural debt.
- `docs/REQUIREMENTS.md`: FR-2.11 promoted to Shipped; FR-2.14/2.15 added.
- `docs/ROADMAP.md`: current focus updated to reconciliation and durable follow-up.
- `docs/LINEAR-SYNC.md`: shipped work and unticketed gaps reconciled locally.
- `docs/roadmap/functionality/payments-bank-import.md`: evidence and current policy.
- `docs/reviews/full-flow-review-2026-07-12-monthly-payments-import-flow.md`:
  four-lens release review and priorities.

## Linear Handover

The Linear connector is installed but not authorized, so no live tickets were
created or changed. Once authorized, create/reconcile tickets for:

1. Account-policy and cross-source reconciliation ownership (FR-2.14/2.15).
2. Combined-payment split allocation (known R4,400 case).
3. Seeded import-flow Playwright coverage.
4. Durable import runs/jobs and canonical duplicate provenance.

Do not invent ticket IDs; update `docs/LINEAR-SYNC.md` with the real IDs/statuses.

## Known Gaps and Risks

- No production build or full Playwright run after the final import changes. Unit,
  route, type, live-browser, and live-data checks passed.
- Import executes synchronously; larger files can exceed an HTTP request lifetime.
- Import audit is current state, not immutable per-run history.
- Duplicate detection prevents reposting but does not yet persist “duplicate of X”.
- Policy is split between source config and DB mappings/hints; keep both documented.
- Formal keyboard/screen-reader and narrow viewport review remains outstanding.

## Restart Checklist

1. Read `docs/PRODUCT-BRIEF.md`, this continuation, and the full-flow review.
2. Run `npm test`, `npm run typecheck`, and the standing import health query before
   changing import logic.
3. Open July Import audit and confirm 4 files / 23 transactions / R56,700 unless new
   source files were deliberately added.
4. Confirm account `7467` and interest still produce zero entries/references.
5. Use a seeded/disposable property before exercising match/sign-off/reversal E2E.
6. Build durable import runs before expanding to much larger statement histories.

## Review Verdict

**Ship with caveats.** The operator flow and safety policies are coherent and live
verified. The next engineer should prioritize repeatable browser coverage and durable
run history, then design the combined-payment split without weakening the rule that
ambiguous references stay human-reviewed.

---

# Continuation — 2026-07-12 review session (code review + UI consistency + polish)

Full findings with reasons:
`docs/reviews/code-review-2026-07-12-evening-review-session.md`. Summary:

## Fixed this session

1. **Nav consistency** — hub, units table, and room manager sidebars were
   missing the "Import configuration" link the shell pages have; all three now
   carry the identical six-item nav. Verified live on every page.
2. **Units-table sidebar density** — was still pre-pass-2 (260px/13.5px);
   aligned to the 248px/13px scale. NFR-2.1 is now actually complete on every
   screen (the earlier "every screen" claim had missed this one).
3. **`listFilesUnder` latent filter bug** (only-one-filter = no filtering),
   **`parseBankStatementCsv` dead `signedAmount`**, **imported-periods
   double-count** in the dashboard import summary, **mismatched button styles**
   on the two import links.
4. **Playwright `baseURL` corrected 3000 → 3001** (3000 is SAChatbot; e2e runs
   without `E2E_BASE_URL` were pointed at the wrong app). Note: earlier
   "sanity-check on localhost:3000" advice in this handover should read **3001**.
5. **Deleted the 7 one-line stub spec files** marked "delete when convenient";
   e2e suite is now 18 real spec files.
6. **Docs corrected:** FR-2.11/ARCHITECTURE claimed Bank uploads import via
   `source=drive|both`; actual behavior is `source=bank` only — `both` never
   sweeps the Bank uploads folder (so the cron doesn't either).

## Added

- `e2e/flow-11-import-audit-and-configuration.spec.ts` — read-only,
  live-data-safe flow tests: the full dashboard → audit → configuration →
  reference pool journey via the sidebar, plus a six-item-nav-everywhere
  regression guard. No fixme needed; runs today.

## Verification

`npm test` 128/128 ✓ · `tsc --noEmit` ✓ · eslint on touched files ✓ · live
walkthrough of all seven pages ✓. **Prod build not run** — run the `$HOME/build`
recipe before shipping.

## Owner decisions queued (see review doc for detail)

1. Should scheduled (`both`) imports also sweep the Bank uploads folder?
2. `recomputePaymentPeriodStatuses` is exported but never called — wire it into
   the import route (recompute statuses for backdated periods) or delete it.
3. Move the R1,900/R2,200 mixed-legacy thresholds out of the CSV parser into
   the bank-import-metadata config module?
