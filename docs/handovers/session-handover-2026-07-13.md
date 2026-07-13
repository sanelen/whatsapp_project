# Session handover — 2026-07-13 (scheduled gap-work run)

## Context and concurrency note

This run started while San was actively committing (his `231e9d7`, `e872ead`,
`8d9c1ad`, `115ef01` landed during the session — bank-import audit/UI refresh,
auth hardening, Gmail/Drive config docs). The previously-uncommitted 2026-07-12
review-session work was committed by San himself, so this run verified it and
moved to the next gap instead of re-committing anything.

## Session-start baseline (per testing doctrine)

- `npm test` 134/134 ✓, `tsc --noEmit` ✓ on the tree as found.
- Prod build ✓ via the `$HOME/build` rsync + font-shim recipe (29/29 routes) —
  this was the one check the 2026-07-12 evening review had left open.
- **Standing import health check: PASS.** July window: 12 bank entries ↔ 12
  payment references (1:1, no orphans), 2 in the reference pool, 2 signed off;
  files 52 parsed / 16 `unsupported` (known category, no failures); latest file
  2026-07-12 22:17 UTC.
- Stale `.git/index.lock` cleared (delete permission re-granted this session).

## Work done: combined-payment split, backend slice (FR-2.16)

Commit `438ef05` on `codex/monthly-payments`. The next unresolved gap from
LINEAR-SYNC ("Combined-payment allocation") now has its data model, ops, and
API. Owner rule preserved: the system never guesses a unit — a split is an
explicit operator decision.

- Migration `20260713100000_add_reference_split_support.sql` — **applied to
  live Supabase** and committed: `payment_references.split_parent_id/split_at/
  split_by`, partial index, and two new audited event types
  (`reference_split_accepted`/`reference_split_reversed`).
- `src/lib/reference-split.ts` — pure decision rules: strict sum-to-total at
  cent precision, ≥2 distinct units, property-lock enforcement, no matched/
  signed-off/re-split parents; reversal only while every child is untouched.
- `src/lib/monthly-payments-ops.ts` — `splitPaymentReference` (race-safe
  parent claim, rollback on child-insert failure) and `reverseReferenceSplit`;
  `matchReferenceToUnit` rejects split parents; auto-match skips them.
- `src/lib/monthly-payments.ts` — reference pool excludes split parents.
- API — `split_reference` / `reverse_split` actions on
  `/api/monthly-payments/references`.
- Tests — 10 new unit tests (`reference-split.test.ts`), incl. the verified
  R4,400 two-room case, uneven/cent splits, shortfall/excess messages,
  property-lock and reversal gates.

## Verification

`npm test` 144/144 ✓ · `tsc --noEmit` ✓ · prod build 29/29 routes ✓ (all run
after the change; baseline was green before it). No UI changed this run, so no
before/after renders were required — they are mandatory for the next slice.

## What's left on this gap (pick up next time)

1. **Operator UI**: split action in the reference pool (row action → allocation
   editor → confirm), using the existing drawer patterns. Take BEFORE fixture
   renders first, AFTER renders when done (harness recipe in memory /
   docs/audits/screenshots). Run product-flow-review on the interaction and
   full-flow-review before calling FR-2.16 done (it touches a data/status model).
2. **Import audit**: a split parent's bank entry should surface child match/
   sign-off status instead of looking permanently unmatched.
3. Consider an e2e flow spec once the seeded TEST property fixture exists.

## Also still queued (unchanged from 2026-07-12)

- Owner decisions: cron sweeping Bank uploads; `recomputePaymentPeriodStatuses`
  wire-or-delete; R1,900/R2,200 thresholds into config.
- Owner browser checks: FR-2.7a/b on a TEST room (then un-fixme
  `e2e/match-flow-feedback.spec.ts`); FR-2.8 held-credit drawer.
- Seeded Playwright fixture for the mutating import flow.
- `.claude/settings.local.json` is untracked — add to `.gitignore` or commit
  deliberately.

## Files touched this session

`src/lib/reference-split.ts` (new), `src/lib/reference-split.test.ts` (new),
`src/lib/monthly-payments-ops.ts`, `src/lib/monthly-payments.ts`,
`src/app/api/monthly-payments/references/route.ts`,
`supabase/migrations/20260713100000_add_reference_split_support.sql` (new),
`docs/REQUIREMENTS.md` (FR-2.16), `docs/LINEAR-SYNC.md`, this handover.
Nothing pushed to any remote.
