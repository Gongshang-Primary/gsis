# Task: v1-deploy-hr-terms-contacts-publish

- **Lane:** GSiS v1 (`v1/services/deploy`, `v1/services/contacts`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-deploy-hr-terms-contacts-publish`
- **Status:** Locally verified (ready for Muse exact-head review)

## Scope
Completed the external Contacts HR Terms catalogue publication half of `DEP-17-001` from `docs/v1/DEPLOY_MEMBERSHIP_UAT_LEDGER_2026-11-17.md`:
1. Added `v1/services/deploy/hr-terms-publish.mjs` and froze version-owned HR Terms catalogues (`hrTermsPublication`) inside Deploy's immutable published envelope on `/publish` (preserving explicit empty lists `[]` separately from absent lists; fixed lists excluded; draft saves never mutate Contacts).
2. Added `POST /hr-terms/sync` (`deploy.publish`) in `v1/services/deploy/service.mjs`, plus `POST /internal/hr-terms-publication` and `GET /hr-terms` (`contacts.read`) in `v1/services/contacts/hr-terms-publish.mjs` + `v1/services/contacts/service.mjs`:
   - Contacts verifies Deploy's committed publication and Core's `deploy.publish` decision, updates `contacts_catalogues` atomically with monotonic publication sequence ordering and idempotent replay, and records delivery outcomes in `deploy_deliveries(recipient='contacts-hr-terms')`.
   - Enforces the 15 Nov retain-and-flag rule: existing out-of-catalogue staff values remain stored untouched (`staffValuesMutated: false`) and are returned in `flaggedStaffValues` (`reason: "OUT_OF_PUBLISHED_CATALOGUE"`).
   - Never grants SMC/EO/School Leader authority from catalogue definitions.
3. Added comprehensive regression test `tests/v1-product-deploy-hr-terms-publish.mjs`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-deploy-hr-terms-publish.mjs` — PASS
- `node tests/v1-product-deploy-storage.mjs` — PASS
- `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
- `git diff --check` — PASS

## Remaining Gates
- Independent exact-head review by Muse; merge & coordination by GPT.
- Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy or provider activation performed.
