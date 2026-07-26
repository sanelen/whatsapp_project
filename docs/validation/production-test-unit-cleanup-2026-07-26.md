# Production Test-Unit Cleanup

Date: 2026-07-26  
Project: `hambatrading` (`ddlykzackuehdexldazv`)  
Status: completed

## Owner decision

The production portfolio contains exactly:

- Berea: Room 01 through Room 10
- Quarry Heights: Room 01 through Room 18
- West Rich / Westridge: Room 01 through Room 12

Adding another location is outside this change.

## Pre-delete evidence

The database contained exactly six extras: `TEST ROOM 1` and `TEST ROOM 2`
under each property.

- No test unit had payment references, match events, bank-import hints, deposit
  records, credits, credit allocations, or media.
- Their payment-period rows were generated unpaid/blocked fixtures with no notes
  and no payment references.
- The two Quarry test occupancies were migration-created placeholders with blank
  contacts and no start/end dates.

## Change and verification

The six test units were deleted in one guarded transaction. Their generated
payment periods and blank fixture occupancies were removed through the existing
foreign-key cascade rules.

Post-delete database and live-page verification:

| Property | Rooms | First | Last | Test rooms |
|---|---:|---:|---:|---:|
| Berea | 10 | 1 | 10 | 0 |
| Quarry Heights | 18 | 1 | 18 | 0 |
| West Rich / Westridge | 12 | 1 | 12 | 0 |

The authenticated monthly-payments Locations page loaded successfully and showed
10/10, 18/18, and 12/12 rule coverage respectively.

`20260726072000_remove_production_test_units.sql` records the owner decision and
prevents a full historical migration replay from leaving the old fixtures in a
new production database.
