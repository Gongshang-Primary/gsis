# Task: v1-deploy-hr-terms-contacts-publish

- **Lane:** GSiS v1 (`v1/services/deploy`, `v1/services/contacts`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-deploy-hr-terms-contacts-publish`
- **Status:** Claimed (in progress)

## Scope
Complete the external Contacts HR Terms catalogue publication half of `DEP-17-001` from `docs/v1/DEPLOY_MEMBERSHIP_UAT_LEDGER_2026-11-17.md`:
1. Freeze version-owned HR Terms catalogues (`hrTermsPublication`) inside Deploy's immutable published document envelope on `/publish` (draft saves never mutate Contacts; explicit empty lists remain distinct from absent lists; fixed lists cannot be modified).
2. Add `POST /hr-terms/sync` (`deploy.publish`) in Deploy and `POST /internal/hr-terms-publication` + `GET /hr-terms` (`contacts.read`) in Contacts:
   - Contacts verifies Deploy's committed publication and Core's `deploy.publish` decision, updates `contacts_catalogues` atomically with monotonic publication sequence ordering and idempotent replay, and records delivery state in `deploy_deliveries(recipient='contacts-hr-terms')`.
   - Enforces the 15 Nov retain-and-flag rule: existing staff values outside published catalogues remain stored untouched and are returned in `flaggedStaffValues` without blocking publication.
   - Catalogue publication never grants SMC/EO/School Leader authority.
3. Add comprehensive regression test `tests/v1-product-deploy-hr-terms-publish.mjs`.

## Guardrails
- No v0.9 source or generated files modified (`npm run build` zero drift).
- No live deployment, live school data mutation, or cross-D1 atomicity claims.
