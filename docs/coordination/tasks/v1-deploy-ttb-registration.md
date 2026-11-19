# Deploy teacher registration by derived TTb Name

- Model: Codex
- Status: claimed
- Updated: 20 November 2026 SGT
- Branch: `codex/v1-deploy-ttb-registration`
- Base: v1.07 `05eedeee3c364609f879734d47026d2c718e74d7`
- Reviewer: Muse at the exact PR head
- Owner scope: support shared Basic Names when the derived TTb Names differ. Verify the expected behavior in v0.9 and fix v1 Deploy's Teachers registration flow.

## Scope

The exact paths are this task record, `scripts/v1/build-web.mjs`, `v1/services/deploy/service.mjs`, `v1/services/contacts/service.mjs` and `tests/v1-product-deploy-ttb-registration.mjs`. Current v1 PRs are clear of these paths. The open v0.9 hotfix #182 has no overlap. Live maintenance is separate from this code task.

The 20 November 2026 SGT CI follow-up adds exactly `tests/v1-product-lord-cart-groups-browser.mjs` for a synthetic date correction. Exact-head CI exposed the same failure on the released v1.07 tree. When the fixed fixture date becomes the browser's default booking date, its mocked period 3–4 booking triggers the buffer warning and prevents the intended assertion. Keep the fixture on a different future date and preserve every product rule and test assertion. No active claim owns this file.

Pinned v0.9 `d9d180c` already compares derived TTb names. v1.07 `Add teacher` sends Basic Name alone and Contacts performs an early Basic Name check. A synthetic built-browser reproduction returned `IDENTITY_SELECTION_REQUIRED` against a complete active contact in a version with zero teacher rows. The current guard also runs before recovery on an exact registration retry.

Use the existing Contacts owner derivation, atomic TTb uniqueness checks and permanent Staff ID receipt. Send only the typed naming inputs needed for the display name. Keep authority, version-owned fields, existing-ID selection and legacy tag callers within their current bounds. A blocked creation must keep the form and explain a TTb Name collision. Existing duplicate Basic Names and historical presentations must remain readable. Cross-owner reservations for every future rename/import remain a separate design concern.

## Acceptance

Exercise the actual built browser and Contacts/Deploy D1. Confirm same Basic Name with distinct TTb Names saves, exact TTb collisions leave the original identity intact, repeated operation IDs recover the same Staff ID, and the explicit existing-person option stays available. Retain legacy typed and untyped validation, authority boundaries, scope and draft ownership. Run the canonical build, verify no generated drift, run related product regressions and exact-head CI. Hosted UAT, merge and deployment are outside this claim.
