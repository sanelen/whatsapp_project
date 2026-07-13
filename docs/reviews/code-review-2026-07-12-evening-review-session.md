# Code + UI Review — 2026-07-12 (evening review session)

Reviewer: Claude (Cowork session, San present). Scope: everything in the working
tree from the 2026-07-12 sessions — bank-import reconciliation slice, the two new
operator pages, shared matching helpers, migrations, tests, and all touched docs.
Verdict: **the day's work holds up; a handful of loose ends were tightened in this
session, and three decisions are left for the owner.**

## What was reviewed

- `src/lib/bank-import.ts` (+844 lines): CSV/PDF statement parsers, cross-source
  dedupe, account policy (excluded / property-locked / mixed legacy), Drive Bank
  uploads importer.
- `src/lib/auto-match.ts`, `reference-recommendations.ts`, `unit-display.ts`,
  `import-audit.ts`, `import-configuration.ts`, `src/config/bank-import-metadata.ts`.
- `src/app/api/monthly-payments/import/route.ts`, the four sidebar
  implementations, `bank-import-controls.tsx`, `units-table.tsx`.
- Three new migrations (`20260712180008`, `20260712201500`, `20260712205000`).
- Unit + route test suites (128 tests), the e2e suite (24 → 18 spec files), all
  six planning docs.
- Live UI walkthrough of all seven workspace pages on `localhost:3001`.

## Assessment of the day's work

The policy core is well built. Account exclusion, property locks, and mixed-legacy
routing are all pure functions with direct tests; the "ambiguity stays human" rule
(combined-room references never auto-match) is enforced in `resolveAutoMatch`
itself, not just at call sites, which is the right layer. Cross-source dedupe
(date + account + amount + minute + canonicalized reference) is conservative in
the right direction — it can miss a dedupe (creating a visible duplicate a human
will catch) but is unlikely to silently merge two different payments. The decision
to stop writing `unit_id` on reference insert and let the post-import auto-match
pass own all matching removes a subtle two-writers problem — good simplification.

## Fixed in this session (with reasons)

1. **Navigation drift — three pages were missing "Import configuration"**
   (hub, units table, room manager each hand-roll their own sidebar; only the
   shared shell got the new link). An operator on the dashboard had no path to
   the policy page except through a shell page. Added the link to all three,
   same order and style as the others. Before/after verified live on all pages.
2. **Units-table sidebar had missed the NFR-2.1 density pass** (still 260px /
   13.5px / py-2.5 while every other page is 248px / 13px / py-2). The handover
   claimed "every payments screen now has the pass-2 treatment" — the Match &
   sign off sidebar didn't. Aligned it. This also makes the sidebar width stop
   jumping when navigating between pages.
3. **`listFilesUnder` filter semantics (google-drive.ts)** — with
   `extensionMatch = size===0 || …` OR'd against `mimeMatch = size===0 || …`,
   passing only ONE of the two filters made the other auto-pass every file,
   silently disabling filtering. Both current call sites pass both filters, so
   this was latent, not live — but the next caller would have been bitten.
   Rewrote so an omitted filter never auto-passes on its own.
4. **`parseBankStatementCsv` dead variable** — `signedAmount` was defined
   identically to `amount` in both branches and checked alongside it. Removed;
   behavior identical (covered by the existing CSV parser tests).
5. **Import summary double-count** — the dashboard totals summed
   `importedPeriods.length` across mailboxes, so one period touched by two
   mailboxes counted twice. Now counts distinct periods.
6. **Adjacent buttons, two design languages** — "View import audit" (warm
   `#e7e3d6` tokens, h-7, 11px) next to "Import configuration" (slate tokens,
   py-1.5, 11.5px). Unified on the warm tokens used by the rest of that card.
