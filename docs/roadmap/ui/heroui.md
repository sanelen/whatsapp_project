# HeroUI Adoption Roadmap

Last updated: 2026-06-15

## Decision

Adopt **HeroUI** (the React component library, successor to NextUI) as the standard
component layer for the workspace, replacing ad-hoc Tailwind markup for inputs,
buttons, modals, cards, dropdowns, and the new photo gallery.

## Status — P0 spike DONE (2026-06-14)

**HeroUI v3.1.0** is installed and verified against this exact stack (Next 16,
React 19, Tailwind v4). v3 is **simpler than the v2 setup** below assumed:

- Installed `@heroui/react` + `framer-motion`.
- **No `hero.ts`, no `@plugin`, no `@source`, no Provider** — v3 ships prebuilt CSS
  and needs no wrapper. The only wiring is one import in `src/app/globals.css`
  (order matters, tailwind first):
  ```css
  @import "tailwindcss";
  @import "@heroui/styles";
  ```
- Components import from `@heroui/react` and use a **React Aria** compound API:
  `TextField` + `Label` + `Input` + `FieldError`, `Button` (`onPress`,
  `isPending`, `variant`), `Alert` (`Alert.Description`, `status`).
- **Migrated so far:**
  - Login form (`src/app/login/login-form.tsx`) — `Button`/`TextField`/`Input`/`Label`/`Alert`.
  - Workspace (`src/components/workspace/workspace-route.tsx`): the shared `Field`
    primitive → `TextField`+`Label`+`Input`/`TextArea` (upgrades every modal/settings
    text input at once), plus the create-organization, create-property, and
    chunk-settings modal action buttons and the sign-out button → `Button`.
  - `src/app/auth-test/page.tsx` sign-out → `Button`.
  - Verified in-browser: workspace + create-organization modal render with HeroUI,
    controlled inputs functional, no console errors. `typecheck` + `test` (40/40) +
    `build` green.
- **Test-runner caveat:** `@heroui/react` is ESM-only and does not resolve under the
  bare `node --test` runner, so `src/app/workspace-pages.test.tsx` was switched from
  importing the page components (which pull in HeroUI) to **source assertions** of
  the route→view contract. Keep new tests for HeroUI-bearing components out of the
  node runner (or add a jsdom/mocked setup) — `typecheck`/`build` cover them.
- **Still to migrate (incremental):** native `<select>`s (`TopNavSelect` and
  retrieval/settings dropdowns → HeroUI `Select`, needs `<option>` → items rework),
  remaining bespoke nav/icon/toggle buttons, and KB/retrieval number inputs.

### Verified component prop reference (v3.1.0)

- `Button` — `variant`: `primary | secondary | tertiary | outline | ghost | danger
  | danger-soft`; `size`: `sm | md | lg`; `fullWidth`, `isDisabled`, `isPending`,
  `onPress`, `type`.
- `Alert` — `status`: `default | accent | success | warning | danger`; compound
  `Alert.Title` / `Alert.Description` / `Alert.Content`.
- `TextField` — React Aria: controlled `value` + `onChange(value: string)`,
  `type`, `name`, `isRequired`, `isInvalid`; compose with `Label`, `Input`,
  `FieldError`.

> The remainder of this doc (the v2 `hero.ts`/`@source` approach) is kept for
> historical context but is **not** how v3 is wired.

## Current stack (what HeroUI must fit into)

- **Next.js 16** (App Router, `proxy` not `middleware`) — see `AGENTS.md`; this is a
  modified Next, so read `node_modules/next/dist/docs/` before wiring providers.
- **React 19.2**.
- **Tailwind CSS v4** (CSS-first config: `@import "tailwindcss"` in
  `src/app/globals.css`, `@tailwindcss/postcss`). There is **no `tailwind.config.js`**
  today.
- **lucide-react** for icons (keep — HeroUI is icon-agnostic).

> ⚠️ Compatibility check first: confirm the installed HeroUI version supports React
> 19 + Tailwind v4. HeroUI historically assumed a Tailwind **config file**; with
> Tailwind v4 we add its plugin via the CSS `@plugin`/`@source` directives or a
> minimal `hero.ts` config as the HeroUI docs specify for v4. Validate in a spike
> branch before a broad migration.

## Setup steps

1. Install: `npm i @heroui/react framer-motion` (HeroUI animates via framer-motion).
2. Wrap the app in `HeroUIProvider` in `src/app/layout.tsx` (client boundary).
3. Tailwind v4 wiring: register HeroUI's content source + theme so its classes are
   generated. Document the exact directive once the spike confirms it (either
   `@plugin "@heroui/react"` style or `@source` pointing at
   `node_modules/@heroui/theme/dist/**`).
4. Map design tokens: feed the existing CSS variables (`--background`,
   `--foreground`, plus a brand color for Hamba) into HeroUI's theme so light/dark
   stay consistent with `globals.css`.

## Migration targets (incremental, highest-traffic first)

| Surface | Component | HeroUI replacement |
|---------|-----------|--------------------|
| Workspace inputs (org/property/chatbot, KB text, settings) | text/number/textarea | `Input`, `Textarea`, `NumberInput` |
| Top-nav org/chatbot pickers | custom dropdown | `Dropdown` / `Select` / `Autocomplete` |
| Buttons across workspace | `<button>` | `Button` (variants for primary/danger) |
| Org delete confirm (see UI README) | custom | `Modal` + danger `Button` |
| Retrieval settings panel | sliders/inputs | `Slider`, `Select`, `Switch` |
| **KB Photos gallery** (new) | — | `Card`, `Image`, `Modal` (lightbox) |
| Loading states | `LoaderCircle` | keep lucide spinner or HeroUI `Spinner` |

Keep the lucide icon set already wired into the sidebar
(`workspace-route.tsx`); HeroUI components accept arbitrary icon nodes.

## Constraints

- **Accessibility:** HeroUI (built on React Aria) improves a11y — pair with the
  `design:accessibility-review` pass before handoff.
- **No big-bang rewrite:** migrate surface-by-surface behind unchanged behavior;
  each PR should keep `npm run typecheck`, `npm test`, and `npm run build` green.
- **Theming parity:** dark-mode pass (noted in the sidebar work) should be done
  through HeroUI's theme, not per-component overrides.

## Phasing

- **P0 — Spike:** install + provider + Tailwind v4 wiring + one migrated input;
  confirm build/SSR works in Next 16. De-risks everything else.
- **P1 — Inputs & buttons** across the workspace.
- **P2 — Dropdowns, modals (org delete), retrieval controls.**
- **P3 — Photo gallery** for [KB photos](../functionality/knowledge-base-photos.md).
- **P4 — Dark mode** via HeroUI theme.

## Open questions

1. Exact HeroUI ↔ Tailwind v4 wiring (resolve in the P0 spike).
2. Brand palette / theme tokens for Hamba (need a primary color + logo).
3. Whether to keep lucide or move to HeroUI's icon recommendations (lean: keep
   lucide).
