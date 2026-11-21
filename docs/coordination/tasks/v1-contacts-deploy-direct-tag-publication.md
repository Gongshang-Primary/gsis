# v1 Contacts direct Deploy tag publication, `Basic Name` timestamp conflict & cross-draft `TTb Name` reservation (`C04`, `C05`, `C08`–`C10`, `C19`–`C23`)

- Task ID: `v1-contacts-deploy-direct-tag-publication`
- Model: `Antigravity`
- Branch: `antigravity/v1-contacts-deploy-direct-tag-publication`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-contacts-deploy-direct-tag-publication.md`
- `v1/services/core/contributions.mjs`
- `v1/services/contacts/contributions.mjs`
- `v1/services/deploy/model.mjs`
- `v1/services/deploy/service.mjs`
- `tests/v1-product-contacts-deploy-direct-publication.mjs`

## Scope
1. **All 11 Deployment Tags + Blank-Clears + Bidirectional `Active` (`C04`, `C05`, `C08`–`C10`, `C21`)**:
   - Expand `proposalFields` in `v1/services/deploy/model.mjs`, `contributions()` in `v1/services/deploy/service.mjs`, and `authorizeContribution()` in `v1/services/core/contributions.mjs` to support all 11 deployment tags (`role`, `eoAppointmentLevel`, `appointmentStatus`, `employmentArrangement`, `employmentStatus`, `schoolSection`, `personnelCategory`, `employmentTags`, `subjectTags`, `mkTags`, `memberships`), bidirectional `employmentActive` (`Y↔N`), and `basicName`.
   - Normalize blank-clears (`""` / `null` -> `null` for scalar tags, `[]` for multi-token modifier tags) and semicolon/comma-separated modifier lists before Contacts validation and application.
2. **Timestamp-Checked `Basic Name` Conflict Resolution (`C25`, `C26`)**:
   - Include `basicNameChangedAt` on Deploy `basicName` contributions and compare against Contacts' `contacts_fields.accepted_at` in `v1/services/contacts/contributions.mjs`: when Contacts' `Basic Name` was edited more recently, supersede the stale Deploy `basicName` contribution rather than overwriting Contacts' newer value.
3. **Cross-Draft `TTb Name` Reservation & Release on Draft Deletion (`C19`, `C22`)**:
   - Add `assertNoCrossDraftTTbCollision` in `v1/services/deploy/service.mjs` so registering a provisional teacher or renaming a teacher's TTb Name in one draft rejects collisions (`409 DUPLICATE_TTB_NAME`) with another active draft version, and deleting the conflicting draft immediately releases the reservation.
4. **Regression Test (`tests/v1-product-contacts-deploy-direct-publication.mjs`)**:
   - End-to-end isolated Miniflare/D1 verification of all 11 deployment tags + blank-clears + bidirectional `Active`, `Basic Name` timestamp conflict resolution (Contacts newer wins vs Deploy newer wins), and cross-draft `TTb Name` reservation + release on draft deletion.
