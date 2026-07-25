# Monthly Payments Flow Tests

Last updated: 2026-07-25

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
9. Stay-aware deposit lifecycle and allocation scenarios

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

## 2026-07-24 Stay Lifecycle Scenario Pack

These scenarios come from the owner's reconciliation walkthrough. They should be
tested with safe seeded data or privacy-masked local screenshots before any
production push.

### Scenario A: Holding deposit before move-in

Goal: a deposit paid to hold a unit is not counted as rent for the current month.

Preconditions:

- A unit is vacant or has a future/holding stay.
- One imported incoming payment reference belongs to that unit.
- The payment is intended as a deposit, not rent.

Steps:

1. Open the property units page for the selected month.
2. Expand the unit row.
3. Confirm the incoming bank reference is visible with date, payer/reference,
   masked account, and amount.
4. Choose `Move to deposit` or the stay-aware deposit allocation action.
5. Reopen or refresh the unit row.

Expected:

- The payment is matched to the unit.
- Rent received for the month does not include the deposit amount.
- The deposit ledger/version shows the deposit amount against the holding/current
  stay.
- Dashboard/property rollups count the money once.
- The action is reversible back to the unresolved/matched pile.

### Scenario B: Current rent plus future tenant deposit in one billing window

Goal: two people can pay money for the same room in the same billing window
without mixing stay ownership.

Preconditions:

- Current stay is still active or in notice.
- Future/holding stay exists for the same unit.
- One payment is current tenant rent.
- A second payment is incoming tenant deposit.

Steps:

1. Open the unit row for the selected month.
2. Inspect the recent payments list.
3. Allocate current tenant payment to this month's rent/current stay.
4. Allocate incoming tenant payment to future stay deposit.
5. Reopen dashboard, property card, and the unit row.

Expected:

- Rent coverage reflects only the current tenant rent allocation.
- Deposit ledger for the future stay reflects only the incoming tenant deposit.
- Current stay deposit ledger is unchanged unless explicitly selected.
- The same payment amount never appears in both rent and deposit totals.
- The UI makes the stay choice visible whenever more than one stay is relevant.

### Scenario C: End stay and release deposit

Goal: closing a tenant stay freezes the old deposit ledger and starts the next
tenant cleanly.

Preconditions:

- A unit has a stay with a deposit balance.
- Owner has inspection/refund evidence available in a safe test fixture.

Steps:

1. Open the unit's stay lifecycle controls.
2. End the current stay with a move-out date.
3. Record inspection result, deduction/refund decision, and evidence reference.
4. Create or open the next stay for the same unit.
5. Inspect the monthly-payments row.

Expected:

- Ended stay is visible in previous stay history.
- Refund/deduction entries are attached to the ended stay.
- The new/current stay starts with its own deposit target and balance.
- Closed-stay deposit does not make the new tenant look funded.
- Full banking details are never shown in normal payment screens.

### Scenario D: Retrospective stay backfill

Goal: owner can define past tenant windows without rewriting imported bank
records.

Preconditions:

- A unit has historical matched payments for several months.
- No stay metadata exists for that historical period.

Steps:

1. Open Room Manager or the stay lifecycle control.
2. Create a historical stay with start and end dates, for example February
   through June.
3. Review candidate matched payments in that date range.
4. Attach the intended rent/deposit allocations.
5. Return to the monthly-payments unit row for one of those periods.

Expected:

- Imported bank rows remain unchanged.
- Stay/allocation metadata explains which payments belong to that stay.
- Ambiguous payments remain unassigned until explicitly handled.
- Previous/current stay displays agree across months.
- Room Manager labels the effective ownership date as `Billing from`.
- Open decision: whether the product also needs a separate physical move-in date.

### Scenario D2: Room Manager tenant-version persistence

Goal: owner can edit active and past tenant versions without changing room-level
identity or imported bank evidence.

Preconditions:

- A unit has an active tenant version.
- The stay lifecycle migration is present.

Steps:

1. Open Room Manager for the property and selected unit.
2. Edit Name and Surname.
3. Confirm the read-only Tenant display combines Name + Surname.
4. Set `Billing from`, deposit target, and optional `Ends after`.
5. Save tenant version.
6. Refresh the page and reopen the same room.
7. Add a past stay with Tenant, `Billing from`, `Ended on`, and deposit target.

Expected:

- Active tenant-version fields remain editable.
- Tenant display derives from Name + Surname.
- Saved `Billing from` and deposit target persist after refresh.
- Past stay appears in stay history with `Deposit paid R x / R y`.
- Imported bank reference rows are not rewritten.

### Scenario E: Known reference delete and exact-room matching

Goal: the operator can remove bad reference hints, and exact room references beat
generic property tokens.

Preconditions:

- A unit has a temporary or bad known-reference hint.
- Two rooms share generic hints such as property name or the word `ROOM`.
- One incoming payment references a specific room number.

Steps:

1. Open the expanded unit row.
2. Delete the bad known-reference chip.
3. Refresh the page and confirm the chip remains gone.
4. Run or inspect match recommendations for the specific-room payment.

Expected:

- Deleted hint no longer appears or influences future matching.
- Payment naming Room 05 does not strong-match Room 06 because of generic hints.
- If room identity remains ambiguous, the reference stays in the pool for human
  review.

### Scenario F: Funded legacy deposit plus held surplus

Goal: when an incoming payment covers rent and leaves surplus, the UI explains
rent, deposit, held credit, and allocation history without implying the room-level
deposit proves the current tenant stay is fully reconciled.

Recorded evidence:

- Record & Replay session `73D6AEB2-128B-4AD7-BE04-E63B43AD1C75`, captured
  2026-07-24.
- The owner walked Room 1 across April and May 2026.

Preconditions:

- A unit has a legacy room-level deposit ledger already showing funded.
- A later matched bank reference exceeds the month's rent.
- Some surplus is held or allocated, and active allocation reversals exist.

Steps:

1. Open April 2026 for the unit.
2. Confirm rent coverage is zero/no matched rent while the legacy deposit ledger
   still shows funded.
3. Move to May 2026 for the same unit.
4. Confirm the later reference shows full amount, rent portion, held surplus, and
   signed-off amount.
5. Inspect allocation history and reverse guards.

Expected:

- Rent coverage shows only the selected month's rent portion.
- Held surplus is visible as held credit, not hidden inside rent.
- Allocation history shows where prior surplus went.
- Reverse controls explain dependency order, for example reverse active allocation
  first.
- The deposit version panel continues to warn that legacy room-level deposit
  needs occupancy migration before old/new tenant deposit ownership is trustworthy.

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

## 2026-07-24 rent-period move and Capitec parity regression

### Move a matched rent payment to the next month

1. Open a unit with a matched rent reference in the selected month.
2. Expand the unit and choose **Move to next month**.
3. Confirm the full amount, target month, and optional reason.

Expected:

- The reference disappears from the source month's rent total and appears in
  the immediately following month for the same unit.
- Bank date, amount, reference text, and sign-off state do not change.
- Both month statuses are recalculated and an audit note records the move.
- A reference with an active deposit or held-credit allocation is blocked until
  that allocation is reversed.

### Retain unprocessed Capitec evidence

1. Import one supported incoming-funds Capitec PDF and one unsupported or
   non-extracting Capitec PDF in the same billing window.
2. Open **Import audit** for that period.

Expected:

- The supported payment has the same database and match workflow as a Gmail or
  CSV payment.
- The unsupported file remains visible under **Unprocessed bank items**.
- Its source, filename, parser/import status, and human-readable reason are
  visible; no bank evidence silently disappears.
