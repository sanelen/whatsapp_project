# Monthly Payments UI Flow Review — 2026-07-01

Purpose: preserve the operator review from the July 1 walkthrough as a product case study, bug list, and implementation brief.

## What this pass focused on

This review was not a broad design critique. It focused on the live operator loop:

1. dashboard trust
2. property drill-down
3. room-source editing
4. reference matching
5. navigation safety
6. UI density and readability

## Main issues observed

### 1. Dashboard totals and paid counts still feel contradictory

Observed concern:

- A property can show collected money such as roughly `R 20k` while still presenting `0 paid`.

Why this matters:

- It breaks operator trust immediately.
- The user cannot tell whether the issue is unmatched references, stale row status, or broken rollups.

Required change:

- Use one shared status model between dashboard cards and units rows.
- If money exists but is unmatched, surface that explicitly instead of letting it read like "collected but nobody paid."

### 2. Units UI is too large and visually heavy

Observed concern:

- Table rows, buttons, cards, and text all feel oversized for an operational surface.
- The page reads more like a wireframe or demo panel than a dense work tool.

Required change:

- Reduce row height, font size, button size, and padding.
- Keep hierarchy, but move toward tighter, scan-friendly operations UI.

### 3. Match-reference interaction is still not confident enough

Observed concern:

- Matching feels slow and visually oversized.
- It is not always obvious what happened after choosing a candidate.
- The user still has to ask how a reference becomes attached and how the totals update.

Required change:

- Make the selected unit, candidate reference, and post-match refresh behavior more obvious.
- Refresh row status, date, amount, and summary state immediately after match.

### 4. Room source editing still leaves too many questions

Observed concern:

- The user can edit a room, but it is still not obvious enough how those source fields drive matching.
- The system needs to explain where room values come from and what effect changing them will have.

Required change:

- Keep source editing in room manager, but make the relationship explicit:
  - room label
  - primary reference
  - keyword hints
  - regex rules
  - rent
  - occupancy
- After save, return to units context and refresh suggestions.

### 5. There is no clear create-room flow yet

Observed concern:

- The user asked a simple operational question: "How do I add a room?"
- The current UI exposes editing, but not an obvious creation path.

Required change:

- Add a visible `create room` action in locations/room manager.
- Treat this as a real setup action, not something the user has to infer from edit controls.

### 6. Deposit-overpayment behavior needs real business logic

Observed concern:

- Rent amount alone is not a reliable match signal.
- Tenants may pay rent plus an extra amount toward deposit over several months.

Business rule captured from walkthrough:

- If rent is `R 3,000` and tenant pays `R 4,000`, the extra `R 1,000` may be deposit contribution.
- The system should be able to split or at least reason about:
  - rent-covered amount
  - deposit contribution
  - deposit balance building over time

Required change:

- Do not treat any payment above rent as automatically invalid.
- Add a future payment allocation rule that can:
  - satisfy expected rent first
  - place remainder into deposit accumulation
  - show this split in an inspectable way

## Suggested next implementation order

1. Fix dashboard and units reconciliation so paid counts and money tell the same story.
2. Tighten the units UI density and table sizing.
3. Make match-reference refresh behavior immediate and obvious.
4. Add a clear create-room entry in room manager.
5. Implement deposit-overpayment allocation rules.

## Automated test implications

This walkthrough added or reinforced the need for these automated scenarios:

1. collected money cannot coexist with `0 paid` unless unmatched funds are surfaced separately
2. matching a reference refreshes row + summary immediately
3. saving room-source fields changes later matching suggestions
4. create-room action is present and reachable
5. deposit-overpayment behavior is handled explicitly rather than silently misclassified

## Product direction note

The operator wants this workspace to behave like a compact real-estate operations tool:

- smaller and denser
- less decorative
- less ambiguous
- faster to scan
- easier to trace from amount -> property -> room -> reference -> source rule

That should remain the design bar for the next UI passes.
