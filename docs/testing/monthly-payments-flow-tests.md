# Monthly Payments Flow Tests

Last updated: 2026-07-01

Purpose: keep a living, flow-first test reference for the monthly payments
workspace.

This is not an element checklist. It is a product-behavior guide for manual QA,
automation planning, and future Playwright coverage.

## How to use this file

- Start with the operator's goal, not the screen.
- Set up the data preconditions first.
- Verify state changes across pages, not only within one page.
- Prefer assertions on amounts, statuses, navigation, and persisted changes.
- When a flow fails, capture:
  - selected month
  - selected property
  - unit label
  - matched reference text
  - transaction date
  - expected vs received amount

## Core testing principles

1. Test from a real business context.
2. Verify billing-window behavior, not only calendar-month labels.
3. Verify that room rules affect later matching behavior.
4. Verify that returning to a previous page reflects saved changes.
5. Verify that totals, paid counts, due counts, and unmatched counts agree.
6. Prefer seeded references with known transaction dates and amounts.

## Shared context

These flows assume the live monthly-payments workspace:

- Entry page: `/monthly-payments`
- Locations page: `/monthly-payments/locations`
- Property units page: `/monthly-payments/[propertyId]`
- Reference pool page: `/monthly-payments/reference-pool`
- Room manager page: `/monthly-payments/locations/[propertyId]`

Known product rules to keep in scope:

- Billing window is `09 previous month - 08 current month`.
- Only imported `Incoming Funds` should become payment references.
- Account suffix `6088` maps to Quarry Heights.
- Account suffix `7904` maps to Berea / Essex.
- Per-unit table date should come from the matched transaction date.
- A room's match hints should influence later matching and suggestion behavior.

## Recommended automation order

Build automated coverage in this order:

1. Navigation and month context
2. Dashboard totals by property
3. Units table period loading
4. Room manager save and persistence
5. Reference pool property filtering
6. Match-reference flow
7. Reverse / re-match flow
8. Import refresh flow

## Flow 01: Entry to dashboard

Goal: the operator can reliably enter the payments workspace.

Preconditions:

- App is running.
- User is on the entry layer.

Steps:

1. Open `/`.
2. Click the Dashboard card.
3. Confirm the monthly payments workspace loads.
4. Use the main left navigation to move to Locations.
5. Return to Dashboard.

Expected:

- Navigation works without dead ends.
- The left navigation remains visible and consistent.
- The month stepper is visible on workspace pages.
- No route loads an unstyled or orphaned screen.

Automation note:

- Good first smoke test because it validates layout shell + routing.

## Flow 02: Month context changes the whole workspace

Goal: switching month changes the working dataset everywhere it should.

Preconditions:

- At least two months of imported reference data exist.

Steps:

1. Open dashboard home.
2. Note the selected month and billing window.
3. Click a different month.
4. Open one property from the location cards.
5. Check the units page for the same month label and billing window.
6. Open the reference pool.

Expected:

- Dashboard, units, and reference pool stay in the same month context.
- Billing window text updates with the month.
- Totals and unmatched counts change with the selected month.

Automation note:

- Assert URL period query or route state if present.
- Assert one known reference appears in month A but not in month B.

## Flow 03: Dashboard location cards reconcile to unit rows

Goal: a property card total can be explained by the units behind it.

Preconditions:

- Property has occupied units and imported references for the selected month.

Steps:

1. Open dashboard home.
2. Capture one property's:
   - amount collected
   - expected amount
   - paid count
   - due count
3. Click that property card or Open units action.
4. Count rows that are effectively paid for that same month.
5. Sum received values for matched rows.

Expected:

- Card collected amount equals the sum of matching unit received amounts for the month.
- Paid count equals the number of units considered paid by current business rules.
- Due count matches remaining actionable unpaid/overdue units.
- No contradiction like "25% collected" with "0 paid" unless partial-payment rules explicitly explain it.

Automation note:

- This is one of the most important business-trust tests in the suite.

## Flow 04: Room manager persistence

Goal: room source data is editable and saved values persist.

Preconditions:

- Property has room records.

Steps:

1. Open Locations.
2. Open one property's room manager.
3. Edit:
   - rent
   - occupancy state
   - primary reference
   - one keyword hint or regex rule
4. Save.
5. Refresh the page.
6. Confirm the edited values remain.

Expected:

- Save shows success feedback.
- Values persist after reload.
- Returning to the same room shows the edited reference hints.

Automation note:

- This should use clearly fake test data where possible so updates are obvious.

## Flow 05: Room manager changes are visible in units view

Goal: room edits feed the operator workflow, not only the setup screen.

Preconditions:

- A room has just been edited in room manager.

Steps:

1. Edit a room's reference hints and save.
2. Open Units for the same property and month.
3. Find that room's row.
4. Open any match-related action available for that row.

