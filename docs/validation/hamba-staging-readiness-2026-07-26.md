# Hamba Staging Readiness

Date: 2026-07-26  
Scope: AUT-39, AUT-40, and AUT-41 database release gate  
Status: superseded by the approved one-project migration; no second project created

## Owner decision

After reviewing the staging constraint, the owner explicitly chose to keep the
authoritative property-content tables in the existing `hambatrading` Supabase
project and authorized the additive migration. No second Supabase project or
branch was created.

The migration was applied inside one transaction from
`20260725214000_add_authoritative_property_content.sql`. It does not delete,
rename, or rewrite existing rows.

## Environment discovery

- The Supabase organization currently contains one project:
  `hambatrading` (`ddlykzackuehdexldazv`).
- That project is the live production database named throughout the repository
  handovers and architecture documentation.
- The organization is on the Free plan and the Branching screen exposes no usable
  preview or persistent branch; **Create branch** is disabled.
- The dashboard offers creation of another Free-plan project. No project was
  created during this check.

## Bootstrap constraint

The repository is not yet a complete empty-database migration chain:

- `supabase/workspace-schema.sql` defines the base organization, property, room,
  media, and payment workspace tables;
- the timestamped migration chain starts with migrations that assume existing
  tables such as `knowledge_base`;
- later channel migrations assume existing `customers`, `conversations`, and
  `messages`.

Therefore a new empty project must not receive a blind `db push` of the current
migration directory. It first needs a reviewed schema-only baseline. Production
data must not be copied.

## Safe staging sequence

1. Obtain explicit approval to create `hambatrading-staging` in the existing
   Supabase organization and generate/store its separate database password.
2. Build a schema-only baseline from reviewed repository and production-schema
   metadata. Exclude all customer, tenant, payment, message, auth-user, and Storage
   object data.
3. Apply the baseline to staging and verify tables, constraints, RLS, grants, and
   the private `uploads` bucket.
4. Apply
   `20260725214000_add_authoritative_property_content.sql`.
5. Run database advisors and verify that `anon` and `authenticated` cannot manage
   property-content imports or server-only channel state.
6. Seed only disposable organization/property/room fixtures.
7. Point a local or preview app at staging through uncommitted environment
   variables; never place staging secrets in source control or documentation.
8. Exercise authenticated property/room save, private media upload/signed delivery,
   external media, import preview/apply/audit, and cleanup.
9. Run the Meta sandbox journey only after a staging/preview webhook exists. Do not
   switch the production webhook or send to real customers.

## Current blocker

The second-project blocker no longer applies because the owner selected the
one-project route.

## Production migration evidence

- Before migration: 3 properties, 46 property units, 0 property-media rows, and
  1 channel conversation-state row.
- After migration: the same four counts were unchanged.
- All 14 property, 8 unit, 10 media, and 3 handoff columns were present.
- `property_content_imports` exists with RLS enabled.
- `anon` and `authenticated` have no table grants; the service-role policy exists.
- The media-source and handoff-status constraints exist.
- The chatbot model default is `gpt-5.6-luna`; existing explicitly saved settings
  were not overwritten.
- The existing `uploads` bucket remains private, with its existing 50 MB limit.
- The public property portfolio, authenticated chatbot workspace, and monthly
  payments location workspace all loaded successfully after the schema change.

Application code remains uncommitted and undeployed. Write-path validation for
media upload and import Apply still requires a reviewed release of the application
code; neither action was run against live data during the migration check.
