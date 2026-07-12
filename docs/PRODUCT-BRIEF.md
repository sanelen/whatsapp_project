# Product Brief — Monthly Payments (read me first, every session)

Owner: San. Last updated: 2026-07-12 (dictated by San mid-session; do not drift from this without his say-so).

## What this product is

A simple system with two nouns: **units** and **payments** (plus buildings/locations that group units). Everything else exists to serve one question:

> **Has every tenant paid this month, and did we allocate each deposit to the right unit?**

Keep it simple, solid, easy to navigate, no clutter. The plan is already laid down (ROADMAP.md, REQUIREMENTS.md) — sessions should *align* with it, not re-invent it.

## The core pipeline (the whole product in five steps)

1. **Gmail** — bank transaction update emails arrive in the Gmail account.
2. **Filter → Google Drive** — we filter those emails and archive the statements/updates into Drive.
3. **Drive → Database** — imports load transactions from Drive (or Gmail directly) into Supabase.
4. **Match** — each deposit's reference is matched to a unit using the per-unit rules (10–12 units pay into one account; matching must be intelligent and assisted, not perfect-or-nothing). Unmatched deposits land in the **reference pool** for assisted manual matching.
5. **Sign off** — the operator confirms each match; sign-off can teach the system new reference rules (FR-2.7b) so next month matches itself.

Facilities around the loop: add locations, add rooms/units to locations, set rent and match rules — all in service of step 4/5 being effortless.

## What "working" means (check these, in this order)

- **Can we import?** Run/check an import; counts must be consistent between Gmail, Drive, and the database. No silent gaps, no bulk-created garbage rows or UI artifacts from an import.
- **Do the numbers make sense?** Dashboard totals per month/location must be logically sound — who paid, who hasn't, expected vs collected.
- **Does allocation work?** Deposits match to the right unit; anything unmatched is visible in the reference pool and easy to allocate by hand.

## Session doctrine (San's standing instructions, 2026-07-12)

1. **Run tests at the START of the session** — baseline first, then work.
2. **Flow tests, not element checks.** Tests exercise structured end-to-end flows (import → match → sign off → numbers), never one element at a time. When adding tests, add flow coverage.
3. **Before/after screenshots on every UI change.** Capture "before" *before* editing, "after" when done, and compare — proving we changed only what we meant to change and broke nothing around it. Save both in `docs/audits/screenshots/` and reference them in the handover.
4. **Standing import health check every session** (the "can we import?" test above). Source truth from the database, not the UI.
5. **Clear cut-off for done work:** a slice is done when it is committed + verified (typecheck, tests, build) + reflected in LINEAR-SYNC.md/REQUIREMENTS.md + handed over. Done work is not revisited; next session picks up the next gap in LINEAR-SYNC.md.
6. **Narrate briefly.** Short human-paced summaries of what's being tested/changed as it happens.

## Test-suite review snapshot (2026-07-12)

The e2e suite is already mostly flow-shaped — `flow-00…flow-10`, `reverse-rematch-flow`, `reference-pool-matching`, `units-and-matching`, `navigation-safety`, `surplus-credit-scenarios` — which matches the doctrine. Two caveats:

- **15 of ~24 spec files carry `fixme`/`skip` marks**, mostly because they need a seeded/disposable TEST property so flows can mutate data safely. Un-skipping them (behind a seeded fixture) is standing work — a flow test that doesn't run is an element check in disguise.
- The nightly sandbox cannot run headed e2e against live data; it uses fixture renders + screenshot comparison instead, clearly labeled `-fixture`. Live flow runs happen on San's machine against a TEST room.

## What NOT to do

- Don't push to any remote (nightly rule).
- Don't redesign flows or add screens without running product-flow-review; the plan is set — change as little as possible.
- Don't guess business rules (e.g. deposit-split allocation); write the open question in the handover and move on.
- Don't mark anything Shipped/done that wasn't actually verified.
