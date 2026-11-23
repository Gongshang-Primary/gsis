# Deploy planning relief calculation

- **Status** Locally verified on 23 November 2026, Asia/Singapore. Product CI and Muse review pending.
- **Model** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-planning-relief`
- **Base before claim** `73356724f7824ddd75f2290c279b75cb6bb61698`
- **Owner request** Make R calculate in Deploy for the selected saved planning version, following DEP-23-002 and DEP-23-003.
- **Exact scope** This record, the Deploy bootstrap and derived-row protections in `v1/services/deploy/service.mjs`, `v1/services/deploy/planning-relief.mjs`, v1 table hooks in `scripts/v1/build-web.mjs`, `v1/web/shared/deploy-relief-ui.js`, and `tests/v1-product-deploy-planning-relief-browser.mjs`.

Replay the existing formula on version-owned teachers, assignments, load, offload and relief settings. Expose the estimate by exact saved version/revision alongside the accepted-evidence R in Ledger and Stats. Keep numeric zero, incomplete-input reasons and complete-category averages. Pending edits must identify the save needed and must never show an estimate for the wrong revision.

The preview is a read-only Deploy projection. Existing Contacts acceptance, publication, Roster entitlement and write contracts remain authoritative. Scope excludes live edits, deployment, v0.9 source and the published calculation engine.

## Diagnosis

Read-only aggregate replay used the verified pre-v1.11 Deploy and Contacts backups for `2026 T4 post-PSLE`, saved revision 43. The accepted-evidence calculation returned no numeric R. Among 119 saved members, 117 had unavailable accepted activity, EO and section evidence, and two were excluded. The saved plan had 84 full-time teachers in its planning denominator, complete calculation inputs and 99 numeric planning R estimates. Replay emitted aggregate counts only and the final projection left the loaded saved inputs identical.

## Implementation

The accepted claim is `5fd9f79dbbde5c6191ca77500323a5ffac32099d`. Deploy bootstrap calculates the estimate before Contacts hydration, using the saved inputs, the existing planning eligibility and subject alias handling, and the shared workload and relief engines. The response binds the estimate to the saved version and revision. The field is excluded from write intent and the stored rows. Publication and Roster callers continue to use the existing accepted-evidence calculation and contracts.

Ledger shows **Planning R (estimate)** next to R. Stats shows **Planning R (average)** with the existing complete-category rule. Pending edits withhold the estimate and identify the save needed. A stale or mismatched version or revision requires refresh. The displayed estimate and ordinary R remain independently readable.

## Verification

All commands ran in Singapore time. Browser tests used local Chromium and isolated Workers/D1. The baseline regression failed on the missing bootstrap projection. The implemented version passed all five groups, including numeric 47 and 0 with accepted EO missing, unavailable input and revision guards, an actual Subject Load save producing 43 and 0, and independent accepted-R recalculation after explicit Contacts acceptance.

| Check | Result |
| --- | --- |
| `node tests/v1-product-deploy-planning-relief-browser.mjs` | Pass, five groups, 12.635 seconds. |
| `node tests/v1-product-deploy-relief-quota-browser.mjs` | Pass. Existing accepted R diagnostics and calculations. |
| `node tests/v1-product-deploy-workload-planning-browser.mjs` | Pass, four groups. Planning workload and report export basis. |
| `node tests/v1-product-deploy-workload-sci-alias.mjs` | Pass. Exact, missing and conflicting subject alias cases. |
| `node tests/v1-product-roster-workload-snapshot.mjs` | Pass. Draft isolation, automatic publication and republish behavior. |
| Canonical and v1 builds, v1 dry runs and local migration upgrade | Pass. Canonical regeneration clean and all nine configured dry runs passed. |
| Syntax, whitespace and product runner discovery | Pass. |

The version-scope and write boundaries were checked in source and local fixtures. Hosted signed-in UAT of the new view remains pending. The rollback removes the preview response and its display; existing saved records require no migration.
