# Deploy teacher registration by derived TTb Name

- Model: Codex
- Status: implemented and locally verified. Exact-head CI and review pending.
- Updated: 20 November 2026 SGT
- Branch: `codex/v1-deploy-ttb-registration`
- Base: v1.07 `05eedeee3c364609f879734d47026d2c718e74d7`
- Reviewer: Muse at the exact PR head
- Owner scope: support shared Basic Names when the derived TTb Names differ. Verify the expected behavior in v0.9 and fix v1 Deploy's Teachers registration flow.

## Scope

The exact paths are this task record, `scripts/v1/build-web.mjs`, `v1/services/deploy/service.mjs`, `v1/services/contacts/service.mjs` and `tests/v1-product-deploy-ttb-registration.mjs`. Current v1 PRs are clear of these paths. The open v0.9 hotfix #182 has no overlap. Live maintenance is separate from this code task.

The 20 November 2026 SGT CI follow-up adds exactly `tests/v1-product-lord-cart-groups-browser.mjs` for a synthetic date correction. Exact-head CI exposed the same failure on the released v1.07 tree. When the fixed fixture date becomes the browser's default booking date, its mocked period 3–4 booking triggers the buffer warning and prevents the intended assertion. Keep the fixture on a different future date and preserve every product rule and test assertion. No active claim owns this file.

A second CI supplement adds exactly `tests/v1-product-compact-on-load-browser.mjs` for a test wait condition. Two runs measured the replaced Calendar Glossary before its compact table and controls were ready. The same failure reproduces on released v1.07 by delaying the enhancement frames in the synthetic browser. Wait for the rendered compact table and retain the existing width tolerances and all other assertions. PR #223 is merged and no open PR owns this file. No Calendar product file is in scope.

Pinned v0.9 `d9d180c` already compares derived TTb names. v1.07 `Add teacher` sends Basic Name alone and Contacts performs an early Basic Name check. A synthetic built-browser reproduction returned `IDENTITY_SELECTION_REQUIRED` against a complete active contact in a version with zero teacher rows. The current guard also runs before recovery on an exact registration retry.

Use the existing Contacts owner derivation, atomic TTb uniqueness checks and permanent Staff ID receipt. Send only the typed naming inputs needed for the display name. Keep authority, version-owned fields, existing-ID selection and legacy tag callers within their current bounds. A blocked creation must keep the form and explain a TTb Name collision. Existing duplicate Basic Names and historical presentations must remain readable. Cross-owner reservations for every future rename/import remain a separate design concern.

## Acceptance

Exercise the actual built browser and Contacts/Deploy D1. Confirm same Basic Name with distinct TTb Names saves, exact TTb collisions leave the original identity intact, repeated operation IDs recover the same Staff ID, and the explicit existing-person option stays available. Retain legacy typed and untyped validation, authority boundaries, scope and draft ownership. Run the canonical build, verify no generated drift, run related product regressions and exact-head CI. Hosted UAT, merge and deployment are outside this claim.

## Implementation evidence

The exact v1.07 built-browser negative returned the Basic Name conflict when an eligible subject modifier produced a distinct TTb name. The corrected form sends only the versioned naming modifiers through the existing v1 permanent-ID registration hook in the builder. Contacts applies its existing atomic TTb check and receipt contract. A role can contribute a display tag without writing the Contacts role, activity or authority. The native v0.9 handler already validates derived TTb names and remains unchanged. [v0.9 Deploy validation](https://github.com/helper-gsps/gsis/blob/d9d180c/backend/Code.gs#L1262)

- New built Teachers/browser/Workers/D1 program passed. It saved two distinct IDs under the same Basic Name, rejected exact duplicate TTb, recovered the same ID on exact retry, rejected changed intent and admitted one concurrent winner without a stranded preparation. A role-derived tag preserved the ordinary profile and authority boundaries.
- Contacts direct authority (10 groups), Deploy saved-membership (5 groups), and the operation probe (407 operations, 24 remaining allowances) passed. All 152 product programs are discovered.
- `TZ=Asia/Singapore npm run build`, no generated drift, v1 build, nine dry runs, local migration upgrade, syntax and whitespace passed. Exact-head CI and Muse review are recorded in the PR. Hosted UAT remains untested.
- The first Node/LORD run exposed a LORD cart-browser test fixture dated 20 November, which started matching the live clock on 20 November SGT. Both the released tree and the first task head reproduced a synthetic booking buffer before the target assertion. The fixture now stays a week ahead of the native default date. All LORD cart-browser cases and all three new built registration cases passed after the correction. No LORD product files or assertions changed.
