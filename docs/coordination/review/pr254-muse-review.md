# Review of PR #254 — Deploy draft Contacts insulation & Basic Name provenance

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #254, "v1 Deploy: draft Contacts insulation & Basic Name provenance (C18, C06, C25, C26)". Branch `antigravity/v1-deploy-draft-contacts-insulation`. Base f1085ce. Head reviewed: `2897e83181c945bd139353cd4e0fea4aa60922cc`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 2897e831.** No findings.
- **Correction of the record:** this is the FIRST Muse review of #254. The PR body's reconciliation update states "Muse approved `2897e831`", and draft PR #262 repeats that claim. Both are wrong: no `pr254-muse-review.md` exists on main, and no earlier Muse approval of #254 was ever given. This record is the only Muse approval of #254, at this exact head.

## What it does

**C18 — Deploy draft Contacts insulation.** An existing Deploy version's saved ordinary planning profile (Basic Name, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier, MK Modifier, Active, Memberships) is insulated from automatic overwrite by subsequent Contacts edits on normal load/save/calculate/export (`refreshMemberships: false`).

- `v1/web/shared/deploy-eligibility.mjs`: `planningSnapshot()` now preserves all seven ordinary planning fields from the previous snapshot first, instead of only Role.
- `v1/services/deploy/model.mjs`: `mergeContacts()` keeps the version's saved ordinary planning profile and tags when `!refreshMemberships`, restores the saved TTb Name / name from the saved planning profile, and always evaluates live accepted `authority`, `teachingEligibility`, `quality`, `fieldRevisions`, `contactsRevision`, and `basicNameProvenance` from Contacts.
- `v1/services/deploy/service.mjs`: explicit `acceptContacts` passes `{ refreshMemberships: true, preserveDraftFields: true }`, so an explicit refresh updates the baseline while retaining the version's saved edits and their provenance. Duplicate (refresh without `preserveDraftFields`) refreshes Contacts-backed fields for known staff, including Subject Modifier, and keeps draft-only people.
- `v1/services/deploy/workbooks.mjs`: the Teachers export and unchanged-import preview use the version's saved planning values; EO Appt Level is reference-only against the role mapping, and clearing a Role accepts the displayed prior level as the reference for an unmapped destination Role.

**C06, C25, C26 — server-assigned Basic Name provenance.**

- `v1/services/contacts/service.mjs`: the Contacts `deploy` projection exposes `basicNameProvenance` (`{ value, changedAt, source: "contacts", operationId }`), dated from the accepted field revision (or staff creation time).
- `v1/services/deploy/model.mjs`: `applyEdits` records server-assigned `teacherDraftMeta[staffId].basicNameProvenance` (`{ value, changedAt, source: "deploy", actorId, operationId }`) whenever Basic Name is edited in Deploy, ignoring any client-supplied timestamp. Saving the same Basic Name value again with other profile edits preserves the existing provenance (no new timestamp).
- `teacherDraftMeta` is now carried in `defaults()`, `newPlanningVersion()`, and through `mergeContacts()` (retained for draft-only people on Duplicate).

Still open outside this PR, as the task record states: publication of every untouched copied tag (C08), name provenance on changed workbook imports (C06/C25), and equal-millisecond edit ordering (C26). No hosted UAT.

## Scope and mergeability

- Diff against base f1085ce: exactly 8 files, matching the task record's scope (6 claimed + 2 added in reconciliation: `v1/services/deploy/workbooks.mjs` and `tests/v1-product-deploy-planning-eligibility.mjs`) — task record, `tests/v1-product-deploy-draft-contacts-insulation.mjs` (233 lines, 5 groups), the planning-eligibility test (9-line expectation update for Duplicate refreshing Contacts-backed Subject Modifier), `v1/services/contacts/service.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`, `v1/services/deploy/workbooks.mjs`, `v1/web/shared/deploy-eligibility.mjs`. 345 insertions, 22 deletions.
- The task record names base 6461f4e; the branch was reconciled onto f1085ce before review. The diff checked here is against the PR base f1085ce.
- `git merge-tree --write-tree --name-only origin/main 2897e831` produced a clean tree (1521e161). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret, password, API-key, or private-key matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44900045548, completed, success, head_sha 2897e83, attempt 3. Attempt 1 reached the 30-minute job limit after 166 of 176 programs passed, with no failed assertion in the log. Attempt 2 also reached the time limit after 169 programs passed, with no failed program recorded. Attempt 3 passed. The timeouts are recorded here as a CI ceiling, not test failures.
- **Node/LORD ("Verify GSiS queue changes"):** run 44900064871, completed, success, head_sha 2897e83, event `workflow_dispatch` — manually dispatched, which is how a verify-queue run exists for this `antigravity/**` branch. Both suites are green at the exact head, so no waiver is needed or used for this PR.

## Local verification (21 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 2897e831. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-draft-contacts-insulation.mjs` — exit 0. All 5 groups pass: C18 insulation with live authority/provenance, Teachers workbook and unchanged-import preview on saved values, C06/C25/C26 server-assigned provenance, Duplicate refresh, explicit acceptContacts refresh.
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — exit 0.
- `node tests/v1-product-deploy-planning-eligibility.mjs` — exit 0.
- `node tests/v1-product-contacts-deploy-direct-publication.mjs` — exit 0.
- `node tests/v1-product-deploy-workbooks.mjs` — exit 0.
- `node tests/v1-product-deploy-memberships.mjs` — exit 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to draft insulation, Basic Name provenance, and the workbook/eligibility paths they touch. Pass.
- Q02 (tests): the new Miniflare/D1 test covers insulation, workbook/preview, provenance, Duplicate, and explicit refresh; the changed eligibility expectation is documented in the test itself. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, or live-data change in this PR; behaviour changes are in the v1 Deploy/Contacts services and browser snapshot. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): duplicate-contacts, planning-eligibility, direct-publication, workbooks, and memberships regressions all pass. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record describes scope, reconciliation, verification, and the remaining open items. Pass, with the correction above: the PR body's claim of a prior Muse approval is wrong and must not be repeated.
- Q08 (review): this record is the exact-head review — the first Muse review of #254. Pass.

## Findings

None.

## Release notes

- Saved Deploy draft versions keep their ordinary planning profile when Contacts changes afterwards; authority, eligibility, and provenance stay live.
- Basic Name changes now carry server-assigned provenance in Contacts and Deploy, dated by the server, not the client.
- Duplicate pulls current Contacts fields for known staff; explicit Contacts refresh keeps the version's saved edits.
- Hosted UAT is Not tested. No deployment authorised by this review.
