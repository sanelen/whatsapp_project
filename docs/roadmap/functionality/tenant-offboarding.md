# Tenant Offboarding Roadmap

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **planning only — not approved for build.**

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

## Guardrails

- Don't promise a deposit amount before inspection.
- Treat banking/ID documents as **sensitive**: private storage, restricted access,
  no echoing back full numbers in chat.
- Performance-related exits escalate to a human (retention opportunity).

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
