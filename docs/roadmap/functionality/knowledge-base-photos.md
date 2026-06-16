# Knowledge Base Photos Roadmap

## Goal

Let users add **photos** to the Knowledge Base (alongside text and documents), so a
property/unit has a gallery and the assistant can answer "do you have pictures?",
"what does the kitchen look like?", and show/point to the right image.

The current rental flow literally has `Images: [Add image link]` as a TODO — this
closes that gap with real uploads instead of pasted links.

## Where photos live

Photos are **media**, not embeddable text, so they are stored as
[`property_media`](./property-details.md) rows in the public `property-images`
bucket (see [storage roadmap](./storage.md)) — **not** as `knowledge_vectors`.
The KB "Photos" tab is a view over `property_media` scoped to the selected
property/unit.

## Upload flow

1. KB → **Photos** tab (new) → drag-and-drop or file picker (images only).
2. Client posts `multipart/form-data` to `/api/property/media` with
   `organizationId`, `propertyId`, optional `unitId`, the file, and an optional
   `caption`.
3. Server validates the image, uploads to `property-images`, reads dimensions,
   writes a `property_media` row, returns the `public_url`.
4. UI shows the gallery with cover-image selection, reorder, caption edit, delete.

## Making photos useful to retrieval

Images can't be vector-embedded as text, but their **captions/metadata can**:

- Each photo's `caption` (+ property/unit name + feature tags) is indexed as a
  small text chunk in `knowledge_vectors` with
  `source_type = 'image'` and metadata pointing back to the `property_media` row
  (`mediaId`, `public_url`, `propertyId`, `unitId`).
- So "show me the ensuite bathroom" retrieves the caption chunk, and the chat
  response can include the `public_url` for that image.
- **Optional later:** auto-caption with a vision model (Claude/OpenAI vision) when
  the user doesn't supply a caption, then index that text. Gated behind a setting.

This keeps retrieval text-only (no separate image-embedding infra) while still
making the gallery searchable.

## UI (HeroUI)

- Use HeroUI `Card`/`Image`/`Modal`/`Button` for the gallery, lightbox, and the
  upload dialog; see [HeroUI adoption](../ui/heroui.md).
- Empty state: "No photos yet — add photos of the unit, bathroom, kitchen, and
  outside" (mirrors the flow's feature list).
- Each tile: image, caption, "Set as cover", "Delete", indexing status badge.

## Deletion

Deleting a photo removes: the `property_media` row, the `property-images` storage
object, and any `image`-type `knowledge_vectors` caption chunk — one cascade,
matching how document sources are deleted today.

## Phasing

- **P1:** Photos tab + upload + gallery + delete (no retrieval).
- **P2:** Caption indexing so photos are searchable and chat can cite an image URL.
- **P3:** Optional vision auto-captioning.

## Open questions

1. Caption-only retrieval (cheap, deterministic) vs. vision auto-caption (richer,
   adds model cost) — start caption-only.
2. Whether chat should return image URLs inline or a "view gallery" link.
3. Max photos per unit and total storage per organization.
