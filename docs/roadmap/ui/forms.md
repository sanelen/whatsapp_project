# Forms Enhancement Protocol

Last updated: 2026-06-15

A standard protocol for every form in the workspace. We do not have a consistent
form pattern today (inputs are ad-hoc Tailwind markup with little validation), so
this is the baseline all current and future forms should follow. It builds on
[HeroUI adoption](./heroui.md) — HeroUI is built on React Aria, which gives us most
of the accessibility and state handling for free.

## Forms we have / need

| Form | Where | State today |
|------|-------|-------------|
| Login / sign-up | `src/app/login/login-form.tsx` | exists; has friendly error mapping |
| Create/edit organization | workspace | basic |
| Create/edit property | workspace | basic; needs new property-detail fields |
| Create/edit **unit** | workspace | **new** — see [property details](../functionality/property-details.md) |
| KB text source | KB → Text | basic |
| KB file upload | KB → File | works (multipart); needs progress UI |
| **KB photo upload** | KB → Photos | **new** — see [KB photos](../functionality/knowledge-base-photos.md) |
| Retrieval settings | settings/drawer | basic inputs |
| LLM/prompt settings | settings | basic |
| **Tenant application** (name, contact, occupants, ID, bank statements) | future tenant-facing | **new** — multi-step wizard mirroring the WhatsApp flow |

## The protocol (apply to every form)

### 1. Structure & labels
- One column, logical grouping, clear section headings.
- Every field has a visible label (no placeholder-as-label). Placeholders show
  format examples only (e.g. "28 Nkunzana Grove, Newlands East").
- Mark optional fields, not required ones, when most are required.

### 2. Validation & errors
- **Validate on blur**, re-validate on change once a field has errored (don't
  shout while the user is still typing).
- **Inline** errors beneath the field, tied with `aria-describedby`; never only a
  top-of-form summary.
- Specific, friendly messages ("Rent must be a number in Rand", not "Invalid").
  Reuse the login pattern in `src/lib/auth/login-messages.ts`.
- Disable submit only for hard-invalid state; otherwise allow submit and surface
  server errors inline.

### 3. Typed inputs
- Use the right control: `NumberInput` for rent/deposit/occupants, `Select` for
  unit type/parking, `Switch` for `is_ensuite`/availability, tag input for
  `features[]`, `Autocomplete` for org/property pickers. (All HeroUI.)
- Currency fields show the `R` prefix and format thousands.

### 4. Submission state
- Submit button shows pending state (`isLoading`) and is idempotent — **guard
  against double-submit** (the audit called this out for uploads). Re-entrancy lock
  + disable on pending.
- Optimistic UI where safe; otherwise a spinner with a clear result toast.
- On success: confirmation toast + keep the user oriented (don't blow away
  context).

### 5. Async / uploads
- File and photo uploads show **per-file progress**, accepted types, size cap, and
  a clear failed/unsupported state (matches the server's `parserStatus`).
- Long operations (indexing) show a status badge that resolves to indexed/skipped.

### 6. Accessibility (WCAG 2.1 AA)
- Full keyboard nav, visible focus rings, labels/roles via React Aria.
- Error text is programmatically associated, not color-only.
- Run the `design:accessibility-review` pass before handoff.

### 7. Drafts & data loss
- Autosave drafts for long forms (unit details, tenant application) to local
  storage, keyed like the existing selection persistence
  (`hamba.workspace.*`).
- Warn before navigating away from a dirty form.

### 8. Multi-step (wizard) forms
For the **tenant application** (and any future long form), mirror the WhatsApp flow
steps: name → contact numbers → occupant count (validated against unit
`max_occupants`) → ID upload → bank-statements upload → confirmation. Each step:
- shows progress ("Step 3 of 6"), allows back, validates before advancing,
  persists a draft, and never re-asks answered questions.
- This keeps the web form and the WhatsApp assistant behaviorally consistent.

### 9. Mobile / responsive
- Single-column, large touch targets, numeric keyboards for number fields.
- Test at tablet width (the UI roadmap already flags tablet squeeze).

## Implementation approach

- Add a thin shared layer (`useFormState` + a `<Field>` wrapper around HeroUI
  inputs) so the protocol is applied once, not per-form.
- Consider a schema validator (e.g. Zod) shared between client and the API routes
  so client and server enforce the same rules.
- Migrate highest-traffic forms first: property/unit editor and KB uploads, then
  settings, then the tenant application wizard.

## Phasing

- **P0:** shared `<Field>` + validation helper on top of HeroUI (depends on the
  HeroUI spike).
- **P1:** property/unit editor + KB upload/photo forms follow the protocol.
- **P2:** settings forms.
- **P3:** tenant application wizard (web parity with the WhatsApp flow).

## Open questions

1. Validation library choice (Zod vs. hand-rolled) and whether to share schemas
   with the API routes.
2. Whether the tenant application is in scope for the web app now or stays
   WhatsApp-only short-term (ties to the AUT-15 platform decision).
3. Toast/notification component (HeroUI vs. a dedicated library).
