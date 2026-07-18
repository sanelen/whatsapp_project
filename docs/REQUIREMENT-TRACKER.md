# Requirement Tracker

Last reconciled: 2026-07-18

This is the progress register shared by repository requirements, Linear, and
scheduled jobs. It answers four questions for every requirement: is it still valid,
has it been met, what evidence proves that, and may a nightly job select it?

## Status vocabulary

- **Active** — valid and eligible for the named job, subject to dependencies.
- **Met** — acceptance evidence exists on the current production/main baseline.
- **Partial** — valid and partly evidenced; only the named remainder is selectable.
- **Deferred** — still valid but not eligible for nightly implementation.
- **Needs decision** — product or safety choice is missing; jobs may investigate but
  not implement the irreversible choice.
- **Invalid** — obsolete, duplicate, unrelated, or superseded; never select.

Linear workflow status and requirement validity are separate. For example, a valid
future requirement can be `Deferred` here and `Backlog` in Linear; a `Done` Linear
issue can still need its description corrected when the shipped product changed.

## Current register

| Requirement / Linear | Validity | Delivery | Nightly eligibility | Current evidence / exact remainder |
|---|---|---|---|---|
| NAV-1 / public + staff navigation | Valid | Met | No | Production: public `/`; Google-only `/staff`; Chatbox, Payments, Admin; logout. |
| AUTH-1 / AUT-16 | Valid | Met | No | Google-only approved-email flow shipped. Old password/open-signup issue wording is superseded. |
| ENV-1 / AUT-14 | Valid | Met | No | Preview/Production runtime configuration and production flow verified 2026-07-13/17. |
| CHAT-1 / AUT-29 | Valid | Partial | Active, priority 1 | Inbox UI/schema foundation reported off-main; current `main` still needs the durable server-only repository and live loading/error boundaries. |
| CHAT-2 / AUT-8 | Valid | Partial | Active after CHAT-1 | Persist takeover/manual reply/resume atomically; re-check state before automated send. |
| CHAT-3 / AUT-15 | Valid | Partial | Active after CHAT-1/2 | Exact Meta webhook signature exists; provider-neutral events, idempotency, delivery states, and sandbox remain. |
| CHAT-4 / AUT-7 | Valid | Not started | Active after CHAT-1–3 | Configurable first-contact greeting and no-repeat intake; removed nested paths are not current evidence. |
| CHAT-5 / AUT-11 | Valid | Not started | Active with CHAT-4 | Verified property-scoped business truth and guardrails; generic/sample knowledge is insufficient. |
| CHAT-6 / AUT-12 | Valid | Not started | Active after CHAT-1–5 | Fixture/sandbox end-to-end validation. Real tenant sends remain prohibited unattended. |
| CHAT-7 / AUT-10 | Valid | Partial | Deferred | Existing settings/KB UI is reusable; WhatsApp-specific behavior controls wait for durable state contracts. |
| CHAT-8 / AUT-30 | Valid | Not started | Read-only discovery only | Provider/account/number ownership and rollback audit; cutover always owner-present. |
| DATA-1 / AUT-9 | Valid | Partial | Active only when required by CHAT-1/2 | Current root schemas still need one clean source of truth; legacy nested migration claims are not current proof. |
| KB-1 / AUT-17 | Valid | Partial | Deferred from Chat nightly | 768-dim vector upload/retrieval is shipped; remaining data-source breadth/race-hardening must be re-scoped rather than rebuilding the core. |
| PAY-1 / AUT-20 | Valid | Met | No | Payments operator loop, imports, matching, sign-off/reversal, audit/config and staff navigation shipped. |
| PAY-2 / AUT-33 | Valid | Active | Current UI fix | Recent strip must show imported/unmatched money separately from matched coverage, select the active billing period after the 9th, and use the approved blue palette. |
| OFFBOARD-1 / AUT-21 | Valid | Not started | Deferred | Leaving/offboarding remains a future owner-promoted workstream. |
| UI-1 / AUT-22 | Valid in part | Partial | Only when a selected UI slice needs it | HeroUI is installed and used selectively. No wholesale component migration or dark-mode job is approved. |
| TOOL-1 / AUT-19 | Valid | Met | No | Voice-note transcription CLI shipped. |
| ACCESS-OLD / AUT-18 | Invalid | Not applicable | Never | Unspecified Equal Experts account reconnection is unrelated to the current approved Hamba access model. |
| OPS-1 / AUT-32 | Valid | Partial | Reconciliation job only | Two-day requirements reconciliation is active; this register still needs to merge to `main` before it becomes the shared job input. |

## Nightly completion protocol

Every implementation job must, before selecting work:

1. Read this tracker, the authoritative requirement, and the live Linear issue.
2. Verify current `origin/main` source/tests before trusting a handover or issue claim.
3. Select only an eligible `Active` row whose dependencies are met.

Before finishing, the job must:

1. Record the requirement ID, branch/commit, tests, browser/sandbox evidence, and
   remaining acceptance criterion in its handover.
2. Update the matching Linear issue with verified progress; move it to `Done` only
   when every current acceptance criterion is evidenced.
3. Update this tracker in the same branch/PR. If the requirement is no longer valid,
   set `Invalid` or `Deferred` and explain why rather than silently choosing another
   interpretation.
4. Never mark work Met solely from a mock, plan, old branch, or old handover.

## Two-day reconciliation protocol

AUT-32's requirements-review job runs every two days and does not implement product
features. It compares this register with `REQUIREMENTS.md`, workstream specs, current
`origin/main`, tests/build evidence, production evidence where safely available, and
all Linear issues in the project. It reports and corrects:

- Linear status/description drift;
- requirements marked Met without evidence;
- finished work still presented as an active queue;
- valid requirements hidden behind stale paths or terminology;
- duplicate, invalid, or owner-deferred work;
- new untracked requirements discovered in owner feedback.

Any ambiguous product decision becomes `Needs decision`; the review job must not
invent the answer.
