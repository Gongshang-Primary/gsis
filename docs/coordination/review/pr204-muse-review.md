# Muse review — PR #204: populate Deploy planning staff lists and Span

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #204, branch `codex/v1-deploy-planning-eligibility`, draft, not merged.
- Exact head reviewed: `3802373188482a7af1f6555bca57c9ad6ba35dfb`.
- Base / accepted final scope clarification: `b9eb74e00f8fe8001509ccd16f442bfdf0f1d1ab` (initial claim `3bd54265194cff0b25e8d1201ead47883a54734e`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Deploy's planning lists were empty or wrong because they depended on accepted Contacts teaching-capacity facts and on a pre-existing reporting snapshot. Span of Control required an Initialize step before it showed anyone.

The fix is one pure v1 eligibility policy, `v1/web/shared/deploy-eligibility.mjs`, now serving the built UI, native owner validation and workbooks. The saved teacher inventory supplies the planning choices. Span populates immediately and includes active SAT × MK staff. Other planning lists exclude active staff tagged MK, SAT, Support or School Leader. Missing optional EO facts no longer empty those lists. Existing assignments remain visible and can be removed.

## Scope verified

- Diff is exactly the 15 paths in the task record `docs/coordination/tasks/v1-deploy-planning-eligibility.md`: the task record, `docs/v1/DEPLOY_PLANNING_ELIGIBILITY_2026-11-17.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-contacts-projection-browser.mjs`, `tests/v1-product-contacts-projection.mjs`, `tests/v1-product-deploy-planning-eligibility-browser.mjs`, `tests/v1-product-deploy-planning-eligibility.mjs`, `tests/v1-product-deploy-storage.mjs`, `tests/v1-product-deploy-workbooks.mjs`, `tests/v1-product-tables.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/role-memberships.mjs`, `v1/services/deploy/workbooks.mjs`, `v1/web/shared/deploy-eligibility.mjs`, `v1/web/shared/deploy-ui.js`. 2,117 insertions, 192 deletions.
- `git merge-tree --write-tree --name-only origin/main 3802373` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No v0.9 source, Core authority, Roster workload/capacity eligibility, permission grant, migration, live data, provider or deployment changes. No new dependency or configuration.

## Design read

- `deploy-eligibility.mjs` is pure. `planningSnapshot` preserves only ordinary version Role and Active already held by the version, with explicit drafts first; an explicit unknown prevents a later Contacts refresh from fabricating Active=true. `planningPerson` derives mk/sat/support/sl from the version Role, Membership matrix flags, School Section, personnel category and MK facts. `planningEligible` is active && !MK && !SAT && !Support && !SL. `reportingEligible` is active && (!MK || SAT), so Span includes active SAT, SAT × MK, Support, School Leaders and OSO. `reportingRoot` is the School Leader check. `reportingLinks`/`reportingConflicts`/`reportingStaff` handle the legacy `staff.ro`, `officers` and `parents` aliases per person; retained excluded relationships stay inspectable and are never new choices.
- `model.mjs` `mergeContacts` now stamps `teacher.planningProfile` from the saved planning snapshot, keeping version Role/Active separate from fresh accepted authority/capacity facts; a note-only save does not call mergeContacts or annotate unrelated rows. Duplicate refresh (`refreshMemberships`) removes only Role/Active draft overrides for current Contacts IDs; draft-only people and unrelated draft fields survive.
- `teachingBindings` is now `planningBindings` and covers class assignments, organisation slots/additionalDeputies/tls, legacyLeadership and duties. Fixed leadership positions stay positional; ordinary member lists preserve identity and occurrence counts through compaction, so removing a member does not turn another retained member into a new assignment. `validateTeachingBindings` checks new bindings against `planningEligible` (version-owned) instead of accepted Contacts teaching eligibility — this is the owner's rule change, disclosed in the task record and PR body; accepted-capacity assertions are retained elsewhere (see below).
- Group and duty saves check each new member reference against `planningEligible`; retained references pass by occurrence-count comparison against the previous group. The unchanged classic codec still rejects duplicate historical leadership identities before sending.
- `initReporting` now builds its staff list from `reportingStaff(d)`; the UI no longer needs an Initialize step to display Span. `setReportingOfficer` accepts an active eligible officer, or keeping/clearing an existing retained link; a School Leader root is protected unless the value is unchanged or cleared; an excluded officer's retained link may only be kept or cleared. An existing orphan edge can be cleared explicitly with its observed expected value, removing only that person's edge aliases and clearing their retained `staff.ro`, preserving the staff snapshot and audit history. The first explicit reporting edit initializes missing durable reporting state atomically in the owning save. Contradictory legacy aliases are flagged and reconciled only for the edited person.
- `role-memberships.mjs`: `roleMapping` now reads the same version-owned Role precedence as the UI and workbooks (explicit draft first, then the saved planning Role snapshot) instead of skipping the preserved snapshot; `contactsMemberships` display uses the same version Role. Publication proof and authority-application contracts are unchanged; planning eligibility never grants application access.
- `workbooks.mjs`: Teachers export uses the planning Role and `activeKnown ? active : null` (unknown stays unknown, not fabricated true); Membership export uses the planning Role; Span export uses `reportingLinks`/`reportingStaff` with historical retention, and lists historical and conflicting Staff IDs in the export metadata instructions.
- `deploy-ui.js` imports the eligibility module (hence the builder change to a module include) and wires `planningEligible` into the teacher-choice helpers and `reportingStaff` into the Span views.
- `scripts/v1/build-web.mjs`: one line only — the Deploy page now loads `deploy-ui.js` as a browser module. No new business-logic text patch.

## Updated old assertions (disclosed, not hidden)

- `tests/v1-product-contacts-projection.mjs`: the old planning assertion denied a new assignment solely because accepted Contacts activity changed after the version saved explicit Active=Y. Under the owner's new version-owned choice rule, the test now proves both version Active=Y acceptance and explicit version Active=N rejection, while retaining the accepted-capacity exclusion, actor, school, current-authority and history assertions. This update was part of the accepted scope clarification.
- `tests/v1-product-tables.mjs`: the fixture injected `deploy-ui.js` as a classic inline script; it now serves the unchanged UI module and its real dependency as browser modules on an intercepted synthetic origin, preserving every existing table/permission assertion. This anticipates the same fixture incompatibility already proven and corrected in the separate Load task (#203).

## CI verified at the exact head

- Node/LORD run 44061183525: head_sha verified `3802373`, all five jobs green, 1,227/1,227 Node programs, 40/40 LORD checks in each of four shards.
- Product/package run 44061648616: head_sha verified `3802373`, success, 126/126 product programs, canonical no-drift build, isolated build, nine Worker dry-runs/local migration upgrade and packaging passed. Duplicate product run 44064601098 also success at the exact head.
- Meaningful failures are recorded in the task: the initial browser saw an Initialize prerequisite; the changed version passes. Old tests that denied version-owned planning solely because Contacts later changed Active were updated under the owner's rule, with actor/authority and accepted-capacity checks retained.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-planning-eligibility.mjs` — PASS (27.8s in the builder's run; local run also PASS).
- `node tests/v1-product-deploy-planning-eligibility-browser.mjs` — PASS.
- `node tests/v1-product-deploy-storage.mjs` — PASS.
- `node tests/v1-product-deploy-workbooks.mjs` — PASS.
- `node tests/v1-product-contacts-projection.mjs` — PASS.
- `node tests/v1-product-contacts-projection-browser.mjs` — PASS.
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS.
- `node tests/v1-product-deploy-role-memberships.mjs` — PASS.
- `node tests/v1-product-deploy-memberships-browser.mjs` — PASS.
- `node tests/v1-product-deploy-role-memberships-browser.mjs` — PASS.
- `node tests/v1-product-tables.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS, nine service/web bundles.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (integration, not blocking this PR): PR #203 (Subject Load/LSP/FORM saves) is a sibling that also edits the same Deploy script-inclusion line in `scripts/v1/build-web.mjs` — #203 makes `deploy-ui-tables.js` a module and adds `deploy-loads-ui.js`; #204 makes `deploy-ui.js` a module. Both PR bodies disclose this. When the first of the two merges, the second needs a bounded integration update combining both module includes, with a build/browser recheck at its new exact head. Neither PR contains the other's product code, and each is self-consistent at its own head. (The #203 review record is on main as fb251182.)
- N2 (limits, as stated in the PR): the common Drive backup reader statically imports Deploy workbooks, so all eight owner bundles plus web assets can change; artifact comparison is required before any later release. No backup is activated. Hosted/authenticated runtime UAT and restore UAT remain Not tested. F5 remains OPEN; T1B-01/T1B-02 remain Not tested. No merge or deployment by this PR.
- N3: the v0.9 comparison is explicit and deliberate — v0.9 excluded OSO from Span, which the owner's new "all except MK" Span rule supersedes, and v0.9 excluded SAT × MK from Span, which the new rule includes.

## Quality gates

- Q01: Pass. Owner request and accepted claim clarifications recorded; exact inventory in the task record.
- Q02: Pass. Version planning fields separated from accepted authority/capacity; no permission grant; no migration.
- Q03: Pass. Actor/school/capability/revision/fence/receipt checks retained and exercised.
- Q04: Pass. Native atomic initialization, expected values, revision/fence and replay checks exercised locally and in CI.
- Q05: Pass. Existing bounded owner routes and payload limits reused; no dependency or migration.
- Q06: Pass. Local verification above; exact-head Node/LORD and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is this bounded commit; no data/schema rollback is needed.
