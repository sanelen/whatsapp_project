# Authoritative Property & Room Content

Last updated: 2026-07-25

Status: built locally under AUT-39/AUT-40; migration and release remain gated.

## Authority boundary

The assistant needs two different kinds of property knowledge:

1. **Structured, decision-critical facts** — address, public links, contacts,
   occupancy, availability marker, available-from date, rent guidance, deposit,
   viewing instructions, parking, room features, and media associations.
2. **Approved descriptive copy** — marketing descriptions and approved media
   captions/alt text that can help natural-language retrieval.

Structured records always win. Availability, final price, deposits, and viewing
arrangements remain staff-confirmed even when a stored value exists. Vector
retrieval cannot override them.

## Data model

### `properties`

The existing record now carries:

- `description` plus explicit descriptive approval fields
- `address`, `maps_url`
- `public_page_url`, `photos_url`, `pamphlet_url`
- `contact_primary`, `contact_secondary`
- `viewing_instructions`
- `parking`, `features[]`

### `property_units`

The existing room/unit record now carries:

- `description` plus explicit descriptive approval fields
- `unit_type`
- existing `rent_amount`, `deposit_amount`, `occupancy_status`, `is_available`
- `deposit_terms`, `available_from`, `viewing_instructions`
- existing contacts, parking, ensuite, maximum occupants, and features

### `property_media`

Each row is property-scoped and optionally room-scoped:

- `kind`: photo, floorplan, video, document
- `source_kind`: private Storage object or external URL
- `storage_bucket = uploads` plus `storage_path`, or `external_url`
- caption, alt text, MIME type, byte size, display order
- explicit approval, approver, and approval time

Google Photos and other external http(s) URLs are valid migration sources. Private
uploads follow the path contract in [storage.md](./storage.md).

### `property_content_imports`

Each applied structured import retains the source file path, format, reviewed
mapping, preview rows, validation errors, actor, and apply status. Previewing a file
does not create a row or upload an object; saving happens only after the mapping and
every row validate.

## Assistant composition

- `buildAuthoritativePropertyContext` supplies structured records separately and
  labels them as authoritative.
- `buildApprovedDescriptiveKnowledge` emits only separately approved descriptions
  and approved media captions/alt text.
- The descriptive source uses `source_type = database` with
  `contentClass = approved_descriptive`, `approvalStatus = approved`, and a
  property ID.
- Property WhatsApp retrieval rejects all results that do not carry that approval
  metadata.
- Model-output validation rejects unguarded availability or price claims and
  model-created viewing confirmations.

## Admin flow

The authenticated Property Content workspace has three in-place views:

1. Facts & rooms
2. Media
3. Structured import (preview → review mapping/errors → apply)

This is one operator surface, not a chain of setup pages. Existing payment-reference
rules remain in the payments room manager; assistant content does not duplicate
those controls.

## Deferred

- Live stock synchronization and automatic viewing booking.
- Vision-generated captions.
- Public bucket/CDN delivery.
- Tenant servicing, document/ID handling, and A2UI.