7. **Playwright `baseURL` pointed at the wrong app** — config defaulted to
   `localhost:3000`, which is SAChatbot (see `start-all.sh`); this repo's dev
   server runs on 3001. Any e2e run without `E2E_BASE_URL` was testing the
   wrong process. Defaults now 3001; env override unchanged. (The 2026-07-12
   handover's "sanity-check on localhost:3000" note had the same wrong port.)
8. **Deleted 7 stub spec files** ("Consolidated into new test files — delete
   when convenient" one-liners): bank-import, dashboard-hub, entry-page,
   locations-admin, navigation-flow, reference-pool, units-table `.spec.ts`.
   They inflated the suite count and made the fixme/skip ratio look worse than
   it is. Also cleared a stale `.git/index.lock` created during cleanup.
9. **Docs corrected** — FR-2.11 and ARCHITECTURE claimed Bank uploads import via
   `source=drive|both`; the code only runs it for `source=bank` (see below).

## Added test coverage (flow-shaped, per the doctrine)

`e2e/flow-11-import-audit-and-configuration.spec.ts` — two tests, both safe on
live data (read-only, no imports/matches/sign-offs):

- **Flow 11** walks the operator journey dashboard → import audit → expand
  evidence → import configuration → reference pool → dashboard, navigating by
  the sidebar (not direct URLs), asserting audit totals are internally
  consistent, statuses are visible per transaction, account numbers stay
  masked, and the audit's unmatched picture is coherent with the pool.
- **Flow 11b** asserts every workspace page carries the same six-item
  navigation — the regression guard for fix #1.

## Test-suite review (which tests earn their keep)

- **Strong:** `bank-import.test.ts` (policy regression suite — exclusions,
  locks, mixed routing, cross-source identity, canonical references),
  `auto-match.test.ts` (FR-2.4 zero-padding + combined-room ambiguity),
  `reference-recommendations.test.ts`, `unit-display.test.ts`. These encode
  owner decisions and will catch real regressions.
- **Weak but cheap:** the `workspace-pages.test.tsx` route tests are
  regex-over-source checks ("page file mentions `requireUser`"). They are
  element checks in disguise — they can't catch a broken render. Keep them as
  wiring guards, but don't count them as functional coverage.
- **Debt unchanged:** 15 of the remaining 17 e2e spec files carry fixme/skip,
  nearly all blocked on the seeded/disposable TEST property. That fixture is
  still the single biggest unlock; flow-11 narrows the gap only for read-only
  journeys.

## Left for the owner (decisions, not bugs)

1. **Should scheduled imports sweep the Bank uploads folder?** `source=both`
   (the cron default) covers Gmail + the app's Drive archive but deliberately
   not Bank uploads (`source=bank`, dashboard-only). Defensible — operator
   uploads stay an explicit action — but if statements dropped in Drive should
   land without a button press, the cron needs `bank` added. Docs now state
   the actual behavior.
2. **`recomputePaymentPeriodStatuses` (monthly-payments-ops.ts) is exported
   but never called.** It looks like the intended follow-up to
   `ensurePaymentPeriodsForPeriod` in the import route (recompute statuses for
   periods a backdated statement lands in). Wire it or remove it — as-is it's
   dead code that implies a behavior that doesn't exist.
3. **R1,900 / R2,200 mixed-legacy thresholds live in the CSV parser**
   (`parseBankStatementCsv`), while the rest of account policy lives in
   `src/config/bank-import-metadata.ts` + DB hints. Documented in the config
   register, but the constant itself is in parser code — one more place for
   policy to drift. Consider moving the threshold into the config module.

## Smaller observations (no action taken)

- `isEntryOnOrBeforeToday` compares against the UTC date; a statement row dated
  "today" in SAST before 02:00 UTC would be rejected as future-dated. Rare and
  self-heals the next day, but worth knowing if a row ever "goes missing" for a
  few hours around midnight.
- Import audit's `databaseStatus: 'stored' | 'missing'` means "payment
  reference exists", not "entry exists" (entries are by definition stored).
  The UI label reads fine; just don't reuse the field name for the other
  meaning.
- The audit file list caps at 300 most recent files — fine for current volume,
  will need pagination before large statement backfills (matches the known
  "no durable import runs" debt).
- Shell's "Match & sign off" card links to the dashboard (`operationsHref`
  default) rather than a property; the description text promises the unit
  table. Harmless today (dashboard is where you pick a property), but the copy
  slightly overpromises.

## Verification of this session's changes

- `npm test`: **128/128 pass** (no behavior change to any tested path).
- `npx tsc --noEmit`: clean. `eslint` on all touched files: clean.
- Live browser walkthrough of all seven pages after the nav fixes: six-item
  sidebar present and identical everywhere; units-table sidebar now on the
  248px scale; before/after captured in-session (Cowork screenshots).
- Production build: **not run** (matches the standing gap noted in the
  full-flow review; run `$HOME/build` recipe before shipping).
