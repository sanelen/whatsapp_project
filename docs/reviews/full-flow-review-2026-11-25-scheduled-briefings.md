# Scheduled management briefings — pre-release review

Scope: existing daily source check → matching → current-cycle audit → manager
briefing. Owner requested three separate property briefings on the 1st and 7th in
SAST, replacing daily change alerts. No additional real sends on 25 November.

Verdict: ship with the provider caveat below; verify effective production config
and deployed checks after merge. Future delivered/read receipts are not yet testable.

## Architecture and flow

The existing durable workflow awaits every Gmail batch and Drive batch, then
matches unambiguous rules, finalizes the audit, and evaluates delivery. Both manual
and scheduled imports use this path. No phantom screen or second scheduler is
introduced. A clean manual Both import with matching completed satisfies the day;
partial, failed or incomplete evidence does not. A conditional unsigned/unmatched
write prevents an overlapping automatic match from overwriting another match or
sign-off. Existing pending balance computation and manual confirmation remain.

The unchanged Vercel cron is `0 5 * * *`; Hobby starts within 07:00–08:00 SAST.
The date gate runs after completion and permits only the 1st and 7th. Delivery may
follow the hour window if the import takes longer. No off-date catch-up is created.
The explicit production allowlist contains Quarry Heights, Berea and West Rich;
property ownership is verified before sending. Existing dedicated credentials,
template, manager opt-in and HTTPS review links are reused.

Each property/date has its own atomic unique claim. Identical balances on December
1 and December 7 are intentionally sent twice, once per requested date. Repeated
runs on the same date cannot send again. Unknown attempts remain blocked for
investigation. One blocked building does not prevent checking the other buildings.

## QA and status evidence

323 unit/contract tests, production build, six artifact checks and focused lint
pass. Isolated tests cover all December dates, UTC/SAST boundaries, December 1 and 7 with
three separate scope links, unchanged content across dates, per-date replay caps,
failed property isolation, empty/invalid allowlists, missing/failed matching,
manual source-check satisfaction, and failed/partial source fallback. Persistence
verification executes the actual match service against an isolated transport:
unique matches remain pending, ambiguity stays unmatched, replay does not rematch,
and a concurrent staff match/sign-off wins without being overwritten.

The receipt reader joins the exact provider message to stored signed webhook
events, checks sender and recipient, and distinguishes accepted, sent, delivered,
read and failed. A later-arriving sent event cannot downgrade delivered/read proof.
Error 131049 enforces a 24-hour minimum cooldown; date gating still restricts the
automatic next attempt to December 1. No ledger claims or fabricated receipt rows
are created during verification.

Earlier production audits provide real sequencing evidence: scheduled run
`105d837e-a4a6-4a20-94e3-c2ce8b6411e5` completed with two matches and zero matching
failures; manual run `1ed014d1-2679-4291-8ab1-bba60d71e105` completed with one match
and zero failures. Both had clean Gmail + Drive current-cycle audits. These are
historical observations, not evidence of a future scheduled send.

## UI, accessibility and roadmap

Rent Follow-up retains its building/month selection and inline briefing panel.
The source-check card uses the latest manual or scheduled audit, so a clean manual
check does not leave a false stale scheduled status. The panel shows the effective schedule and a separate read-only Check delivery
status button. Failure text says not delivered and exposes the provider error;
acceptance is never labeled delivery. Desktop 1440×1000 and mobile 390×844 checks
pass with no overflow or browser errors; the mobile result was visually reviewed.
Buttons keep visible focus and minimum 44px height, and receipt text is a status.

This is owner-promoted PAY-7 scope. Requirements, tracker and Linear gap register
are updated; no dedicated PAY-7 Linear issue is mapped. No tenant notifications,
sign-off automation, or historical receipt repair is introduced. The existing
manual draft remains available without changing the automatic schedule.

## Tensions and remaining verification

The application can enforce scope, timing, freshness and at-most-once attempts;
it cannot guarantee Meta delivery. The approved template is categorized Marketing.
West Rich's 25 November attempt has a real failed webhook (131049), while Berea
was delivered. This must stay visible and must not trigger a same-day retry.

Release checklist (revision-bound results recorded in PR #29): deployed revision, production-only allowlist,
active cron, 31 API checks and 10 deployed browser checks, and confirm today's
three existing attempt records have not increased. December 1/7 execution and
delivered/read outcomes must be verified when they actually occur.
