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
