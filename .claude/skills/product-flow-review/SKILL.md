---
name: product-flow-review
description: >
  Run a sharp product-flow critique before building new UI flows or features.
  Reads repo docs, wireframes, and current implementation to challenge flow
  assumptions, find overcomplicated or under-specified areas, and recommend
  the tightest operator/admin paths. Use when: "review the flow", "critique
  the product", "is this flow right", "challenge my assumptions", "product
  review", "flow review", or before starting any new feature branch that
  adds screens or navigation. Also trigger proactively when the user is
  about to build a new multi-screen flow without having validated the
  product logic first.
---

# Product flow review

A structured critique of product flows against repo docs, wireframes, and
implementation. Optimizes for operational clarity, low cognitive load, and
realistic workflows. Prefers tightening flows over adding surfaces.

## When to run

Run this review:
- Before building any new multi-screen feature or navigation flow
- When the user questions whether their flow is correct or tight
- When a handoff doc or roadmap describes a new user journey
- After wireframes are added or updated
- When the team is deciding build order for a feature set

## Process

### 1. Gather context

Read these sources in order. Skip any that don't exist, but read all that do:

1. **HANDOFF.md** — current state, what's built, what's planned
2. **docs/ROADMAP.md** — phases, execution status, open questions
3. **Functionality docs** — `docs/roadmap/functionality/*.md` for the feature area
4. **Wireframes** — `docs/repo_wireframes/docs/roadmap/wireframes/README.md` first, then relevant PNGs
5. **Route structure** — `src/app/<feature>/**/page.tsx` to see what pages exist
6. **Components** — `src/components/<feature>/**` to see what's built
7. **Lib/service layer** — `src/lib/<feature>.ts` to see what data flows exist

Do not skim. Read the actual files. The review quality depends on knowing
what the wireframes show vs what the code does vs what the docs claim.

### 2. Map the claimed flow

Write out the flow the team says they want, step by step:
- What are the named steps?
- What screen does each step correspond to?
- What's the user's goal at each step?
- What data does each step need from the previous one?

### 3. Challenge each step

For every named step, ask:

- **Is this a real step or a phantom?** Does it have its own screen, or is
  it actually a click/state on another screen? If removing the step name
  doesn't remove any functionality, it's a phantom step. Kill it.
- **Is this step doing one thing?** If it does two unrelated things, it
  should be split. If two adjacent steps are really one form, they should
  be merged.
- **Does the wireframe match the route?** If the wireframe shows an inline
  panel but the code has a separate page, flag the mismatch.
- **Is the interaction built or stubbed?** Buttons with no handlers,
  components with no server actions — these are the gap between "exists"
  and "works."
- **Is there an implicit dependency?** Data that needs to exist before the
  step works (e.g., period rows, seed data, lookup tables) but has no
  creation workflow.

### 4. Identify the true happy path

Strip the flow to the minimum screens and actions the operator needs to
complete their core job. The operator's question is simple — answer it:

- For payments: "Did every tenant pay this month?"
- For onboarding: "Is this property ready for tenants?"
- For support: "Is this issue resolved?"

The happy path is the shortest loop from question to answer. Everything
else is either setup (admin) or edge-case handling (inline).

### 5. Evaluate the build order

The build order should follow value delivery:
- What gives the operator a working end-to-end loop first?
- What unblocks real usage vs. what polishes admin setup?
- Are we building setup forms before the operational loop they feed?

If the build order puts admin/setup before the core operational loop,
flag it and recommend flipping.

### 6. Draw the v1 boundary

Apply one test: **can the operator complete a full cycle end-to-end?**

- **In v1:** everything the operator needs for one complete cycle
- **Out of v1:** admin polish, alternative views, edge-case models,
  features that feed other product surfaces

### 7. Produce the deliverable

Output a structured review covering:

1. **Where the plan is overcomplicated** — phantom steps, split forms,
   unnecessary navigation
2. **Where it's under-specified** — missing data creation, stubbed
   interactions, ambiguous navigation, no auto-logic
3. **What should be merged, split, or reordered** — specific
   recommendations with wireframe references
4. **The true happy path** — operator flow and admin flow, stripped to
   minimum screens
5. **Recommended product flow** — the tightened version
6. **Recommended build order** — value-first sequence
7. **Recommended v1 boundaries** — what's in, what's out, and why

Use a direct, critical tone. Challenge assumptions. Reference specific
wireframes, files, and code. Do not summarize politely — call out what's
wrong and why.

When possible, produce a visual flow diagram showing the tightened flow
with build status (built vs needs building) and a document the team can
reference.
