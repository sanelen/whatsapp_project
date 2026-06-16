# Payments Dashboard Roadmap

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **planning only — not approved for build.**

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
| `received_at` | date | |
| `unit_id` | uuid fk null | set when matched |
| `period` | date null | set when matched |
| `signed_off` | boolean | counts toward the rolling total when true |
| `signed_off_by` / `signed_off_at` | uuid / timestamptz | audit |

> Migrations follow the existing additive pattern (`supabase/migrations/`), with RLS
> mirroring `properties`. A reference is **one-to-one** with a unit-period when
> matched; advance payments are modelled as one reference spanning N periods (see
> open questions).

## Dashboard columns (per unit, within a location)

1. **Unit** (e.g. "Unit SX") + occupancy.
2. **Tenant contact(s)** — up to ~2 numbers per unit.
3. **Expected (R)** — unit rent for the period.
4. **Reference** — matched ref (or an **editable/open** field when none matched).
5. **Amount received (R)**.
6. **Status** — amber-style: `paid` / `overdue` / `partial` / `blocked`.
7. **Signed off** — action to confirm; appends to the rolling total.

Top-of-page summary: **collected vs. expected** ("where are we, out of X"), with
breakdown by location.

## Key rules

- **Amount validation:** a reference's `amount` must match the unit's
  `expected_amount` (can't assign a R4,500 reference to a R2,200 unit) — flag
  mismatches instead of silently accepting.
- **Editable only when open:** a unit-period's fields are editable **only** while no
  reference is matched/signed off; once signed off, it locks and rolls up.
- **Block-off:** un-occupied units can be excluded from expected income.
- **Advance payments:** a tenant paying 3 months must be representable (see below).

## Open questions (need owner input / more voice notes)

1. **Advance payments:** one reference → many periods, or split into N matched
   rows? (Owner was undecided — "maybe we can't have that one.")
2. **Partial payments / over-payments:** allowed? how surfaced?
3. **Reference ingestion:** manual entry, CSV/bank import, or PayPal/processor feed?
4. **Period roll-over:** auto-create next month's `unit_payment_periods` from
   current occupancy?
5. **Permissions:** who can sign off vs. view.
6. Build on **HeroUI** (already adopted) — table, status chips, modals; see
   [HeroUI](../ui/heroui.md) and the [forms protocol](../ui/forms.md).

## Phasing

- **P0:** IA split (org-level Chatbox vs. Dashboard entry) + read-only per-unit
  table from property/unit data.
- **P1:** reference pool + match/sign-off + rolling total + amber status.
- **P2:** amount validation, block-off, period roll-over.
- **P3:** advance/partial payments, reference import.