Expected:

- The room label, rent, and relevant source details match what was saved.
- Matching suggestions or source context reflect the updated rules.
- The operator does not need to guess whether the save "took".

Automation note:

- This is a cross-page persistence test. Very valuable.

## Flow 06: Unmatched reference pool is property-aware

Goal: the operator only sees references relevant to the property they are working in.

Preconditions:

- At least two properties have unmatched references in the same month.

Steps:

1. Open the global Reference Pool page.
2. Confirm multiple properties are represented.
3. Open one property's units page.
4. Trigger `match ref` from one unpaid row.

Expected:

- The inline/drawer pool is filtered to the active property.
- References from unrelated properties do not appear.
- Summary counts agree with the visible list.

Automation note:

- Use seeded Quarry Heights and Berea references in the same period.

## Flow 07: Match a reference to a unit

Goal: an operator can match one unmatched deposit to the correct unit.

Preconditions:

- One unit is unpaid.
- One unmatched reference clearly belongs to that unit.
- Amount and room hint are known.

Steps:

1. Open the property units page for the active month.
2. Choose one unpaid row.
3. Trigger `match ref`.
4. Verify the candidate list is scoped to the same property and billing window.
5. Select the best candidate.
6. Confirm the unit row refreshes.

Expected:

- The row displays the matched reference.
- The row displays the matched transaction date.
- The received amount updates immediately.
- Property paid/due/overdue totals refresh without a hard reload.
- Unmatched count for that property drops.

Automation note:

- Use one seeded exact-reference match and one near-match to prove ranking quality.

## Flow 08: Dashboard contradiction check

Goal: prevent the confusing state where money is collected but the UI still says `0 paid`.

Preconditions:

- Property has matched money in the selected month.

Steps:

1. Open dashboard for a month with collected money.
2. Note:
   - collected amount
   - paid count
   - due count
3. Open the same property units page.
4. Count rows classified as paid under current rules.

Expected:

- If collected money is attached to valid unit rows, paid count is greater than zero.
- If collected money exists but is unmatched, the UI explains this separately instead of implying zero paid with no explanation.
- Units page and dashboard use the same status logic.

Automation note:

- This should become a high-priority regression test because it directly affects operator trust.

## Flow 09: Room source edit round-trip

Goal: editing a room changes future matching behavior and returns the operator to a sensible context.

Preconditions:

- One room has editable source fields.
- Property units page and room manager both exist for the same property.

Steps:

1. Open a property units page.
2. Use `edit source` or `manage room` for a target room.
3. Change one or more of:
   - room label
   - primary reference
   - keyword hint
   - regex rule
   - rent
4. Save.
5. Return to units for the same property and period.
6. Re-open `match ref` for that room if needed.

Expected:

- The same property and period are preserved.
- Saved fields persist.
- Matching suggestions reflect the updated rules.
- The operator does not need to manually rebuild context after saving.

## Flow 10: Create-room path exists

Goal: operators can add rooms from the setup branch without guessing where creation lives.

Preconditions:

- Property is open in Locations or Room Manager.

Steps:

1. Open `/monthly-payments/locations`.
2. Open one property's room manager.
3. Look for the entry to create a new room.

Expected:

- A clear `create room` action exists.
- The action is visible above the room list or in a clear setup toolbar.
- The operator does not have to infer creation from `edit room`.

Automation note:

- This can begin as a presence/navigation test, then expand once create-room is implemented.

## Flow 11: Partial-payment and deposit split handling

Goal: overpayments are not blindly treated as rent-only mismatches.

Preconditions:

- One occupied unit has:
  - expected rent
  - deposit balance still outstanding
- One imported reference exceeds rent because the tenant is paying rent plus deposit contribution.

Steps:

1. Open the property units page for that billing window.
2. Inspect the unit row and matched payment behavior.
3. Review any room or unit detail view that explains the breakdown.

Expected:

- The system can distinguish rent portion from deposit contribution, or at minimum surfaces the need for that split clearly.
- A payment larger than rent is not automatically treated as a bad match.
- Deposit accumulation can be reasoned about over time.

Automation note:

- This may start as a pending business-rule test until the split logic is implemented.

Steps:

1. Open the property's units page.
2. Identify an unpaid row.
3. Click `match ref`.
4. Select the correct unmatched reference.
5. Confirm the match action.

Expected:

- The row now shows:
  - reference text
  - transaction date
  - received amount
- The unmatched reference disappears from the pool.
- Property unmatched count decreases.
- Status updates appropriately.

Automation note:

- This should assert both UI change and persisted API/database change.

## Flow 08: Match suggestions honor room rules

Goal: configured hints actually help matching.

Preconditions:

- A room has:
  - primary reference
  - keyword hints
  - or regex rules
- An imported reference matches those hints.

