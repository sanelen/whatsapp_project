# Payments Dashboard Roadmap

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **design-reviewed; early implementation exists on branch `codex/monthly-payments`.**

## Goal

A **CRM-style payments dashboard**, **separate from the chat app**, that tracks
**per-unit** rent against monthly targets, lets the team **assign payment
references** to units, and surfaces an **amber/green/red** status view with a
**rolling total** of collected vs. expected income.

## Information architecture

- A **layer above organizations** offers two entry points:
  - **Chatbox** → the existing workspace/chat route.
  - **Dashboard** → this payments view.
- Drill-down: **Hamba Trading (org) → location (property) → units**.
- Reuses the property/unit model in [property details](./property-details.md):
  units carry `rent_amount`, occupancy, and contacts.

## Core concepts

- **Expected income** = sum of `rent_amount` for **occupied** units (units can be
  **blocked off** / excluded when not occupied).
- **Rolling total (collected)** = sum of **signed-off references** assigned to units
  for the period.
- **Reference pool:** payment references (e.g. bank deposit refs) arrive
  independently; the team **matches** each to a unit and **signs it off**, which
  **appends to the rolling total**.
- **Status flags (amber-style):** `paid`, `overdue`, plus duration/age cues.

## Observed import evidence (2026-06-29)

We now have a first real capture of the upstream payment source. The recorded Gmail
session confirmed that the dashboard's reference pool is expected to be fed by a
bank-mailbox import flow, not only manual entry.

- Source: Gmail mailbox with Capitec transaction notifications
- Attachment pattern: many single-transaction PDFs such as `70006Capitec.pdf`,
  `98151Capitec.pdf`, `36683Capitec.pdf`, and similar
- Confirmed extractable fields from a visible sample PDF:
  - `Transaction Type`
  - `Date Time Actioned`
  - `Transaction ID`
  - `Account Paid To`
  - `Amount Received`
  - `Reference`
  - `Available Balance`

The dedicated evidence note lives in
[payments bank import notes](./payments-bank-import.md).

The owner later clarified the first live matching rules from those bank records:

- only `Incoming Funds` should feed the reference pool
- destination account `6088` maps to **Quarry Heights**
- destination account `7904` maps to **Essex / Berea**
- reference strings and actioned date/time are both important inputs to matching

## Proposed data model (new tables)

### `unit_payment_periods` (one row per unit per month)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `unit_id` | uuid fk → property_units | |
| `period` | date (month) | e.g. 2026-06-01 |
| `expected_amount` | numeric | snapshot of unit rent for the period |
| `status` | text | `unpaid` / `partial` / `paid` / `overdue` / `blocked` |
| `is_blocked` | boolean | unit excluded from expected income this period |
| `notes` | text | editable **only when** no reference is matched yet |

### `payment_references` (the pool)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `organization_id` | uuid fk | |
| `reference` | text | bank/payment reference string |
| `amount` | numeric | |
| `received_at` | date | billing / month bucketing date |
| `transaction_at` | timestamptz null | canonical bank actioned timestamp from Capitec |
| `unit_id` | uuid fk null | set when matched |
| `period` | date null | set when matched |
| `signed_off` | boolean | counts toward the rolling total when true |
| `signed_off_by` / `signed_off_at` | uuid / timestamptz | audit |
| `matched_at` / `matched_by` / `match_method` | timestamptz / text / text | provenance for the per-unit sign-off flow |

> Migrations follow the existing additive pattern (`supabase/migrations/`), with RLS
> mirroring `properties`. A reference is **one-to-one** with a unit-period when
> matched; advance payments are modelled as one reference spanning N periods (see
> open questions).

### `payment_match_events` (append-only audit log)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `organization_id` / `property_id` / `unit_id` | uuid fk | drill-down scope |
| `unit_payment_period_id` | uuid fk null | affected monthly row |
| `payment_reference_id` | uuid fk null | matched / reversed reference |
| `event_type` | text | `matched` / `unmatched` / `signed_off` / `reverse_signed_off` / `blocked` / `unblocked` / `status_changed` / `note_added` |
| `actor` | text | who performed the action |
| `reference_text` / `amount` / `expected_amount` | text / numeric / numeric | snapshot values for audit readability |
| `previous_status` / `new_status` | text / text | status transition |
| `note` | text | optional rationale |
| `created_at` | timestamptz | append-only event timestamp |

### Per-unit table source fields

The reviewed core-view table now needs one explicit **Date** column in addition to
the original unit/contact/expected/reference/received/status/actions layout.

Recommended display mapping:

| UI column | Source | Notes |
|----------|--------|-------|
| `Unit` | `property_units.label` | row anchor |
| `Contact` | property/unit contact data | up to ~2 visible numbers |
| `Exp R` | `unit_payment_periods.expected_amount` | period snapshot |
| `Reference` | `payment_references.reference` | editable/open when unmatched |
| `Date` | `payment_references.transaction_at` | display from the bank actioned timestamp; fall back to `received_at` when older/manual data has no timestamp |
| `Recv R` | `payment_references.amount` | matched incoming amount |
| `Status` | `unit_payment_periods.status` | `paid` / `unpaid` / `mismatch` / `overdue` / `blocked` / `excluded` |
| `Action` | sign-off / manage / unblock | depends on row state |

