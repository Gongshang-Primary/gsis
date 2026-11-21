# v1 Deploy draft Contacts insulation & `Basic Name` provenance (`C18`, `C06`, `C25`, `C26`)

- Task ID: `v1-deploy-draft-contacts-insulation`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-draft-contacts-insulation`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-draft-contacts-insulation.md`
- `v1/web/shared/deploy-eligibility.mjs`
- `v1/services/contacts/service.mjs`
- `v1/services/deploy/model.mjs`
- `v1/services/deploy/service.mjs`
- `tests/v1-product-deploy-draft-contacts-insulation.mjs`

## Scope
1. **Deploy Draft Contacts Insulation (`C18`)**:
   - Extended `planningSnapshot()` in `v1/web/shared/deploy-eligibility.mjs` and `mergeContacts()` in `v1/services/deploy/model.mjs` so an existing Deploy version's saved ordinary planning profile (`Basic Name`, `Role`, `EO Appt Level`, `Appointment Status`, `Employment Modifier`, `Subject Modifier`, `MK Modifier`, `Active`, `Memberships`) is insulated from automatic overwrite by subsequent Contacts edits on normal load/save/calculate/export (`refreshMemberships: false`).
   - Preserved live evaluation of current accepted `authority` (`eo`, `smc`, `schoolLeader`), `teachingEligibility`, `quality`, `fieldRevisions`, `contactsRevision`, and `basicNameProvenance` from Contacts.
   - Refreshes ordinary planning fields from Contacts on `Duplicate` (`refreshMemberships: true`) and explicit `acceptContacts` (`refreshMemberships: true`).
2. **Server-Assigned `Basic Name` Provenance (`C06`, `C25`, `C26`)**:
   - Exposed server-assigned `basicNameProvenance` (`{ value, changedAt, source: "contacts", operationId }`) in Contacts' `deploy` projection (`v1/services/contacts/service.mjs`).
   - Recorded server-assigned `teacherDraftMeta[staffId].basicNameProvenance` (`{ value, changedAt, source: "deploy", actorId, operationId }`) whenever `"Basic Name"` is edited in Deploy (`v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`), ignoring any client-supplied timestamp.
3. **Regression Test (`tests/v1-product-deploy-draft-contacts-insulation.mjs`)**:
   - End-to-end isolated Miniflare/D1 verification.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-deploy-draft-contacts-insulation.mjs` — **PASS**
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — **PASS**
- `node tests/v1-product-deploy-planning-eligibility.mjs` — **PASS**
- `npm run build && git diff --exit-code -- roster-update/ public/ shared/` — **PASS** (zero v0.9 drift)
- `node scripts/v1/build.mjs && node scripts/v1/verify-build.mjs` — **PASS**
- `git diff --check` — **PASS**
