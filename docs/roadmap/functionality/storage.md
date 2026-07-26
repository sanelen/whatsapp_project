# Supabase Storage

Last verified against connected project `hambatrading`
(`ddlykzackuehdexldazv`): 2026-07-25.

## Current bucket contract

The project has one existing bucket:

| Bucket | Access | Size limit | Uses |
|---|---|---:|---|
| `uploads` | private | 50 MB | KB sources, reviewed property-content imports, approved property/room media |

AUT-40 deliberately reuses this bucket. A second public `property-images` bucket is
not required and must not be created from the application. Customer-facing media is
delivered through authenticated server APIs and short-lived signed URLs. Approved
external `http(s)` references, including Google Photos, remain supported while media
is migrated.

Storage metadata tables are read-only implementation detail. Files are uploaded and
removed only through the Supabase Storage API.

## Path conventions

| Content | Path |
|---|---|
| KB source | `{organizationId}/{propertyId}/{sourceId}/{fileName}` |
| Property media | `{organizationId}/{propertyId}/media/property/{mediaId}/{fileName}` |
| Room media | `{organizationId}/{propertyId}/media/rooms/{roomId}/{mediaId}/{fileName}` |
| Reviewed structured import | `{organizationId}/{propertyId}/imports/{importId}/{fileName}` |

Paths are server-generated and association-scoped. A caller cannot attach a room
media object until the server verifies that the room belongs to the property.

## Authorization and approval

- Browser clients never receive the service-role key or direct bucket write access.
- Protected APIs require the existing Google/allowlist authorization.
- `property_media` records own association, media type, caption, alt text, order,
  approval, storage path or external URL.
- Private signed URLs are delivery values only; they are not persisted.
- Media is excluded from customer-facing answers until `is_approved = true`.
- Structured import files are retained only after a mapping has been previewed and
  all normalized rows validate.

## Deferred

- Resumable/TUS upload is still deferred until file sizes justify it.
- Public bucket/CDN delivery is not part of AUT-39–41. Reconsider only with a
  privacy, caching, and invalidation design.
