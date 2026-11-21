# v1 triage: Antigravity PRs #263–#273 (Claude, 21 Nov 2026)

Project: **v1**. Model: Claude. Role in this pass: owner-directed triage of every PR started by or marked for Antigravity ("carry on the work"). Muse reviews each exact head; GPT (Codex) merges; the owner orchestrates. This record is advisory. It is not an approval and does not replace Muse's exact-head review.

Base: main `166d06e9` (after #261). Handoff source: draft #262, `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md`.

## 1. Main is red; #263 is the gate

`tests/v1-product-deploy-save-recovery-browser.mjs:1161` fails on main `166d06e9` (reproduced locally: Review shows "Unavailable teacher … Unavailable class"). Every other Antigravity PR fails CI by exactly this one program (`176/177`, `177/178`). #263 fixes the test fixture by seeding the class and teacher through the real API, and its own CI is green.

**Merge #263 first.** Then update each other PR branch from main and rerun CI.

## 2. CI time cap will block merging

The `product` job in `.github/workflows/v1-build.yml` has `timeout-minutes: 30`. Main runs 177 programs in about 27 minutes. #265, #266, #271 and #273 were **cancelled** at 30 minutes, not failed. With all ten PRs merged the suite has 187 programs, so every later PR will time out. Recommendation: one small workflow PR that raises the cap to 60 now, then shard `scripts/v1/test.mjs` later.

## 3. Combined integration

All eleven branches merge cleanly onto `main + #263` in any order tested (pairwise and stacked). `npm run build` leaves the production build unchanged. Full combined v1 suite result: see section 5.

## 4. Per-PR findings (for Muse and the builder)

| PR | Item | CI at head | Finding |
| --- | --- | --- | --- |
| #263 | Deploy recovery test fixture | green | No finding. Gate for the rest. |
| #264 | Deploy Audit list/detail | 1 fail (main) | No blocking finding. Version-scoped total, cursor, detail lookup scoped by school+version, historical-row notice. Note: `json_extract` scans `product_audit`; acceptable at school scale. |
| #265 | Calendar year archive | cancelled (cap) | No blocking finding. Digest now covers YearStructure/DayNotes metadata; commit recomputes the same preview. Minor: metadata query is capped at `MAX_EVENTS+1` without a 413 check, so counts could under-report silently on very large years. |
| #266 | Deploy audit change capture | cancelled (cap) | No blocking finding. Actor label comes from the verified principal; entries bounded (20 / 12 KiB); written atomically with the save. **Owner question:** before/after now stores HR choices and teacher notes in the Admin audit log. Confirm that this is acceptable. |
| #267 | Calendar bulk import UI | 1 fail (main) | No blocking finding. Separate from the existing definitions importer; stable operation identity kept in sessionStorage and cleared on sign-out. Server enforces capability. |
| #268 | Calendar venue picker focus | 1 fail (main) | No finding. Build-time transform only; v0.9 source unchanged. |
| #269 | Layout first import G04 | 1 fail (main) | No blocking finding. New `SNAPSHOT_NOT_INITIALIZED` 404 only for a missing head; storage failure keeps `SNAPSHOT_UNAVAILABLE` 503. No cross-service consumer depended on the old code. |
| #270 | Deploy Workload Sci/PE alias | 1 fail (main) | **Fixed by Claude, commit `a28cb3bd` (not yet pushed).** Was: should fix. `workloadAliasView` renames load keys (`Science`→`Sci`, `PE`→`PHE`) but not `groups[].subject`. `shared/workload.js isFormSubject` compares `g.subject===subject` for level-wide groups, so a level-wide `PE` or `Science` group no longer suppresses the form-class demand, which can double-count. Fix: normalise level-wide group subjects in the same view (or compare aliased names), and add a test with a level-wide group. |
| #271 | LORD manual Contacts refresh | cancelled (cap) | No finding. `active:null` is skipped like inactive; other non-boolean values are still refused. |
| #272 | Core evidence retention cross-owner | 1 fail (main) | **Fixed by Claude, commit `9d48f081` (not yet pushed).** Was: must fix. Proved: at `fb83fe9b`, `dryRun:false` without a digest deleted at once. (a) The stale-digest check runs before `prepareOperation` returns the stored receipt. After a committed delete, a retry with the same `operationId` and `previewDigest` recomputes a new digest and returns `409 PREVIEW_CHANGED` instead of the original receipt. That breaks lost-response recovery, which the handoff requires. Move the check after the receipt lookup, and add a replay test that sends `previewDigest`. (b) `previewDigest` is optional for a real delete, so the stale-preview guard can be skipped. Require it when `dryRun` is false. Deletion stays behind `RETENTION_DELETE_ENABLED`, so there is no live exposure today. |
| #273 | Venues empty-register guidance | cancelled (cap) | No blocking finding. UI-only notice; the Deploy wrapper depends on `opts.rooms` being passed to `GSISrenderLayout`. |

## 5. Verification actually run (TZ=Asia/Singapore, local Chromium 1243)

- `npm ci`, `npm ci --prefix v1`, `npm run build`, `git diff --exit-code`: passed on the combined tree.
- `node tests/v1-product-deploy-save-recovery-browser.mjs` on main: **fails** at line 1161 (reproduces CI).
- `node scripts/v1/test.mjs` on main + all eleven branches: RESULT_PENDING
- Not run: v0.9 Node/LORD suite (no v0.9 paths changed), hosted UAT, deployment.

## 6. Recommended order for GPT

1. #263. 2. CI cap PR. 3. Independent low-risk items: #268, #271, #269, #265, #273, #267. 4. Deploy pair in order #264 then #266 (both touch `v1/services/deploy/service.mjs`). 5. #270 and #272 after their fixes.

## 7. Claude follow-up commits (owner chose "push to their branches")

| Commit | Branch | Change | Local tests |
| --- | --- | --- | --- |
| `9d48f081` | `antigravity/v1-core-evidence-retention-cross-owner` (#272) | Receipt replay before digest check; digest required for a destructive run | core-evidence-retention passes; fails on old head |
| `a28cb3bd` | `antigravity/v1-deploy-workload-sci-alias` (#270) | Level-wide group subjects take the canonical alias in the derived view | sci-alias case 6 fails before, passes after; 7 neighbouring Deploy/Roster programs pass |
| `019bd68d` | `claude/v1-ci-timeout` (new) | `v1-build.yml` product cap 30 → 60 min | workflow only |

**Blocker:** from this session, git push and GitHub comment writes return 403 (GitHub App access for Gongshang-Primary). GitHub reads work. The commits are held locally and exported as patches until access is restored. Each changes the PR's exact head, so Muse must review the new head.
