# v1 Deploy draft Contacts insulation & `Basic Name` provenance (`C18`, `C06`, `C25`, `C26`)

- Task ID: `v1-deploy-draft-contacts-insulation`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-draft-contacts-insulation`
- Status: **Reconciled with main. Exact-head CI and Muse review pending.**
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

## #254 reconciliation (Model: Codex)

The owner requested resolution of #254. The reconciliation starts at
`700844cbb31bbf0d26ab06b183bb28cd9fe40ec5` and incorporates main
`f1085ceb79a3534f7296ac0a5bc4474af78f3fcd`, including #255.
The exact files in scope are the six above, plus
`v1/services/deploy/workbooks.mjs` for the Teachers workbook's planning
values and comparison baseline and
`tests/v1-product-deploy-planning-eligibility.mjs` for the Duplicate
regression. No other open PR claims either added file.
Muse reviews the updated exact head.

## Scope
1. **Deploy Draft Contacts Insulation (`C18`)**:
   - Extended `planningSnapshot()` in `v1/web/shared/deploy-eligibility.mjs` and `mergeContacts()` in `v1/services/deploy/model.mjs` so an existing Deploy version's saved ordinary planning profile (`Basic Name`, `Role`, `EO Appt Level`, `Appointment Status`, `Employment Modifier`, `Subject Modifier`, `MK Modifier`, `Active`, `Memberships`) is insulated from automatic overwrite by subsequent Contacts edits on normal load/save/calculate/export (`refreshMemberships: false`).
   - Preserved live evaluation of current accepted `authority` (`eo`, `smc`, `schoolLeader`), `teachingEligibility`, `quality`, `fieldRevisions`, `contactsRevision`, and `basicNameProvenance` from Contacts.
   - Duplicate copies refreshed Contacts-backed fields and keeps draft-only staff and the source version's assignments and notes. Explicit Contacts refresh updates the baseline and retains saved overrides in the same version.
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

## Reconciled verification (Model: Codex)

- `tests/v1-product-deploy-draft-contacts-insulation.mjs`: PASS against built local Workers and D1. Ordinary saved fields and TTb stay stable after a Contacts edit. The Teachers export and unchanged preview use the same baseline. Live accepted facts and Basic Name provenance remain current. An unchanged full-profile name save retains the original provenance. Duplicate refreshes known Contacts staff, and explicit refresh retains saved draft edits.
- `tests/v1-product-contacts-deploy-direct-publication.mjs`, `tests/v1-product-deploy-duplicate-contacts.mjs`, `tests/v1-product-deploy-planning-eligibility.mjs`, `tests/v1-product-deploy-workbooks.mjs` and `tests/v1-product-deploy-memberships.mjs`: PASS. Verified publication precedence, tag clears, typed copy/assignment retention, eligibility, workbook behavior and authority guards.
- `npm run build` with zero tracked v0.9 drift, `node scripts/v1/build.mjs`, `node scripts/v1/verify-build.mjs` and `git diff --check`: PASS. Workers and migrations verified locally.
- The broader run at `1ae8d229` exposed a Teachers import regression when clearing a Role whose old matrix supplied the EO level. The reference cell now accepts the displayed prior level for an unmapped destination Role. The existing internal-links test, workbook tests and #254 regression pass with that correction.
- Visible changes: saved TTb names and Teachers export fields follow the selected version. Duplicate shows current Contacts fields for existing staff. Explicit refresh retains the version's saved edits.
- Still open outside this reconciliation: publication of every untouched copied tag, name provenance on changed workbook imports, and equal-millisecond edit ordering. No hosted UAT, live data access or deployment.
