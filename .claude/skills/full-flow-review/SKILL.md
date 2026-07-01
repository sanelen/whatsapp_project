---
name: full-flow-review
description: >
  Orchestrate a full multi-lens review of a feature, flow, or the whole app —
  architecture/flow, QA/testing, UI/UX, and roadmap-fit — and synthesize the
  four verdicts into one report with explicit disagreements and a prioritized
  action list. Use when: "full flow review", "review this end to end",
  "run all the reviews", "orchestrate the review", "pre-release check",
  "multi-agent review", "check architecture QA and UX together", or when the
  user wants more than one lens applied to the same feature at once. This is
  the orchestrator — it runs product-flow-review, playwright-qa, and the
  design plugin's design-critique/accessibility-review, then adds a
  roadmap-fit pass this skill owns directly.
---

# Full flow review (orchestrator)

One target, four lenses, one report. This skill does not replace
`product-flow-review`, `playwright-qa`, `bank-import-debug`, or the `design`
plugin's `design-critique`/`accessibility-review` — it runs them in sequence
against the same target and merges their verdicts, because a bug that looks
fixed to QA can still be an architecture smell, and a screen that passes
accessibility can still be the wrong flow. Reviewing each lens in isolation is
how the payments dashboard shipped a "collected but 0 paid" contradiction that
no single lens would have caught alone: QA would say the match action
succeeded, UX would say the numbers render fine, and only an architecture lens
asking "is there one status source of truth?" would have flagged it.

## When to run

- Before a feature branch merges, if it touched more than one screen or
  changed a data/status model.
- Before a release or demo, run it against the primary operator loop
  end-to-end (currently: monthly payments).
- When the user asks for "a full review" rather than a single-lens check.
- Periodically (monthly-ish) against the whole app, even with no pending
  change, to catch drift between docs and implementation.

Do not run this for a one-line fix or a single-component tweak — use the
single relevant lens directly instead (it's cheaper and just as accurate for
narrow changes).

## Step 0: Define the target

Before invoking anything, write down:

- **Scope**: one flow (e.g. "match/sign-off loop"), one feature area (e.g.
  "monthly payments"), or "whole app."
- **Trigger**: pre-merge, pre-release, or periodic health check.
- **What changed since the last review of this scope**, if anything (check
  `docs/handovers/` and `git log` for the relevant paths).

## Step 1: Architecture & flow lens

Invoke the `product-flow-review` skill scoped to the target. It reads
HANDOFF.md, ROADMAP.md, the relevant functionality docs, wireframes, routes,
components, and lib layer, then produces: overcomplicated areas,
under-specified areas, merge/split/reorder recommendations, the true happy
path, and recommended build order/v1 boundary.

Also check directly against `docs/ARCHITECTURE.md` §9 (Known architectural
debt) — flag if the target touches any item on that list, since those are
known landmines (schema drift, missing RLS, unimplemented deposit-split
logic, no Drive→Supabase reverse import).

**Output of this step:** a verdict per named step in the flow (phantom /
real, built / stubbed) plus any architectural debt the change touches or
should resolve.

## Step 2: QA / testing lens

If the target has existing E2E coverage, invoke `playwright-qa`: run the
relevant spec(s) in `e2e/`, read the HTML report, and classify each failure as
a test bug or an app bug.

If the target is bank-import-specific, also run `bank-import-debug`'s
diagnosis steps (billing window, message/file/entry state, property
mappings).

If no automated coverage exists yet, do a manual flow-walk using the
conventions in `docs/testing/monthly-payments-flow-tests.md` (or the
equivalent flow doc for the target area): state preconditions, steps,
expected outcome, and what to capture on failure (selected month, property,
unit, reference, transaction date, expected vs. received amount).

**Output of this step:** pass / fail / not-yet-testable per flow, matching
the verdict scale already used in
`docs/testing/functional-loop-review-2026-07-01.md`:

| Verdict | Meaning |
|---|---|
| ✅ Pass | Verified working, automated (if it exists) and in browser. |
| ⚠️ Pass with caveats | Works, but with a known rough edge. |
| ❌ Fails | Confirmed broken or contradictory. |
| ⏳ Not yet testable | Feature doesn't exist yet. |

## Step 3: UI/UX lens

Invoke the `design` plugin's `design-critique` skill against the target
screens for usability, hierarchy, and consistency. If the target includes
forms, also check against `docs/roadmap/ui/forms.md` (the forms enhancement
protocol) and note any drift from the HeroUI adoption in
`docs/roadmap/ui/heroui.md`.

Invoke `accessibility-review` for a WCAG 2.1 AA pass on the same screens —
color contrast, keyboard navigation, touch target size, screen reader
behavior.

Hold both against the standing product direction from the 2026-07-01 UI
review (`docs/audits/monthly-payments-ui-flow-review-2026-07-01.md`): denser,
less decorative, less ambiguous, faster to scan, easy to trace from
amount → property → room → reference → source rule.

**Output of this step:** usability/consistency findings, a11y findings, and
a density/clarity verdict against the standing product direction.

## Step 4: Roadmap-fit lens (this skill's own check — no sub-skill exists yet)

This is the lens the other three don't cover: does the change belong here,
now, at this scope? Check the target against:

1. **`docs/ROADMAP.md`** — does this fit the current phase, or does it pull
   forward work from a later phase (e.g. building offboarding UI before the
   WhatsApp assistant and payments operator loop are stable)?
2. **`docs/REQUIREMENTS.md`** — does the change satisfy an existing FR/NFR, or
   does it introduce new scope that has no requirement yet? If new scope,
   flag that REQUIREMENTS.md needs an entry.
3. **`docs/ARCHITECTURE.md`** — does the change fit the existing data
   model/pipeline, or does it introduce a second source of truth for
   something that already has one (the exact failure mode that caused the
   dashboard contradiction)?
4. **`docs/LINEAR-SYNC.md`** — is there a ticket for this? If not, flag it as
   a gap to add (see that file's "Gaps not yet ticketed" section) rather than
   letting it go untracked.

**Output of this step:** in-scope / out-of-scope / premature, plus any
doc/ticket gaps this change should close.

## Step 5: Synthesize

Do not hand back four separate reports. Produce **one** document with:

1. **One-line verdict** — ship it / ship with caveats / fix first / not
   ready.
2. **Per-lens summary** — 2-4 lines each from steps 1-4.
3. **Tensions between lenses** — this is the most valuable section. Examples
   of the shape to look for:
   - QA says a flow passes, but architecture flags it as sitting on top of
     known debt (data will need to change again soon).
   - UX says a screen is clean, but roadmap-fit says it's solving a problem
     nobody asked for yet.
   - Architecture says the happy path is tight, but QA has no automated
     coverage for it yet.
   If no tensions exist, say so explicitly — don't manufacture disagreement.
4. **Prioritized action list**, ordered:
   1. Broken functionality (QA ❌ or architecture flags a real bug)
   2. Architectural debt the change touches or worsens
   3. Roadmap/requirements misalignment or missing tickets
   4. UX/a11y polish
5. **Screenshot checklist**, if the target has UI — reuse the format in
   `docs/testing/functional-loop-review-2026-07-01.md`.

Save the report to `docs/reviews/full-flow-review-<YYYY-MM-DD>-<scope-slug>.md`
(create `docs/reviews/` if it doesn't exist) and link it from
`docs/README.md` under a "Full flow reviews" section.

## Notes on cost/effort

Four lenses is expensive if run on everything. Reserve it for merge points,
releases, and periodic health checks — not routine single-file changes. For a
narrow change, invoke the one relevant skill directly instead of this
orchestrator.