If the row is still unmatched, the `Date` cell remains blank until a reference is
matched. For imported bank records, the displayed date should trace back to
`payment_references.received_at`, which in turn is sourced from the bank
transaction date/actioned date.

## Dashboard columns (per unit, within a location)

1. **Unit** (e.g. "Unit SX") + occupancy.
2. **Tenant contact(s)** — up to ~2 numbers per unit.
3. **Expected (R)** — unit rent for the period.
4. **Reference** — matched ref (or an **editable/open** field when none matched).
5. **Date** — deposit/payment date for the matched reference.
6. **Amount received (R)**.
7. **Status** — amber-style: `paid` / `overdue` / `partial` / `blocked`.
8. **Signed off / manage** — action to confirm, reverse, or inspect; appends to the rolling total.

Top-of-page summary: **collected vs. expected** ("where are we, out of X"), with
breakdown by location.

## Reviewed screen flow

The reviewed wireframes in `/Users/macdaddy/Documents/DEV/design_handoff_hamba_roadmap/`
make the intended user journey explicit:

1. **Entry layer**: Hamba Trading-level choice between `Chatbox` and `Dashboard`.
2. **Dashboard home**: month stepper, recent-month history strip, rolling-total card,
   by-location collection cards, and a CTA into the operator loop.
3. **Per-unit table**: location drill-down with month stepper, filter, and row states
   for paid, open, mismatch, overdue, and blocked, now with an explicit deposit
   `Date` column in the row grid.
4. **Inline match flow**: `+ match ref` opens a property-scoped unmatched pool beside
   the selected unit, compares expected vs. received amount, and writes the match
   back onto the row.
5. **Sign-off / reverse**: operators sign off on the row; mistakes reverse back into
   the pool with audit preserved.

Two alternative supporting views are also part of the reviewed plan:

- **Location cards**: a location-first selection surface.
- **Status board**: kanban-style unpaid / partial / overdue / paid columns.

## Execution note after operator-loop review

Claude's operator-loop review tightened the build order for this area:

1. **Auto-create payment periods first**
   - on import or month load, create `unit_payment_periods` for occupied,
     non-blocked units so the per-unit table always has rows to work against
2. **Embed the pool into the unit table**
   - `+ match ref` should open a property-scoped unmatched pool beside the target row
   - the standalone global reference-pool page is no longer the v1 primary flow
3. **Ship match / sign-off / reverse before room polish**
   - the current `property_units` seed data is enough to prove the monthly operator loop
   - room manager remains important, but follows once the operational cycle works

This keeps the operator path to four screens: import → dashboard → unit table →
match/sign-off, while collapsing the admin path to property selection → room manager.

## Key rules

- **Amount validation:** a reference's `amount` must match the unit's
  `expected_amount` (can't assign a R4,500 reference to a R2,200 unit) — flag
  mismatches instead of silently accepting.
- **Editable only when open:** a unit-period's fields are editable **only** while no
  reference is matched/signed off; once signed off, it locks and rolls up.
- **Block-off:** un-occupied units can be excluded from expected income.
- **Advance payments:** a tenant paying 3 months must be representable (see below).
- **Reverse sign-off:** a mistaken sign-off must return the reference to the pool,
  unlock the unit-period row, recompute the rolling total, and preserve the audit entry.
- **Date provenance:** the displayed row date should come from the matched payment
  reference, not a manually typed note field.

## Open questions (need owner input / more voice notes)

1. **Advance payments:** one reference → many periods, or split into N matched
   rows? (Owner was undecided — "maybe we can't have that one.")
2. **Partial payments / over-payments:** allowed? how surfaced?
3. **Reference ingestion:** Gmail/Capitec import is now the leading path, but we
   still need confirmation on fallback/manual entry and any non-bank sources.
4. **Period roll-over:** auto-create next month's `unit_payment_periods` from
   current occupancy?
5. **Permissions:** who can sign off vs. view.
6. Build on **HeroUI** (already adopted) — table, status chips, modals; see
   [HeroUI](../ui/heroui.md) and the [forms protocol](../ui/forms.md).

## Phasing

- **P0:** IA split (org-level Chatbox vs. Dashboard entry) plus dashboard-shell
  scaffolding. This is partially underway on `codex/monthly-payments`, but currently
  uses local JSON instead of Supabase tables.
- **P1:** dashboard home + location drill-down from property/unit data.
- **P2:** auto-create periods, inline match flow, sign-off / reverse, rolling total, amber status.
- **P3:** amount validation, block-off, room manager, and richer unit detail.
- **P4:** advance/partial payments and deeper import automation.
