# WhatsApp Tenant Assistant Roadmap

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **planning only, but design-reviewed against the 2026-06-29 wireframe handoff.**

## Goal

A guardrailed, LLM-driven assistant on Hamba Trading's single WhatsApp number that
handles tenant conversations **human-free as far as possible**, while always
allowing a **human to take over**. It serves three tenant states: **interested**,
**existing/servicing** (deferred), and **leaving** (see
[offboarding](./tenant-offboarding.md)).

## Relationship to existing work

- This is the **WhatsApp/Twilio platform** that was removed in the repo flatten and
  parked under **AUT-15** (decision: port back vs. close). This session is the
  owner confirming the platform **is** wanted — AUT-15 should be resolved as
  "port/rebuild into `src/`."
- It reuses the current grounded-reply pipeline: `src/app/api/chat/route.ts`
  (provider routing + retrieval) and `retrieveKnowledge` in `src/lib/kb/vector.ts`.
- It depends on **structured property/unit data** (vacancy, parking, children
  rules) — see [property details](./property-details.md). The assistant's answers
  are only as good as that data.

> **Decision trees / flow diagrams** for every state live in
> [tenant conversation flows](./tenant-conversation-flows.md).

## Conversation design

The reviewed wireframes clarify the intended linear operational flow:

1. **Inbound greeting** on the shared WhatsApp number.
2. **Intent detection** into interested, servicing, leaving, or unclear/sensitive.
3. **Interested path**: location selection → property info → live vacancy check →
   application or lead capture.
4. **Human takeover path**: any branch can detach the bot and move the thread into
   an agent workspace with lead summary and actions.
5. **Leaving path**: hands off into the offboarding sequence.

### State A — Interested / inquiring (priority)

1. **Welcome** (structured): "Welcome to Hamba Trading, how can we help you? Would
   you like to inquire about our properties?" + the **3 locations** with links.
2. **Property info on request**: vacancy status, rules (children allowed?, parking?,
   vacant?), characteristics, and a **structured presentation** (later: images/
   videos via [KB photos](./knowledge-base-photos.md) / property media).
3. **Vacancy is dynamic** where possible — driven by unit `is_available` +
   in-flight leaving processes.
4. **No vacancy** → capture the lead, reply "an agent will get back to you," and
   persist a **summary** so follow-up always happens.
5. Inbound **images** (e.g. a listing screenshot) are accepted; intent is inferred.

### State B — Existing / servicing (DEFERRED)

Handled manually for now. Future: forward messages to suppliers, dynamic prompts
("send your details to someone who'll call you"). Technical — revisit after A & the
[payments dashboard](./payments-dashboard.md).

### State C — Leaving

Routes into the [offboarding flow](./tenant-offboarding.md).

## Cross-cutting requirements

- **Human takeover / LLM detach:** every conversation can be flipped to a human;
  the bot pauses for that thread (this maps to the parked **AUT-8** "human handoff /
  bot pause").
- **Agent workspace shape:** the reviewed design expects a 3-pane takeover surface:
  conversation list, active thread, and a summary/actions rail.
- **Guardrails:** business rules (pricing, occupancy, leaving rules) constrain the
  LLM; it should refuse/escalate outside them rather than improvise.
- **Context segmentation:** per-conversation memory keyed by WhatsApp contact; reuse
  the chat memory-mode work (`retrieval`/`rolling_window`/`hybrid`).
- **Lead/summary persistence:** every inquiry leaves a durable, followable record.

## Architecture sketch (to validate before build)

- **Inbound webhook** `POST /api/whatsapp/webhook` (Twilio) → verify signature →
  load/lookup contact + conversation → classify state → run guardrailed LLM turn
  with KB/property grounding → reply via Twilio; persist transcript + summary.
- **State + handoff** stored in Supabase (conversations, messages, `bot_paused`
  flag, assigned agent).
- **Templates** for the structured welcome and property cards (WhatsApp message
  templates).
- Recover the old implementation as a reference: `git show
  569efde:SAWhatsApp/platform/<path>` (per HANDOFF.md).

## Open questions (need owner input / more voice notes)

1. Twilio vs. WhatsApp Cloud API; which number/sender.
2. How "dynamic vacancy" is sourced (occupancy table vs. manual toggle).
3. Lead storage: extend `customers`/`conversations` or a new `leads` table.
4. Human-handoff UX: where agents see and claim paused threads (chat app vs. the
   new dashboard).
5. Media/presentation format for properties (cards, PDF, video links).

## Phasing

- **P0:** resolve AUT-15; confirm Twilio/Cloud API; webhook skeleton + signature.
- **P1:** State A happy path — welcome, property info from structured data, live
  vacancy-aware branching, lead capture + summary.
- **P2:** human takeover / bot-pause + 3-pane agent view.
- **P3:** leaving flow (State C) integration.
- **P4:** servicing (State B) + dynamic supplier forwarding.
