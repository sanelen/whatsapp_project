# Roadmap Wireframes

Low-fidelity wireframes for the Hamba roadmap features, plus a database ERD drawn
from the live schema and a design review reconciling the two.

## How to view

- **Interactive:** open `roadmap-wireframes.html` in any browser (self-contained,
  works offline). Pan/zoom the canvas; sections are laid out ①–⑧.
- **Static:** the PNGs in this folder — Claude Code can read these directly to
  "see" each screen (it can't render the HTML).

These are **lo-fi** — they communicate layout, flow, states, and data sources, not
final styling. Build with the app's real stack (Next.js + Tailwind + HeroUI v3 +
Supabase); see `src/components/workspace/workspace-route.tsx`. Read `AGENTS.md`
before any Next.js code.

## Sections

| # | Section | Screens |
|---|---------|---------|
| ① | Payments dashboard | `01-payments-entry-dashboard-home`, `02-payments-per-unit-table`, `03-payments-reference-pool-match`, `06-payments-unit-detail-drawer` |
| ② | WhatsApp tenant assistant | `11-whatsapp-routing-interested`, `12-whatsapp-phone-agent-takeover` |
| ③ | Tenant offboarding | `13-offboarding-stepper-tracker`, `14-offboarding-survey-banking` |
| ④/⑤ | Source data mapping + 1:1 field→column | `07-payments-1to1-field-column-map` |
| ⑥ | Rooms — configure & manage | `15-rooms-manager-create`, `16-rooms-refs-detail`, `17-rooms-feeds-into-map` |
| ⑦ | Database design (ERD, from live schema) | `18-erd-payments-rooms-bank`, `19-erd-proposed-additions` |
| ⑧ | Design review (wireframes ↔ schema) | `20-design-review` |

## Key facts for implementers (from the design review, ⑧)

- The **payments tables already exist** (`property_units`, `unit_payment_periods`,
  `payment_references` — migration `20260629194000`). The payments dashboard read
  path needs **no new migration**.
- The Rooms "reference rules" (⑥) map to the existing
  `bank_import_unit_match_hints` (`reference_contains | _equals | _regex |
  payer_name_contains | amount_equals`) + `property_units.expected_reference` /
  `match_keywords`.
- The payments module is **already built** under `src/app/monthly-payments/**` and
  `src/components/monthly-payments/**` (`monthly-payments-hub`, `units-table`,
  `reference-pool-view`, `bank-import-controls`) + `src/lib/monthly-payments.ts` and
  `src/lib/bank-import.ts`. Treat ① and parts of ⑥ as **enhance-existing**, not new.
- References arrive via the **bank-statement email-import pipeline**
  (`bank_import_*`), not manual entry — the reference pool UI should surface
  imported entries + auto-suggested matches behind a human sign-off.
- The Rooms editor (⑥) needs **new columns** on `property_units` (deposit, parking,
  ensuite, max_occupants, is_available, features[]) + a `property_media` table —
  these are not in the DB yet (additive migration; see ⑦ "proposed additions").
- Field names to use as-is: `period_start` (not "period"), `note` (not "notes"),
  `contact_primary` / `contact_secondary` (not `contacts[]`).

## Source

Designed in HTML; the editable source lives in the design project. Re-export this
folder when the wireframes change.