Steps:

1. Open the room manager and confirm the rule exists.
2. Return to the units page.
3. Trigger `match ref` on that room.
4. Inspect the candidate list ordering or suggestion state.

Expected:

- The matching reference is surfaced as a likely candidate.
- Matching should be case-insensitive where intended.
- Variants like `ROOM 10`, `room10`, `Room 10`, or known shorthand should still be catchable if the rule set is meant to support them.

Automation note:

- This is best done with controlled seed references.

## Flow 09: Date provenance on matched rows

Goal: per-unit table shows the actual transaction date from the imported source.

Preconditions:

- A matched reference exists with known `Date Time Actioned`.

Steps:

1. Open the matched unit row.
2. Capture the displayed row date.
3. Compare it to the imported transaction date.
4. Repeat for another month.

Expected:

- Row date matches the reference transaction date, not an unrelated save time.
- The date appears in the correct billing period's table.

Automation note:

- Good candidate for API + UI paired verification.

## Flow 10: Reverse and re-match

Goal: an incorrect match can be safely undone.

Preconditions:

- A unit row already has a matched reference.

Steps:

1. Open the matched row.
2. Trigger reverse / unmatch.
3. Confirm the row unlocks.
4. Confirm the reference returns to the unmatched pool.
5. Match the correct reference instead.

Expected:

- Audit-preserving reverse behavior.
- Totals recalculate.
- The original wrong reference is available again.
- The new correct reference becomes attached to the row.

Automation note:

- High-value state-machine test.

## Flow 11: Import refresh changes downstream state

Goal: importing new bank data updates the operator surfaces.

Preconditions:

- Google Drive or mailbox source has new files for a known month.

Steps:

1. Open dashboard for the target month.
2. Record unmatched count and property totals.
3. Run import.
4. Refresh the current month.
5. Open one property and the reference pool.

Expected:

- New references appear in the correct billing window.
- Duplicate files are skipped.
- Totals, unmatched counts, and candidate lists update accordingly.

Automation note:

- This can begin as a mocked integration flow before full external dependency coverage.

## Flow 12: Navigation safety

Goal: every new page has a clear path back.

Preconditions:

- None.

Steps:

1. Open Dashboard.
2. Go to Locations.
3. Go to Room manager.
4. Open Units.
5. Open Reference Pool.
6. Use visible navigation only to return to Dashboard.

Expected:

- Every page exposes a clear next/back/home path.
- No page traps the operator.
- Breadcrumbs and left rail stay semantically consistent.

Automation note:

- A cheap but important regression suite.

## Suggested test data packs

Keep a few named scenarios available for automation:

### Pack A: Clean exact matches

- 3 units
- 3 imported references
- exact amounts
- obvious reference strings

### Pack B: Regex / hint-driven matches

- Room labels like `Room 09`, `Room 10`
- references with mixed case and spacing
- examples like `ESSEX ROOM 1`, `Essex no.07`, `QHRoom14`

### Pack C: Mismatch and partial

- wrong amount
- ambiguous room text
- one reference that belongs to the property but not to the selected unit

### Pack D: Reverse workflow

- one already matched row
- one alternate correct reference available after reversal

## What Claude should build first

If another agent is turning these into automated tests, recommend this order:

1. `entry-to-dashboard.spec`
2. `month-context-propagation.spec`
3. `dashboard-to-units-reconciliation.spec`
4. `room-manager-persistence.spec`
5. `reference-pool-property-scope.spec`
6. `match-reference-flow.spec`
7. `reverse-rematch-flow.spec`

## Open questions to keep updating here

- What exactly counts as "paid" on a location card: any matched amount, fully matched amount, or signed-off amount only?
- Should `match ref` auto-open a drawer, modal, or inline panel?
- After room-rule save, should units auto-refresh immediately, or show a manual refresh CTA?
- Which matching rules must be case-insensitive by default?
- When a reference matches by hint but amount differs, should it show as suggestion, mismatch, or block?

## 2026-07-01 runtime regression note

Current local verification target:

- `http://localhost:3000`

Live issue caught during operator testing:

- the units-table `match ref` drawer was throwing a React duplicate-key runtime
  error when overlapping keyword hints rendered twice

That failure is now fixed, and it should stay in the regression checklist.

### Add this smoke test

Goal: matching interactions should not trigger a dev overlay or break page
interaction.

Steps:

1. Open a property units page for a month with unpaid rows.
2. Click `+ match ref`.
3. Confirm the candidate drawer opens.
4. Confirm hint chips render cleanly and the page stays interactive.
5. Open room manager for the same property.
6. Return to units and open `+ match ref` again.

Expected:

- No console-error / Next dev overlay appears.
- Hint chips render once each even if keywords and room-label hints overlap.
- The page remains interactive across units → room manager → units round-trips.
