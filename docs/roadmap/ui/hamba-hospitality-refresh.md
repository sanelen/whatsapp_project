# Hamba Cloud Visual System

Last updated: 2026-07-13

## Direction

The approved visual direction returns to Hamba's original cloud-white and powder-blue
workspace. The dark hospitality/serif exploration from 2026-07-12 is superseded.
The system keeps the original soft atmosphere while applying it consistently across
payments, assistant directories, and chatbot operations.

## System

| Token | Value | Role |
|---|---|---|
| Navy | `#0f172a` | Navigation and high-trust actions |
| Sky | `#0284c7` | Progress, active controls, conversation actions |
| Powder | `#dbeafe` | Atmospheric workspace field |
| Cloud | `#f8fafc` | Page field and secondary surfaces |
| White | `#ffffff` | Operational panels and cards |
| Line | `#dbe5f0` | Dividers and panel boundaries |

- Geist is the UI and heading typeface throughout.
- Letter spacing remains zero except small uppercase category labels.
- Operational panels use rounded 12–30px forms and restrained blue-grey shadows.
- Status colors retain their semantic green/blue/amber/red roles.

## Surface Rules

1. Entry screen: editorial, blue-wash field with two direct product destinations.
2. Payments home: dense financial overview on paper panels with a fixed ink rail.
3. Child payment pages: shared portfolio rail and the same paper/water contrast.
4. Assistant directory: paper registry within the water field.
5. Chatbot: conversation-first canvas, ink app rail, mist thread rail, paper chat,
   and a settings panel that collapses below 1400px.
6. Mobile chatbot: duplicated selectors are hidden, rails compact, and the composer
   keeps the full viewport width without horizontal scrolling.

## Canonical Payments Frame

`src/components/monthly-payments/monthly-payments-navigation.tsx` is the only
payments navigation implementation. Dashboard, locations, match/sign-off, room
manager, reference pool, import audit, and import configuration must render this
component instead of defining route lists locally. Pages supply only their active
section and period/property-aware destinations.

Desktop uses a flush 248px ink rail. Mobile uses the same heading and route set as a
full-width two-column menu. Active styling, icons, quick links, labels, and route
order must therefore remain identical across every payments page.

## Copy Style

Use calm operational language. Prefer “This month, at a glance” and “Portfolio
ledger” over implementation language such as “new view,” “setup branch,” or
“existing workspace.” Labels should name the task or state, not explain the UI.

## Evidence

Desktop and 390px mobile captures are stored in `docs/audits/screenshots/`:

- `2026-07-12-hospitality-entry-{desktop,mobile}.png`
- `2026-07-12-hospitality-payments-dashboard-{desktop,mobile}.png`
- `2026-07-12-hospitality-payments-locations-{desktop,mobile}.png`
- `2026-07-12-hospitality-chatbot-workspace-{desktop,mobile}.png`
- `2026-07-12-payments-navigation-{dashboard,locations,match-sign-off}-desktop.png`

All captures use live application routes. Screenshot checks confirmed no horizontal
overflow at 1440px or 390px.
