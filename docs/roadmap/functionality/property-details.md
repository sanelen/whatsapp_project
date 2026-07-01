# Property & Unit Details Roadmap

Last updated: 2026-06-14

## Why this exists

Today a property carries almost nothing: the live `berea` property has
`location = "33"` and `image_url = ""`. But the real Hamba Trading rental flow
(stored as the `berea` text knowledge source) already describes a rich,
**per-unit** template that the assistant is expected to answer from:

```
Type of unit: Studio apartment
Rental price: R2200 per month
Deposit: R2200 (payable over 2 months with rent)
Location:
  Address: 28 Nkunzana Grove, Newlands East, 4037
  Maps link: https://maps.app.goo.gl/...
Unit details:
  • Max occupants: 2
  • Parking available: No / quantity
  • Images: [Add image link]      ← currently a placeholder
Features:
  • Hot water
  • Kitchen sink with hot water
  • Shower, toilet, and sink       ← ensuite bathroom
  • Tiled unit
  • Camera monitored
  • Locked gate
  • Washing basins
  • Washing line
```

The chatbot can only answer "what does it look like / where is it / is the
bathroom ensuite / how much parking" if these fields are **structured data on the
property/unit**, not just free text buried in a flow document. This roadmap turns
that template into a first-class data model with images.

## Vocabulary

- **Organization** — the landlord/agency (e.g. Hamba Trading). Already exists.
- **Property** — a building/complex at one location (e.g. Query Heights,
  Westridge, Berea). Already exists, but under-modelled.
- **Unit** — a single rentable space inside a property (e.g. "Studio apartment,
  R2200"). **New.** **Decision (confirmed):** a property has **many** units
  (1-to-many `property_units`); the UI is built for multiple units from the start,
  even though `berea` currently has one.
- **Room** — optional sub-detail of a unit. For Hamba's current stock each unit is
  effectively a single ensuite room, so `rooms` starts as a simple list/flag and
  can grow later. "Each room is ensuite" is captured as a room/unit attribute, not
  a free-text note.

## Data model (proposed)

### `properties` (extend existing table)

| Column | Type | Notes |
|--------|------|-------|
| `location` | text | Keep, but treat as a human label (suburb/area). |
| `address` | text | Full street address (e.g. "28 Nkunzana Grove, Newlands East, 4037"). |
| `maps_url` | text | Google Maps share link. |
| `latitude` / `longitude` | numeric | Optional, for map pins. |
| `image_url` | text | Keep as the **primary/cover** image (a public Storage URL). |
| `description` | text | Short blurb. Already present on organizations; add to properties. |

### `property_units` (new table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `property_id` | uuid fk → properties | |
| `name` | text | e.g. "Studio A", "Unit 1". |
| `unit_type` | text | "studio", "bachelor", "1-bed", "room". |
| `rent_amount` | numeric | Monthly rent (R). |
| `deposit_amount` | numeric | |
| `deposit_terms` | text | e.g. "payable over 2 months with rent". |
| `max_occupants` | integer | |
| `parking` | text/integer | "none" or a count. |
| `is_ensuite` | boolean | Captures "each room is ensuite". |
| `is_available` | boolean | Drives "availability" answers. |
| `features` | text[] | hot_water, kitchen_sink, tiled, camera_monitored, locked_gate, washing_basins, washing_line, … |
| `created_at` / `updated_at` | timestamptz | |

### `property_media` (new table — images first, video later)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `property_id` | uuid fk | |
| `unit_id` | uuid fk null | null = property-level image, set = unit-level. |
| `kind` | text | "image" (future: "floorplan", "video"). |
| `storage_bucket` | text | `property-images` (see [storage roadmap](./storage.md)). |
| `storage_path` | text | `{organizationId}/{propertyId}/{unitId?}/{fileName}`. |
| `public_url` | text | Cached public URL or signed-URL key. |
| `caption` | text | Used for accessibility + optional retrieval (see [KB photos](./knowledge-base-photos.md)). |
| `sort_order` | integer | Gallery ordering; `0` is cover. |
| `width` / `height` / `bytes` | integer | For layout + validation. |
| `created_at` | timestamptz | |

> Migrations are **additive** (`add column if not exists`, `create table if not
> exists`) and applied through `supabase/migrations/` + the Supabase MCP, matching
> the existing pattern. Each new table gets RLS mirroring `properties`.

## Reference: how listing sites model this

We are not copying any site; these informed the field list above:

- **Property24 / Private Property (ZA):** price, deposit, property type, bedrooms,
  bathrooms (ensuite flag), parking/garaging, floor size, features checklist,
  photo gallery with a cover image, address + map pin, availability date.
- **Gumtree / Facebook Marketplace rentals:** lighter — price, location, a few
  photos, free-text features. This matches Hamba's current WhatsApp flow closely.
- **Airbnb:** amenities as typed tags + a photo-first gallery — the model we follow
  for `features text[]` and `property_media`.

## How this feeds the assistant

1. When a unit/property is selected, the workspace composes a **structured
   knowledge source** from these fields (not just the raw flow doc), so retrieval
   can ground answers on rent, deposit, occupants, parking, ensuite, address.
2. Image captions are indexed as text so "do you have photos of the kitchen" can
   surface the right media (see [KB photos](./knowledge-base-photos.md)).
3. The maps link/address answers "where is it" deterministically.

## Phasing

- **P1 — Schema + read path:** add columns/tables, backfill `berea`, surface
  fields read-only in the property page.
- **P2 — Editing UI (HeroUI):** forms to edit property/unit details and upload
  images; see [HeroUI adoption](../ui/heroui.md).
- **P3 — Assistant grounding:** auto-compose a structured KB source from
  property/unit data and keep it in sync on save.
- **P4 — Media retrieval:** caption-based image retrieval and gallery answers.

## Open questions (decide before hard-coding)

1. ~~One unit per property vs. many~~ — **Resolved:** many units per property
   (1-to-many `property_units`), UI built for multiple units from the start.
2. Whether `features` is a free tag list or a fixed enum (affects validation +
   filtering).
3. Image moderation / size limits and whether the images bucket is fully public or
   signed-URL only (see [storage roadmap](./storage.md)).
