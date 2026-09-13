# Payment Production Release Handover

## Release intent

Owner explicitly requested deployment and closure of the simplification branch.
Release is prepared as a clean single-parent snapshot on fetched `origin/main`
(`b8ec067`), not a merge publishing historical financial evidence. The original
local branch snapshot is `ea35842` and remains preserved until deployment succeeds.

Application code, tests, configuration and structural schema changes are included.
Historical screenshots, operator notes and personal-mailbox data-fix scripts are
excluded from public history. Personal addresses in new tests use example.com;
the optional source OAuth setup reads its configured environment value rather
than a hard-coded personal address. Existing hosted mailbox data is unchanged.
The public reconciliation schema file omits its legacy personal-mailbox seed.
No schema or data migration is executed by this release procedure.

## Preserved workflow

- Existing Gmail/Drive/Bank/Both controls remain immediately below the billing
  heading. The main import endpoint and Google Drive helper are unchanged from
  the prior production baseline.
- Individual receipts, import provenance, current/prior unmatched queues and
  original-period navigation are preserved. Unit-level allocation and sign-off
  remain separate from finding an unmatched reference.
- Existing Chat, property pages, authentication and release contracts from main
  remain in the release snapshot.

## Known acceptance gaps

Financial operations use compensating writes, not a single database transaction.
Rollback errors may be ignored; concurrent headroom and failed-write/no-residue
behavior lack isolated E2E proof. Five surplus and two match-feedback cases remain
`test.fixme`. Security dependency findings and legacy data ownership remain open.
These are not fixed or marked complete by the owner's deployment instruction.
See [requirements](../requirements/PAYMENT-WORKSPACE-RELEASE.md).

Verification must not import, allocate, reverse or sign off real payments. Hosted
schema checks select zero rows. Public health checks and unauthenticated payment
route guards are appropriate; authenticated financial acceptance is separate.

## Deployment verification

Clean release snapshot checks passed before push:

- 265 unit/contract tests; no failures or skips in this suite.
- Production build including TypeScript and six artifact checks.
- Four isolated UI scenarios at desktop/mobile (eight combinations); import
  requests fulfilled in memory, no provider or financial mutations.
- Lint: zero errors, 11 existing warnings.
- Seven zero-row schema probes: stays, credits, allocations, contributions,
  deposit ledger, reconciliation runs and file occurrences. All queried columns
  accessible. This does not test financial data or transaction integrity.

The Vercel connector requires reauthentication. Use the repository's existing
GitHub/Vercel deployment integration, then confirm the exact released commit's
Production deployment and public domain smoke tests. Do not claim production is
live, or delete the source branch, based on a successful Git push alone.

Previous recorded successful Production deployment: `5610352246`, commit
`b8ec0678ef9480a7b79e30e876bcec90f9786904`. Preserve that rollback baseline.
