# Import reliability and production API gate — 2026-11-25

Verdict: locally validated implementation; production acceptance remains pending deployed execution; dedicated credentials are provisioned.

Scope: manual import → durable progress → automatic matching → operator review, plus API checks on every production deployment. Trigger: pre-merge/release. Changes replace the synchronous manual request, reuse the existing reconciliation ledger/workflow, skip complete evidence before expensive work, and introduce a restricted release principal.

## Architecture and flow

All steps are real: Overview submits a 202 job, polling reads Workflow status and reconciliation checkpoints, the existing audit exposes source evidence, and existing matching rules run after ingestion. Sign-off remains an operator action. Gmail is paginated and processed in bounded batches; Drive is listed once per mailbox and processed in batches. Repeated starts reconnect to an active job where available; the database uniqueness constraint prevents concurrent reconciliation owners. Refresh restores the job ID. Terminal failure remains visible, and missing/auth-expired jobs release the controls.

Completion is not inferred from a timestamp: checkpoint skipping requires parsed evidence, an archive ID, existing entries and receipts. Gmail validates the exact Drive object before skipping its attachment; Drive listing verifies objects before batch skipping. Missing/incomplete records retain recovery behavior. Original file identity, transaction dedupe, canonical receipt identity and archive-ID compare-and-set remain in place. Known historical archive gaps are reported separately, not silently repaired or moved.

Known architecture §9 debt: this addresses synchronous manual-import timeout and adds progress to the existing reconciliation ledger, without claiming a complete operator run-history screen or solving combined-room allocations/schema consolidation. Scheduled matching uses the same existing rules. No new ledger source of truth is introduced.

## QA

Baseline production evidence: three manual POST requests returned HTTP 504 at exactly 300 seconds. Database activity continued during the request; this was not only a stale browser spinner. The request logs do not establish the selected billing period, so they are not labelled October. A separate December read-only balance snapshot and source audit are retained privately.

Local checks: 303 unit/contract tests, TypeScript, changed-area ESLint, production build and six artifact checks pass. Recovery fixtures verify that completed attachment replay adds no download/storage write, missing archives do not produce false success, and signed-off receipts remain unchanged. The isolated browser flow covers source selection without import, queued status, refresh/reconnect, terminal matching feedback, stale-job recovery, and existing desktop/mobile payment/follow-up journeys. Exact run results are recorded in `.runtime/payment-workspace-check/results.json`.

Production verification is still required: service credentials are provisioned in Production and Actions; the deployed SHA must pass the new API job, and an authorized December Both import must reach a measured terminal result. Local fixture success does not establish live provider performance or financial correctness.

## UI and accessibility

Same Overview controls and audit links; no additional navigation step. Live progress uses `role=status`, shows the server's cycle/stage and saved batches, and explains that leaving the page is safe. Buttons are disabled while queued. Failures are textual, not color-only. The completion copy distinguishes automatic matching from manual sign-off. The ambiguous percentage label changes to “rent covered”; its calculation is unchanged.

The design plugin was unavailable; the equivalent usability/accessibility lens was applied manually against the existing dense operator layout. Desktop/mobile fixture screenshots check wrapping and horizontal overflow. This is not a comprehensive WCAG certification.

## Roadmap fit and tensions

In scope for FR-2.9–2.15 and the owner's 2026-11-25 import/release-check direction. The new production gate is recorded as an owner addition in REQUIREMENTS. Existing staff permissions remain unchanged; the dedicated principal can only perform bounded probes. Linear has no dedicated ticket for this addition; the gap is recorded in LINEAR-SYNC.

QA proves local recovery/control behavior while production credentials and duration remain unverified. API inventory coverage is complete, but validation-only mutation cases do not prove successful persistence. Drive metadata accessibility is separate from original-byte verification; the production probe verifies only a bounded original sample. These limits remain explicit in the report.

## Prioritized remainder

1. Dedicated release credentials are provisioned in Vercel Production and GitHub Actions through the existing authorized sessions. The non-secret property scope is read from the production server.
2. Deploy and pass the authenticated revision-bound API gate; investigate any route/provider failure instead of accepting 401 or fallback as success.
3. Run the authorized current-cycle Both import to terminal status, record actual duration/counts/matches, and verify no sign-off, alert or protected credit change.
4. Retain historical archive gaps and broader mutation E2E acceptance as separate work; no bulk historical moves/reimports are included.

Screenshot checklist: desktop/mobile import results; refresh-resumed job; stale-job error; follow-up totals/drilldown/draft; audit source link and missing-archive state. Captures are local under `.runtime/payment-workspace-check/` and contain isolated fixtures.

## Production acceptance corrections

PR #21 deployed as `895b95d`. Live authenticated checks caught an ambiguous PostgREST receipt relationship shared by the evidence probe and incremental checkpoints. Name the `payment_references_bank_import_entry_id_fkey` backlink explicitly; the reverse entry pointer must not be selected implicitly. Recovery regression checks now assert that relationship.

Provider probes use the fixed production origin instead of generic `APP_URL`, which currently names another host. Vector integration health is reported separately from retrieval choice: a successful embedding and RPC with zero semantic matches is healthy, while provider/RPC failures still fail the gate. An isolated test covers both outcomes. No ledger or messaging mutation is added.

The immutable Vercel deployment hostname is protected by Vercel SSO. The release gate uses the public production custom domain and retains strict deployment-SHA validation; a later deployment replacing the alias fails the older check rather than falsely validating it. Production acceptance remains pending the correction release and December manual import.

The production deployment event did not arrive in GitHub during live acceptance. Keep event-based checks and add a main-push fallback that waits for the exact live SHA, fails after ten minutes, then runs the same signed API checks. Never cancel release checks when a newer release starts.
