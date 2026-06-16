# Supabase Storage Roadmap

## Current state

- One bucket exists: **`uploads`** — `public: false`, **0 objects**. It is created
  on demand by `/api/kb/upload` (`ensureUploadsBucket`) and holds **documents**
  (PDF/DOCX/CSV/…) under `{organizationId}/{propertyId}/{sourceId}/{fileName}`.
- No image storage and no public delivery path yet. Property `image_url` is empty.

## What "enable storage" means here

Two distinct needs, two buckets:

| Bucket | Visibility | Holds | Path convention |
|--------|-----------|-------|-----------------|
| `uploads` (exists) | private | KB documents for indexing | `{orgId}/{propertyId}/{sourceId}/{file}` |
| `property-images` (**new**) | public read | property/unit photos shown in UI + chat | `{orgId}/{propertyId}/{unitId?}/{file}` |

Documents stay **private** (they can contain IDs, bank statements — see the rental
flow's application step) and are only ever read server-side with the service role.
Property images are meant to be displayed, so `property-images` is **public-read**
with writes restricted to the service role.

## Provisioning plan

1. **Create the `property-images` bucket** (public read), e.g. via the Supabase MCP
   or a migration:
   ```sql
   insert into storage.buckets (id, name, public)
   values ('property-images', 'property-images', true)
   on conflict (id) do nothing;
   ```
   This is a **production write** — apply with explicit owner authorization, the
   same way the retrieval-column migrations were applied.
2. **RLS / access policies** on `storage.objects`:
   - `property-images`: `select` allowed to `anon`/`authenticated`; `insert/update/
     delete` only via service role (server routes).
   - `uploads`: no public access; server-role only (unchanged).
3. **Image upload route** (`/api/property/media` or extend `/api/kb/upload`):
   validate content-type (`image/png|jpeg|webp`), enforce a size cap (e.g. 10 MB),
   `upsert` to `property-images`, then store a `property_media` row with the public
   URL (`admin.storage.from('property-images').getPublicUrl(path)`).
4. **Deletion cascade:** deleting a property/unit/media row removes the matching
   storage object(s), mirroring the existing document delete flow.

## Delivery

- Public images: use `getPublicUrl` and render directly (cacheable, no signing).
- If any image must stay private later, switch that path to
  `createSignedUrl(path, ttl)` and cache the signed URL briefly.

## Validation checklist (add to the vector/audit script or a new media audit)

- Bucket exists and is public.
- Upload of a small PNG returns a reachable `public_url`.
- Non-image content-type is rejected (400).
- Deleting the media row removes the storage object.

## Open questions

1. Fully public `property-images` vs. signed URLs (privacy vs. simplicity/caching).
2. Image transforms/thumbnails — use Supabase image transformation or store one
   size and resize client-side.
3. Per-organization storage quotas / abuse limits.
