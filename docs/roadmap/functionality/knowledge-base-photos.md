# Approved Property Media and Retrieval

Last updated: 2026-07-25

Status: first authenticated property/room media workflow built locally under
AUT-40; migration and release remain gated.

## Storage and delivery

Media is stored as `property_media`, not as binary vector content. Files use the
existing private `uploads` bucket and property/optional-room paths. The server
returns short-lived signed URLs. External Google Photos and other http(s) links
remain supported during migration.

## Approval

Every item has caption, alt text, display order, association, source, and approval
state. Draft media cannot enter customer-facing assistant context. Room association
is accepted only after the server verifies that the room belongs to the selected
property.

## Retrieval boundary

Only approved caption and alt-text copy may join the approved descriptive property
source. The persisted media URL/path itself stays structured in `property_media`.
Metadata must include:

- `contentClass = approved_descriptive`
- `approvalStatus = approved`
- `propertyId`
- source authority `descriptive-only`

The WhatsApp property assistant post-filters retrieval against this metadata and
keeps structured media associations authoritative.

## Admin flow

Property Content → Media supports:

- private image/video/PDF upload
- property or optional-room association
- external/Google Photos reference
- kind, caption, alt text, display order
- explicit approve/remove-approval action

## Deferred

- Vision-generated captions and moderation.
- Cover-image automation and drag reorder.
- Public bucket delivery.
