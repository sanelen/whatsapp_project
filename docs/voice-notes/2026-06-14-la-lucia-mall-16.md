# Planning Session — La Lucia Mall (2026-06-14)

> Source: voice note `La Lucia Mall 16.m4a` (~11 min), transcribed with
> `npm run transcribe` (OpenAI `gpt-4o-transcribe`). This is a structured brief of
> that session — the owner's words, organized. It is the source for the feature
> roadmaps linked at the bottom. Voice notes are the intended ongoing planning
> channel, so expect this to be revised/extended by later notes.

## The big picture

Hamba Trading rents **multiple properties, each with multiple units**, and
communicates with current/prospective/leaving tenants over a **single WhatsApp
number**. The goal: use LLMs (+ likely Twilio) to make tenant conversations as
**human-free as possible**, with **business guardrails**, while always being able
to **hand over to a human**.

The product splits into **three major capabilities**:

1. **Customer greetings, conversations & document handling** (WhatsApp assistant).
2. **Payments tracking dashboard** (CRM-style, per unit).
3. **Tenant offboarding** (the "leaving" process).

## Information architecture (explicit ask)

- Add a **layer above organizations** with two entry points:
  - **Chatbox** → the existing workspace/chat route we have today.
  - **Dashboard** → the new payments/CRM view.
- The dashboard is a **separate feature** from the chat app, in the same website.

## Feature 1 — WhatsApp tenant assistant

Three tenant states, each a guardrailed conversation:

- **Interested / inquiring** (someone saw a property somewhere, may send an image):
  - Structured **welcome message**: "Welcome to Hamba Trading, how can we help you?
    Would you like to inquire about our properties?"
  - Offer the **3 locations** + links to properties.
  - State **vacancy** (ideally **dynamic** from current conversations/occupancy).
  - Answer property questions up to a point: **rules** (which allow children,
    which are vacant, which have parking), characteristics, and a **structured
    presentation** of properties/locations (videos and richer media later).
  - If no vacancy: capture interest, "**an agent will get back to you**," keep a
    summary so we always follow up.
- **Existing / servicing** (deferred — handled manually for now):
  - Forwarding messages to suppliers; dynamic prompts ("do you want us to send your
    details to someone who'll call you?"). Technical; revisit later.
- **Leaving** → see Feature 3.

Cross-cutting:
- **Human-free as far as possible**, but with the ability to **detach the LLM** and
  let a **human take over**.
- LLMs hold/segment **context**; **guardrails** encode business rules.

## Feature 2 — Payments dashboard (CRM)

- **Per-unit** driven. Hierarchy: **Hamba Trading → 3 locations → units**.
- **Top-line rolling total**: "where are we, out of X amount" (not all units are
  occupied; some can be **blocked off**).
- **Reference assignment workflow**: payment **references** exist in a pool; attach
  a reference to a unit, **sign it off**, and it **appends to the rolling total**.
- **Validation**: a reference amount must match the unit (can't assign a R4,500 ref
  to a R2,200 unit); consider **advance payments** (e.g. 3 months) as a case.
- **Amber/status flagging**: paid / overdue / duration, CRM-style.
- **Editable fields only when open**: a unit's field is editable only when there is
  **no attachment / no reference** aligned to it yet.
- **Per-unit data**: contact details (≈2 per unit), references/attachments.
- Define the **columns** clearly (see the dashboard roadmap).

## Feature 3 — Tenant offboarding (leaving)

Triggered when a tenant says "I want to leave; my last day is end of month":
- Start an **alerting/understanding** process; explain the **rules of leaving**.
- Put the unit **on the market**.
- Send an **exit survey**: "sorry to see you go — anything we could do better? Is
  the reason performance-related?" If "no, things changed," proceed.
- Leaving requirements: **rent paid for the month**, **deposit paid based on
  inspection**.
- Collect **proof of banking** (document) → synthesize the **banking details**
  needed to pay the deposit back.
- **Thank them** and wish them well.

## Owner notes

- Wishes the earlier (unrecorded) version had been captured; will iterate.
- **Voice notes are the main roadmap strategy** for offline planning — more coming.

## Derived roadmaps

- [WhatsApp tenant assistant](../roadmap/functionality/whatsapp-tenant-assistant.md)
- [Payments dashboard](../roadmap/functionality/payments-dashboard.md)
- [Tenant offboarding](../roadmap/functionality/tenant-offboarding.md)
