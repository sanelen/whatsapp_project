# Tenant Conversation Flows (Decision Trees)

> Derived from [2026-06-14 La Lucia Mall session](../../voice-notes/2026-06-14-la-lucia-mall-16.md).
> Status: **planning only — not approved for build.** These are the decision trees
> behind the [WhatsApp tenant assistant](./whatsapp-tenant-assistant.md),
> [payments dashboard](./payments-dashboard.md), and
> [tenant offboarding](./tenant-offboarding.md). Diagrams use Mermaid (renders on
> GitHub / most Markdown viewers).

## 1. Inbound routing — top-level decision tree

Every inbound WhatsApp message is greeted, then classified into one of three tenant
states (or escalated to a human at any point).

```mermaid
flowchart TD
    A([Inbound WhatsApp message]) --> B[Send structured welcome:<br/>“Welcome to Hamba Trading…”]
    B --> C{Detect intent}
    C -->|Looking for a unit| D[Interested / inquiring flow]
    C -->|Existing tenant needs help| E[Servicing flow — DEFERRED]
    C -->|Wants to leave| F[Leaving / offboarding flow]
    C -->|Unclear / sensitive| G{Needs a human?}
    G -->|Yes| H[[Human takeover]]
    G -->|No| B
    D --> H
    E --> H
    F --> H
```

## 2. Interested / inquiring flow (build first)

```mermaid
flowchart TD
    A([Interested tenant]) --> B[Ask: which location?<br/>Query Heights · Westridge · Berea]
    B --> C[Return property info:<br/>links, rules, characteristics]
    C --> D{Unit vacant?<br/>dynamic from occupancy}
    D -->|Yes| E{Tenant wants to apply?}
    D -->|No| F[Capture interest + summary]
    F --> G[Reply: “an agent will get back to you”]
    G --> H[(Persist lead — always follow up)]
    E -->|Ask questions| C
    E -->|Show another| B
    E -->|Yes, apply| I[Start application:<br/>name, contacts, occupants]
    I --> J{Occupants ≤ max?}
    J -->|No| K[Offer another unit] --> B
    J -->|Yes| L[Collect ID + 3 months bank statements]
    L --> M[Confirm received → human review]
    M --> N[(Application recorded)]
```

> Guardrails: answer property questions only up to defined limits (rent, deposit,
> parking, children rules, vacancy); escalate anything outside them. Vacancy should
> reflect live occupancy and in-flight leaving processes.

## 3. Leaving / offboarding flow

```mermaid
flowchart TD
    A([Tenant: “I want to leave”]) --> B[Confirm last day + explain leaving rules]
    B --> C[Mark unit on the market<br/>set is_available + vacancy date]
    C --> D[Exit survey:<br/>“anything we could do better?”]
    D --> E{Reason performance-related?}
    E -->|Yes| F[[Flag for human — retention]]
    E -->|No, things changed| G[State requirements:<br/>rent paid · deposit on inspection]
    G --> H[Request proof of banking document]
    H --> I[Synthesize banking details<br/>human-confirmed]
    I --> J[Inspection → deposit reconciliation]
    J --> K[Thank tenant + archive summary]
```

> Sensitive-data guardrails: banking/ID documents go to the **private** `uploads`
> bucket; never echo full account/ID numbers in chat; don't promise a deposit amount
> before inspection.

## 4. Human takeover (applies to every state)

```mermaid
flowchart LR
    A[Any conversation state] --> B{Escalation trigger?<br/>request · low confidence · sensitive}
    B -->|No| A
    B -->|Yes| C[Set bot_paused = true on thread]
    C --> D[Assign / notify agent]
    D --> E[Agent handles in chat app or dashboard]
    E --> F{Resume bot?}
    F -->|Yes| G[bot_paused = false] --> A
    F -->|No| E
```

## How these map to data & build

- **States & lead/summary** → conversations/messages + a `bot_paused` flag and a
  lead/summary record (see [WhatsApp tenant assistant](./whatsapp-tenant-assistant.md)).
- **Vacancy & property info** → structured property/unit data
  ([property details](./property-details.md)).
- **Application uploads / proof of banking** → private `uploads` bucket
  ([storage](./storage.md)); document parsing reuses `src/lib/kb/sources.ts`.
- **Deposit ↔ rent reconciliation** → [payments dashboard](./payments-dashboard.md).

## Open questions (need owner input / more voice notes)

1. Exact intent-classification triggers per state (keywords vs. LLM classifier).
2. Escalation triggers that should force human takeover.
3. Whether applications live in the chat app, the dashboard, or both.
4. Notice-period and pro-rata rent policy specifics.
