# Review: PR #190 — Preserve all Contacts tags when duplicating Deploy

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `46f0d875b8a44980d03cf6e96b1d392fefc79780`.
- Base / accepted scope amendment: `38aa1332a847bf6c052fb37c3f58ba0c5fd1d7e9` (initial claim `47bf16af376c34fdff69d696f15f21ea34ba61c9`).
- CI run: [43805750190](https://github.com/helper-gsps/gsis/actions/runs/43805750190), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43807271911](https://github.com/helper-gsps/gsis/actions/runs/43807271911) also green at the exact head (108 product programs, canonical build, nine Worker dry-runs, local migration verification, artifact packaging).
- PR: https://github.com/helper-gsps/gsis/pull/190 (Codex, branch `codex/v1-deploy-duplicate-contacts-tags`).
- Task record: `docs/coordination/tasks/v1-deploy-duplicate-contacts-tags.md` (in the PR; reviewer line already names Muse).

## What it does

Duplicate version previously omitted Employment Status and Personnel Category and retained other tags only in lossy legacy display fields. The Contacts deployment projection now includes the two missing ordinary fields, and each refreshed teacher keeps all eleven typed values separately in `deploymentTags`. The legacy profile stays a derived display/calculation projection (its combined employment display is unchanged), so R/budget calculations do not change. A current owner-written optional clear is distinguishable from absence: the projection exposes a narrowly validated `cleared:true` marker for a superseded null record with its revision, operation and current interval; it stays `effective:false` and no authority acceptance is invented. Duplicate retains inactive/partial people, stable IDs, planning assignments, Deploy-only notes and draft-only teacher values, and writes neither Contacts nor the source version. Exact retries return the same version after restart.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-deploy-duplicate-contacts.mjs`: exit 0. "PASS built Duplicate control / nine Workers / D1: all eleven typed tags, refreshed inactive/partial people, exact clears, assignments/notes/IDs, authority/isolation and restart receipt recovery".
- Named regressions, all exit 0: `v1-product-core-contacts`, `v1-product-contacts-projection`, `v1-product-deploy-storage`, `v1-product-roster-workload-snapshot`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the six claimed files. The existing projection test changes only two expected public field names; privacy and authority assertions remain. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the code diff in full: Contacts `deployField` adds the clear branch only when the row is a direct field, state `superseded`, value null, unrevoked, revision > 0, operation id present, and the interval is current — it never invents a clear from absence; `DEPLOY_FIELDS` and the projection field list gain the two fields; Deploy `mergeContacts` builds `deploymentTags` from fields with a fact or a current clear, typed (null for clear, token lists for lists, code for scalars), and the legacy profile now reads from that snapshot with the same combined employment display. No guard is weakened: authority, capability, school and operation-intent checks are retained and covered by the new test.
- Read the handoff doc: it states the boundary plainly — this is the first field-copy subset of lifecycle C17; C18's version-owned snapshot freeze across later load/save/recalculation/export remains unimplemented, and the common mapper still refreshes those paths.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner work order 16 Nov item 3(f), first Contacts lifecycle claim only; six-path allowlist held (the sixth path is the existing projection test's expected-field list, added by amendment before editing).
- Q02 Design and ownership: pass. Contacts owns the projection; Deploy owns the version snapshot; the legacy profile is a derived view, not a competing master.
- Q03 Security and privacy: pass. No auth change; a clear is never relabelled as accepted authority; future, expired, revoked or unowned evidence does not become a clear.
- Q04 Concurrency and recovery: pass. Exact retry returns the same version, including after restart; source version and Contacts are not written by duplication.
- Q05 Resources and maintainability: pass. No dependency, migration, new query per teacher, or unbounded collection; existing 512-person/page and atomic version-write bounds remain.
- Q06 Verification: pass. New test plus all four named regressions pass locally; exact-head Node/LORD CI and product CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, Google activation, live data or provider operation; F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

The existing Duplicate control now saves the complete eleven-field data. No new UI control or layout change. Still deferred: C18 freeze, complete category exclusions, name reservation/precedence, independent TTb derivation, new-person creation, publication reconciliation and Roster mobile writes.
