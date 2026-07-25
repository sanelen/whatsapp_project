# Tenant Offboarding Roadmap

Last updated: 2026-07-24

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **planning only, but now aligned to the reviewed wireframe sequence.**

## Goal

Handle a tenant **leaving** end-to-end: capture notice, explain the rules, put the
unit back on the market, run a short exit survey, collect what's needed to return
the deposit, and close out gracefully. Initiated from the
[WhatsApp assistant](./whatsapp-tenant-assistant.md) (State C) and reflected in the
[payments dashboard](./payments-dashboard.md).

> See the [leaving flow diagram](./tenant-conversation-flows.md#3-leaving--offboarding-flow).

## Trigger

Tenant messages something like: "I want to leave; my last day is the end of the
month." The assistant recognizes intent and starts the offboarding process.

## Flow

1. **Acknowledge + rules:** confirm the leaving date and explain the **rules of
   leaving** (notice, rent obligations, deposit conditions).
2. **Market the unit:** mark the unit **on the market** (sets `is_available` and an
   expected vacancy date; feeds dynamic-vacancy answers in State A).
3. **Exit survey:** "Sorry to see you go — is there anything we could do better? Is
   the reason performance-related?"
   - If performance-related → flag for human follow-up / retention.
   - If "things changed" → proceed.
4. **Leaving requirements:**
   - **Rent paid** for the final month (ties to the payments dashboard status).
   - **Deposit** returned **based on inspection** (damages deducted).
5. **Banking details:** request **proof of banking** (document). The system
   **synthesizes the banking details** needed to pay the deposit back (account
   name/number/bank/branch), surfaced for the team to action the refund.
6. **Close:** thank the tenant and wish them well; archive the conversation with a
   summary.

## Reviewed screen flow

The wireframe handoff breaks the offboarding experience into four connected screens:

1. **Leaving stepper**: the end-to-end tenant flow from notice through closure.
2. **Offboarding tracker**: the staff-side operational board for `notice`,
   `marketed`, `inspection`, `deposit_pending`, and `closed`.
3. **Exit survey**: the branch point for performance-related departures and retention
   escalation.
4. **Deposit & banking**: private proof-of-banking upload, masked synthesized details,
   inspection-based deduction, and refund confirmation.

## Data touchpoints

- **Unit:** `is_available = true`, expected vacancy date (property/unit model).
- **Offboarding record (new):** `tenant_offboardings` — unit_id, notice_date,
  last_day, reason, reason_is_performance (bool), survey_response, inspection_status,
  deposit_amount, banking_proof (storage path), banking_details (parsed jsonb),
  status (`notice` → `marketed` → `inspection` → `deposit_pending` → `closed`).
- **Document handling:** proof-of-banking stored in the **private** `uploads`
  bucket (never public) — see [storage](./storage.md). Parsing the document to
  extract banking details can reuse the KB parser (`src/lib/kb/sources.ts`) plus a
  structured-extraction LLM step.

## Deposit lifecycle model

Owner review on 2026-07-24 promoted the deposit problem from a room-level balance
into a tenant-lifecycle requirement. The room stays the same, but the deposit must
belong to the tenant's stay in that room so an old tenant can be refunded and a new
tenant can start with a fresh deposit ledger. The canonical requirements and test
scenarios now live in
[MONTHLY-PAYMENTS-STAY-LIFECYCLE.md](../../requirements/MONTHLY-PAYMENTS-STAY-LIFECYCLE.md).

Recommended model:

- **Occupancy episode (new):** add `unit_occupancies` or `tenant_unit_stays` with
  `unit_id`, tenant/contact snapshot, `status` (`holding`, `active`, `notice`,
  `ended`), `starts_on`, `ends_on`, `deposit_target_amount`, and `closed_at`.
- **Deposit ledger entries (new or replacement):** record every movement against
  the occupancy episode, not only the unit: `charge`, `contribution`, `refund`,
  `deduction`, `interest`, `adjustment`, and `reversal`. Each entry should carry
  the source payment reference or payout evidence where applicable.
- **Payment reference attachment:** `payment_references` can stay attached to the
  unit/month for reconciliation, but deposit-specific allocations should point to
  the active occupancy episode.
- **Close-out:** when the tenant leaves, the offboarding flow freezes the old
  occupancy episode, records inspection deductions/refund/interest, and closes the
  deposit balance. The next tenant creates a new occupancy episode and a new
  deposit ledger for the same room.
- **Payments dashboard display:** the expanded room row should default to the
  current occupancy episode's deposit balance and expose a link or modal to
  previous occupancies. This prevents old tenant deposits from making the current
  room look funded.

Safe UI slice already allowed inside monthly payments:

- Show the latest matched payments for the selected room across the current and
  previous two billing months.
- Split each reference visually into rent, deposit, and held-credit portions.
- Do not mutate deposit ownership until the occupancy episode schema exists.

## Guardrails

- Don't promise a deposit amount before inspection.
- Do not carry a closed tenant's deposit balance forward into the next tenant's
  occupancy episode.
- Do not mark a deposit as refunded unless payout evidence has been captured and
  reviewed by a human.
- Treat banking/ID documents as **sensitive**: private storage, restricted access,
  no echoing back full numbers in chat.
- Performance-related exits escalate to a human (retention opportunity).
- Banking confirmation views must mask full account numbers and require human review
  before payout is marked complete.

## Open questions (need owner input / more voice notes)

1. Inspection workflow — in-app checklist or manual/offline?
2. Notice-period rules (minimum notice, pro-rata rent) — exact policy.
3. Who actions the deposit refund and where (dashboard vs. external banking).
4. Automated vs. human-reviewed banking-detail extraction (sensitive — likely
   human-confirmed).

## Phasing

- **P0:** offboarding record + manual status transitions in the dashboard.
- **P1:** WhatsApp-initiated notice + exit survey + unit auto-marketed.
- **P2:** proof-of-banking upload + assisted detail extraction (human-confirmed).
- **P3:** inspection checklist + deposit reconciliation against payments.
