# v1 Contacts/Deploy lifecycle follow-ups: untouched copied deployment tag publication (`C08`), workbook import `Basic Name` provenance (`C06`/`C25`), and equal-millisecond durable ordering (`C26`)

- Task ID: `v1-contacts-lifecycle-c08-c25-c26`
- Model: `Antigravity`
- Branch: `antigravity/v1-contacts-lifecycle-c08-c25-c26`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `1041e392b314659f563e500345c10fe74ee59d25` (`1041e392`)

## Files Claimed
- `docs/coordination/tasks/v1-contacts-lifecycle-c08-c25-c26.md`
- `v1/services/deploy/model.mjs`
- `v1/services/deploy/service.mjs`
- `v1/services/deploy/workbooks.mjs`
- `v1/services/contacts/contributions.mjs`
- `tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs`

## Scope
1. **Untouched Copied Deployment Tag Publication (`C08`)**:
   - In `mergeContacts` (`v1/services/deploy/model.mjs`), retain a version-owned snapshot (`teacher.copiedDeploymentTags`) of the 10 ordinary deployment tags (`Role`, `EO Appt Level`, `Appointment Status`, `Employment Arrangement`, `Employment Status`, `School Section`, `Personnel Category`, `Employment Modifier`, `Subject Modifier`, `MK Modifier`, alongside `Memberships`) when a teacher is copied or refreshed into a Deploy version (`refreshMemberships: true` or newly added teacher). Preserve the existing saved snapshot across ordinary loads and saves without fabricating one for legacy rows that lacked it.
   - In `contributions()` (`v1/services/deploy/service.mjs`), emit `directTagPublicationVersion: 1` contributions for copied deployment tags that have drifted from current Contacts facts (`teacher.deploymentTags`) even when the operator did not touch `doc.teacherDrafts[staffId][field]`, so publishing the version restores its copied tags (including explicit blanks/clears) over subsequent Contacts edits while leaving `Statutory Name` and `Mobile No` untouched.
2. **Workbook Import `Basic Name` Provenance & Cross-Draft Collision Guard (`C06`, `C25`)**:
   - In `validateWorkbook` (`v1/services/deploy/workbooks.mjs`) and `applyImport` (`v1/services/deploy/service.mjs`), when a `Teachers` workbook import genuinely changes a teacher's `Basic Name` relative to the version's planning baseline, record server-assigned `teacherDraftMeta[staffId].basicNameProvenance` (`value`, `changedAt`, `source: "deploy"`, `actorId`, `operationId`) and project the version's planning names. Unchanged workbook imports leave `basicNameProvenance` and `teacherDrafts` untouched.
   - In `save()` (`v1/services/deploy/service.mjs`), run `assertNoCrossDraftTTbCollision` on any `TTb Name` change regardless of whether the save came from `applyEdits` or `applyImport`.
3. **Deterministic Durable Ordering for Equal-Millisecond `Basic Name` Edits (`C26`)**:
   - Include `basicNameOperationId` on Deploy `basicName` contributions (`v1/services/deploy/service.mjs`) and compare `(changedAt, operationId)` against Contacts `(accepted_at, operation_id)` in `processContribution` (`v1/services/contacts/contributions.mjs`) so equal-millisecond `Basic Name` edits have a deterministic, replay-invariant durable tie-breaker (`CONTACTS_BASIC_NAME_NEWER`) without relying on delivery order or client timestamps.
4. **End-to-End Regression Test (`tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs`)**:
   - Isolated Miniflare/D1 verification of `C08`, `C06`/`C25`, and `C26`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs` — **PASS**
- `node tests/v1-product-contacts-deploy-direct-publication.mjs` — **PASS**
- `node tests/v1-product-deploy-draft-contacts-insulation.mjs` — **PASS**
- `node tests/v1-product-deploy-workbooks.mjs` — **PASS**
- `node tests/v1-product-membership-publication.mjs` — **PASS**
- `node tests/v1-product-authority-publication.mjs` — **PASS**
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — **PASS**
- `node tests/v1-product-deploy-planning-eligibility.mjs` — **PASS**
- `node tests/v1-product-deploy-memberships.mjs` — **PASS**
- `node tests/v1-product-core-contacts.mjs` — **PASS**
- `npm run build && git diff --exit-code -- roster-update/ public/ shared/` — **PASS** (zero v0.9 drift)
- `node scripts/v1/build.mjs && node scripts/v1/verify-build.mjs` — **PASS**
- `git diff --check` — **PASS**
