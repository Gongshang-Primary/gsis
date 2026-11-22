# Task Claim: v1 LORD Manual Contacts Refresh with Provisional Records

- **Task ID:** `v1-lord-manual-contacts-refresh`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-lord-manual-contacts-refresh`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — LORD manual Contacts refresh)

## Scope

1. In `v1/services/lord/service.mjs` (`refreshReferences`), accept provisional Contacts records whose `active` field is explicitly `null` (unknown activity) instead of rejecting the entire manual refresh with `503 REFERENCE_UNAVAILABLE`, while:
   - Still rejecting malformed non-boolean/non-null `active` values (e.g. strings/numbers/objects/undefined) with `503 REFERENCE_UNAVAILABLE`.
   - Still excluding non-active and unknown-activity (`active !== true`) records from `lord_references`, preserving unknown activity (never treating `null` as active) and accepted authority.
2. Add regression test `tests/v1-product-lord-manual-contacts-refresh.mjs` exercising a mixed Contacts fixture (known active, known inactive, and provisional `active: null` staff) through both manual (`/reference/refresh`) and scheduled Contacts refresh paths, proving:
   - Known active staff are imported into `lord_references`.
   - Known inactive and provisional (`active: null`) staff are excluded (unknown activity preserved, never promoted to active) without failing the refresh.
   - Malformed activity evidence (non-boolean/non-null) is still rejected with `503`.

## Files Planned

- `docs/coordination/tasks/v1-lord-manual-contacts-refresh.md`
- `v1/services/lord/service.mjs`
- `tests/v1-product-lord-manual-contacts-refresh.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Deployment, live school data, or live switches.
