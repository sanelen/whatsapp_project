<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:serena-agent-rules -->
# Serena memory is enabled for token-efficient project context

When Serena is available, activate this project from the current working directory and read `mem:core` before broad code exploration. Follow its memory references for the specific domain you are touching instead of re-scanning the whole repository.

Keep Serena memories short and durable. Update them only for stable project conventions, architecture decisions, commands, or gotchas that future agents would otherwise rediscover.
<!-- END:serena-agent-rules -->

<!-- BEGIN:product-flow-review-rule -->
# Product flow review is required before building new UI flows

Before starting work on any feature branch that adds new screens, navigation
steps, or multi-step user flows, run the product-flow-review skill (or
follow its process manually if the skill is not available).

This catches phantom steps, dependency gaps, stubbed interactions, and
build-order mistakes before code is written. The review reads HANDOFF.md,
ROADMAP.md, functionality docs, wireframes, route structure, components,
and the lib/service layer, then produces a structured critique.

**When to run:**
- Before any new multi-screen feature or navigation flow
- When wireframes are added or updated
- When the team is deciding build order for a feature set
- When a handoff doc describes a new user journey

**What it checks:**
- Are named steps real screens or phantom navigation?
- Do wireframes match route structure?
- Are interactions built or stubbed?
- Is data that the flow depends on actually created somewhere?
- Is the build order value-first (operational loop before admin setup)?

**Skill location:** `.claude/skills/product-flow-review/SKILL.md`

Do not skip this step. The cost of building the wrong flow is much higher
than the cost of reviewing it first.
<!-- END:product-flow-review-rule -->

<!-- BEGIN:bank-import-debug-rule -->
# Bank import debugging uses a structured diagnosis skill

When investigating bank import issues — missing entries, missing payment
references, "0 references imported", or any failure in the Gmail → Drive →
Database pipeline — run the bank-import-debug skill before exploring code.

The skill documents the full pipeline architecture, common failure modes,
and step-by-step SQL queries for diagnosis. It prevents rediscovering known
issues (billing window mismatches, unmapped accounts, self-healing bugs).

**Skill location:** `.claude/skills/bank-import-debug/SKILL.md`
<!-- END:bank-import-debug-rule -->

<!-- BEGIN:full-flow-review-rule -->
# Full flow review orchestrates the other review skills before merge/release

Before merging a feature branch that touched more than one screen or a
data/status model, before a release or demo, or as a periodic health check on
the primary operator loop, run the full-flow-review skill instead of a single
lens in isolation.

It runs `product-flow-review` (architecture/flow), `playwright-qa` (and
`bank-import-debug` where relevant), and the `design` plugin's
`design-critique`/`accessibility-review` against the same target, adds its own
roadmap-fit check against ROADMAP.md/REQUIREMENTS.md/ARCHITECTURE.md/
LINEAR-SYNC.md, then synthesizes all four into one report — including any
tensions between lenses (e.g. QA passes but architecture flags known debt
underneath it) and a prioritized action list.

For a narrow, single-file change, use the one relevant skill directly instead
— this orchestrator is for merge points, releases, and periodic checks, not
routine edits.

**Skill location:** `.claude/skills/full-flow-review/SKILL.md`
<!-- END:full-flow-review-rule -->

<!-- BEGIN:codex-nightly-session -->
# Codex Nightly Session — Autonomous Work Block (2:05 AM – 3:00 AM)

This project runs an autonomous nightly session where **Codex** works unsupervised on 
high-priority, high-confidence tasks from the monthly-payments operator-loop stabilization phase.

## Session Trigger

To run or reschedule the Codex nightly session:

1. **Read the session brief:**
   ```bash
   cat docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md
   ```

2. **Review the agent instructions:**
   ```bash
   cat .claude/agents/CODEX-NIGHTLY-SESSION.agent.md
   ```

3. **Activate Codex for this session:**
   - Invoke this agent with: `@codex` (or equivalent in your Claude interface)
   - Pass: `docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md`
   - Expected output: Focused work on E2E tests, state machine verification, and breadcrumb fixes

## What Codex Will Do

**Duration:** 55 minutes  
**Branch:** `codex/monthly-payments`  
**Expected commits:** 1–2 focused commits  
**Push target:** `codex/monthly-payments` on GitHub

Tasks (in priority order):
1. Fix E2E test selectors and timing (aim for 50%+ pass rate, ~15/29 passing)
2. Verify reversal workflow leaves no orphaned state
3. Fix navigation breadcrumbs on child pages
4. Confirm reference pool respects property scope

## Success Criteria

By 3:00 AM, the session is successful if:
- ✅ 15+ E2E tests passing
- ✅ Reversal workflow audit clean
- ✅ Navigation breadcrumbs visible
- ✅ Reference pool filters by property
- ✅ Commits pushed to GitHub

## Fallback / Support

If Codex gets stuck:
- Check the Playwright HTML report: `npm run test:e2e:report`
- Look at test screenshots to understand selector issues
- Use `page.pause()` to manually inspect the DOM
- Reference `docs/testing/monthly-payments-flow-tests.md` for expected behaviors

## Between Sessions

After Codex completes:
- Review the commits and run the test suite
- Decide whether to merge to `main` or continue stabilization
- Update `LINEAR-SYNC.md` ticket status
- Plan the next nightly session focus (import refresh, AUT-14 env setup, etc.)

**Session owner files:**
- Handover: `docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md`
- Agent instructions: `.claude/agents/CODEX-NIGHTLY-SESSION.agent.md`
<!-- END:codex-nightly-session -->
