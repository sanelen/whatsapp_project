# Codex Nightly Session Setup Complete ✅

**Status:** Ready to trigger  
**Timestamp:** July 1, 2026 – Session prepared for 2:05–3:00 AM tomorrow  
**GitHub:** All files committed and pushed to `codex/monthly-payments`

---

## What Has Been Prepared

### 1. Session Handover Document
**File:** `docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md`

Comprehensive 1-page handover including:
- Objective & context
- 5 prioritized tasks with estimated time allocations
- Success criteria (15+ tests passing, state verification, breadcrumb fixes, property filtering)
- Reference materials (Linear tickets, test document, architecture notes)
- Fallback/debugging guidance
- Next session context

### 2. Agent Instructions
**File:** `.claude/agents/CODEX-NIGHTLY-SESSION.agent.md`

Detailed step-by-step workflow for Codex including:
- Starting checklist (branch, dev server, app verification)
- Four key tasks with specific files and fix strategies
- Work methodology (start test → investigate → fix → commit → push)
- Help resources (Playwright report, page.pause(), DB queries)
- Time allocation strategy if running out of time
- Post-session context for the team

### 3. Public Registry
**File:** `AGENTS.md`

Added new section `<!-- BEGIN:codex-nightly-session -->` that:
- Documents the nightly session trigger procedure
- Lists what Codex will do and success criteria
- Provides fallback support guidelines
- References the handover and agent instruction files

---

## How to Trigger Codex Nightly Session

### Option A: Direct Invocation (Recommended)

```bash
# Point Codex at the handover document
@codex docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md
```

Codex will automatically:
1. Read the handover
2. Check out `codex/monthly-payments` branch
3. Run the four tasks in priority order
4. Commit and push at the end

### Option B: Manual Trigger

If the scheduled nightly run doesn't fire, trigger manually at ~2:05 AM:

```bash
# In your Claude/Codex interface:
/agent codex
# Then paste the content of:
cat docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md
```

### Option C: Check Status

After the session completes, verify the work:

```bash
# View the new commits
git log --oneline -5 codex/monthly-payments

# Check test results
npm run test:e2e:report

# View what was changed
git diff HEAD~2 HEAD
```

---

## Codex's Priorities (for your reference)

| # | Task | Files | Time | Success |
|---|------|-------|------|---------|
| 1 | Fix E2E selectors/timing | `e2e/*.spec.ts` | 45 min | 15+ tests passing |
| 2 | Verify reversal workflow | `src/lib/monthly-payments.ts`, `src/components/` | 20 min | No orphaned refs |
| 3 | Fix breadcrumbs | Layout files, shell component | 15 min | Breadcrumbs populated |
| 4 | Reference pool filtering | `src/app/monthly-payments/reference-pool/` | 10 min | Property-scoped results |

---

## Key Files Codex Will Reference

```
docs/
  ├── handovers/
  │   └── CODEX-NIGHTLY-SESSION-2026-07-02.md      ← Read first
  ├── testing/
  │   └── monthly-payments-flow-tests.md             ← Expected behaviors
  ├── LINEAR-SYNC.md                                 ← Ticket mapping
  └── ROADMAP.md                                     ← Context
.claude/
  └── agents/
      └── CODEX-NIGHTLY-SESSION.agent.md             ← Detailed instructions
e2e/
  ├── month-context-propagation.spec.ts             ← Target: 50% pass rate
  ├── dashboard-units-reconciliation.spec.ts
  ├── reference-pool-matching.spec.ts
  ├── reverse-rematch-flow.spec.ts
  └── navigation-safety.spec.ts
src/lib/
  └── monthly-payments.ts                           ← Reversal logic
src/components/
  └── monthly-payments/                             ← UI state verification
```

---

## What Success Looks Like

By 3:00 AM tomorrow:

✅ **Tests:** 15+ of 29 E2E tests passing (was ~9/29)  
✅ **State:** Reversal workflow verified clean in code & DB  
✅ **UX:** Breadcrumbs show 2+ items on Units & Room Manager pages  
✅ **Data:** Reference pool filtered by active property  
✅ **Git:** 1–2 focused commits pushed to `codex/monthly-payments`

---

## Next Steps (After Codex Finishes)

1. **Review:** Check the new commits and test results
2. **Decide:** Merge to main or continue stabilization?
3. **Plan:** Update LINEAR-SYNC.md with ticket status
4. **Queue:** Plan next session (AUT-14 env setup? Full flow review? Import refresh?)

---

## Emergency Contacts / Debugging

If Codex gets stuck during the session:

- **Playwright report:** `npm run test:e2e:report` (see what failed)
- **Manual inspection:** Add `page.pause()` to test and run with `--debug` flag
- **Database check:** Query Supabase to verify reference state
- **App health:** Verify dev server running on `http://localhost:3000`

For issues after the session, see the fallback section in `CODEX-NIGHTLY-SESSION.agent.md`.

---

## Commit History (Session Setup)

```
af7718e - Set up Codex nightly session: 2:05–3:00 AM stabilization work
5905d21 - Session updates: test refinements and documentation sync
f8a356b - Add comprehensive E2E tests for monthly payments flows
be375bf - Add monthly payments features: bank import, locations admin, room manager...
```

---

**Ready to go! Codex will pick this up tomorrow at 2:05 AM and autonomously tackle the top 4 priorities. The session is fully briefed and documented.** 🚀
