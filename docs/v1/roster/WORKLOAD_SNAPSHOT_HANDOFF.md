# Roster workload copies without locking Deploy

Model: Codex. Independent exact-head reviewer: Claude. Branch `codex/v1-roster-workload-snapshot`; refreshed main `1754c535738adb1cad8dd328f45dd60ea6580f03`; accepted claim/base `511269b778f6d948ecedde8ea63deb4c095a44f4`. The implementation PR identifies the exact tested head, CI and final results; no earlier head's review transfers. [Claim and exact sixteen-path scope](../../coordination/tasks/v1-roster-workload-snapshot.md).

The owner requires Roster to hold its own temporary version while Deploy remains editable. The local nine-Worker/D1 reproduction inserted a stranded Roster planning pin, then submitted an authorised Deploy metadata save. Before correction it returned `409 SOURCE_CHANGE_PENDING`: “Roster is using this saved workload.” The same behavioural test must pass with that original pin retained after correction.

## Ownership and behavior

Deploy remains the authority for saved plans and immutable publications. A Roster request fetches the current workload projection and retains one current copy per school/date in `roster_workload_snapshots`. Each allocation also keeps its existing immutable `roster_runs.snapshot_json`, now naming the exact local workload digest/revision. This is a projection, not a new staff/authority source.

- Without a publication, use a saved planning version only when exactly one covers the requested date. Zero matches or multiple matches return unavailable source evidence with a reason and no selected version or workload rows; unknown R is never zero. Blank date bounds remain open bounds, so two unrestricted versions are ambiguous. This corrects #181 C-1; no newest-version guess is made.
- With a publication pointer, verify and return its immutable publication contract without loading or comparing the saved working revision. Draft saves cannot replace it, turn it into an estimate or block automatic publication. A missing or corrupt pointed-to publication remains an error, never an estimate. This follows the owner's O-2 decision, “no. only published versions”, recorded on main `885df915f1c158b057804fe8092db7151334ef37`.
- Every workload-dependent Roster read/operation refreshes the copy. Publication/republish appears on the next Roster request, including after restart. Before the first publication only, saved planning edits refresh the estimated copy. There is no background push guarantee or synchronous cross-D1 commit claim. Existing durable publication deliveries remain unchanged.
- Unchanged content preserves the local revision and original stored observation. Read the local revision before requesting Deploy; a late response cannot overwrite a newer installed copy. A competing equal-content response can reuse that copy. Source changes during Deploy's multi-read projection return `WORKLOAD_SOURCE_CHANGED`; an out-of-order local response returns `ROSTER_WORKLOAD_CHANGED`.
- Current authority, Contacts/Calendar pins, school/capability/revision checks and existing owner-local guards stay enforced. Roster commit checks its local workload revision/digest atomically with its allocation, receipt and outbox. If its copy changed, only that Roster operation needs refresh/review; Deploy cannot be blocked. Existing resumable runs still reject changed input rather than silently replacing their retained snapshot.
- The read/check-to-commit interval across Deploy and Roster remains. A copy can represent an earlier consistent publication while a later publication finishes (or an earlier saved plan before the first publication); the next Roster read refreshes it. Concurrent Roster adoption is fenced locally. Do not describe the copy as an atomic live read of another database.
- Saved estimates remain labelled on existing screens/exports, never become verified historical weekly R, and cannot automatically publish. Published updates do not rewrite captured weeks, historical entitlement or completed duties.

Deploy no longer queues or checks planning pins when saving, accepting reviewed Contacts facts, or deleting an unpublished version. Publication fencing excludes Roster but still protects Layout/Venues and other consumers. Existing Roster pins remain as recovery evidence, including indefinitely stranded pins; no operation is force-marked committed/released. New Roster pin acquisition is rejected with `WORKLOAD_SNAPSHOT_REQUIRED`, preventing old callers from silently using the removed lock contract.

The additive local schema has one current row per school/date, a 1 MiB payload limit and content digest. No per-read revision churn or unbounded snapshot history is added. Allocation/run history already has its owning recovery rules. Copy verification retains the calculation/publication identity and existing Contacts evidence present in that contract; it does not close F5 or fabricate Contacts observation evidence.

## Visible changes

Deploy saves/publishes/republishes stop displaying the Roster-source-pin refusal. The established frontend and controls are unchanged. After a saved draft edit, Roster keeps the verified publication with no estimated label and automatic publication remains allowed. Estimated labels/restrictions apply only before any publication, as in #181. A source/copy race asks the Roster user to refresh instead of preventing Deploy editing. No v0.9 text patches, frontend modules or allocation-policy changes.

## Verification and limitations

Synthetic data only. Required commands below run with `TZ=Asia/Singapore`; browser commands also use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`, `ROSTER_TEST_CHROMIUM=/usr/bin/chromium`, `LORD_TEST_CHROMIUM=/usr/bin/chromium`.

| Evidence | Command / required result |
| --- | --- |
| Reproduction and corrected boundary | `node tests/v1-product-roster-workload-snapshot.mjs`: actual nine Workers/D1; stranded pins, save/publish/republish, post-publication draft save keeps the verified copy, actual automatic allocation/publication, unchanged reads, receipt replay, preserved historical R, unrelated draft, Layout fence and corrupt-publication rejection. |
| Native browser | `node tests/v1-product-roster-workload-browser.mjs`: built Deploy Versions Save note button through real Core/Worker/D1 before and after publication, then Roster Assign Relief/capacity with no estimated label after a post-publication draft save. |
| Race/restart | `node tests/v1-product-roster-workload-recovery.mjs`: delayed real Deploy response cannot replace newer copy; atomic stale-copy guard rollback; restart over persistent local D1 retains copy identity. The explicit owner-transaction guard probe is supplementary storage evidence, not a hosted test. |
| Existing estimated behavior | `node tests/v1-product-roster-estimated.mjs`: unchanged authority/revision/intent negatives, actual allocation, missing/corrupt publication, estimate labels, automatic-publish denial, no verified R capture and restart receipt replay; source-pin assertion replaced by Roster snapshot identity. |
| Existing owner regressions | `node tests/v1-product-roster-accounting.mjs`, `node tests/v1-product-roster-service.mjs`, `node tests/v1-product-deploy-storage.mjs`, `node tests/v1-product-admission-batch.mjs`. |
| Local additive upgrade/package | `node tests/v1-product-migration-packaging.mjs`; new installs in all integration fixtures; restart uses `migrateSchemas:false`. |
| Canonical build and scope | `npm run build`; `git diff --check`; compare tracked status before/after build and exact claim allowlist. No tracked generated drift permitted. |
| Discovery/full required suites | `node scripts/v1/test.mjs --list`; existing Node runner discovery; `node scripts/v1/test.mjs`; `npm test`; exact-head required full-suite and product CI. |

Initial test corrections: publication test reacquires the existing Deploy editing lease after each mutation; replay asserts Deploy's actual result contract rather than inventing an outer receipt property; synthetic teacher profiles explicitly provide the non-authority fields needed for verified workload; browser selector uses the existing Versions button. Product rules were not weakened to satisfy these tests. Full-suite outcomes and any later failures/omissions are recorded at the PR's exact head.

### O-2 correction evidence (16 November)

The owner decision and changed-review verdict are on main [885df91](https://github.com/helper-gsps/gsis/blob/885df915f1c158b057804fe8092db7151334ef37/docs/coordination/review/v1-pr183-184-claude-review.md). The follow-up starts from reviewed head `9d6db12edf510a34a19516e901e9fb9531b703e4`, stays on the same branch and changes six paths in the existing claim. Refreshed main is `885df915f1c158b057804fe8092db7151334ef37`; its intervening changes since the included main `7198f19` are documentation only. No merge of main is needed to read the decisions.

Actual local commands, Node `v24.22.1`, `TZ=Asia/Singapore` and Chromium at `/usr/bin/chromium`:

```bash
node tests/v1-product-roster-workload-snapshot.mjs
node tests/v1-product-roster-workload-browser.mjs
node tests/v1-product-roster-workload-recovery.mjs
node tests/v1-product-roster-estimated.mjs
node tests/v1-product-roster-estimated-browser.mjs
node tests/v1-product-roster-accounting.mjs
node tests/v1-product-roster-service.mjs
node tests/v1-product-deploy-storage.mjs
node tests/v1-product-admission-batch.mjs
node tests/v1-product-migration-packaging.mjs
npm run build
node scripts/v1/test.mjs --list
node tests/run.cjs --list
git diff --check
```

All ten programs pass against the corrected working tree, as do the canonical build and whitespace check. Before/after tracked diff and status are identical around the build: no tracked build drift. Both runners discover all four workload/estimated programs; totals remain 107 product and 1,208 Node. The initial red tests run before the product edit failed with `estimated` instead of `verified` in both Worker and browser. Logs: `/tmp/gsis-pr183-o2-red.log`, `/tmp/gsis-pr183-o2-browser-red.log`; final passes: `/tmp/gsis-pr183-o2-snapshot.log`, `/tmp/gsis-pr183-o2-browser.log`, `/tmp/gsis-pr183-o2-regressions.log` and its JSON result index, `/tmp/gsis-pr183-o2-build.log`. These local files are supplementary; the commands above and exact-head CI provide reproducible repository evidence.

Two subsequent fixture attempts reached existing publication guards: the future-date restriction, then `DAY_CONFLICT` because the new test omitted the reviewed allocation revision. Corrected the fixture to enable the existing advance-publication setting through the local Admin API for its synthetic future weekday and submit the actual returned `allocationRevision`. No date, authority, revision or automatic-publication product guard changed. Future-weekday fixtures make the test independent of whether CI runs during a school period or weekend. No hosted settings changed.

The newly committed head and its full product/Node/LORD CI results are recorded in PR183 after push. The ten local results above are pre-commit working-tree evidence, not a completed local full-suite run or CI at the old reviewed head. Claude must recheck the new exact head. F-1 latency measurement and F-2 concurrent-copy read retry remain separate follow-ups; this correction does not claim them fixed. The Contacts lifecycle and #184 owner decisions at main `47b2d2c` were read and are not reopened or changed by this PR.

Q01: owner instruction, accepted claim and overlap refresh recorded. Q02: separate Deploy authority/Roster projection, immutable publication/run history. Q03: authority/security invariants preserved; exact-head regression evidence required. Q04: local CAS, retained operations, race/restart evidence; cross-owner interval explicit. Q05: bounded projection, no new dependencies/build patches or claimed skill execution. Q06: final command outcomes/CI in PR; missing checks remain pending. Q07: Claude exact-head review pending. Q08: no deployment authorised.

Changed deployment components, if separately approved: v1 Deploy Worker and v1 Roster Worker with additive Roster migration `0005_workload_snapshot.sql`. Apply the additive schema before starting the new Roster Worker. Treat the two Worker contracts as one release: an older Roster Worker attempting new Deploy pins is explicitly rejected. Rollback both Worker versions together; leave the additive copy table in place and preserve receipts/operations/history. No hosted migration or rollback was performed.

F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT **Not tested**. C-1 Memberships and C-2 immediate pre-deploy Contacts D1 backup remain release gates. No live data/settings, provider send, Drive activation or deployment. Absence confirmation is a separate following task.

Additional #181 review conditions remain: [Claude's review](../../coordination/review/v1-pr181-claude-review.md) at main `7198f193ff6936b8f8b5b84737eb1310a9b429df` requires unambiguous saved-version date ranges before hosted estimated use (C-1) and a baseline export before rollback after multi-room data is saved (C-2). This correction addresses F-1; it does not claim to fix those separate findings. The later review approves the exact #181 head already merged by owner direction.

## C-1 follow-up: ambiguous saved versions

[Bounded claim](../../coordination/tasks/v1-roster-ambiguous-workload.md), branch `codex/v1-roster-ambiguous-workload`, base main `056e003fc5da4c770fa14c80073ec82f296e5b33`. #183 is now merged at its reviewed head; the correction changes only the no-publication candidate selection. The query reads at most two IDs, keeps its source-change rechecks, and never loads/calculates an ambiguous candidate. The existing unavailable-source contract carries the reason into Roster's persisted copy and the built banner. Published workload, authority, revision guards and notification policy are unchanged.

The new built-browser/Worker/D1 test `tests/v1-product-roster-ambiguous-workload.mjs` fails before the correction and passes after it. Unchanged workload-snapshot and estimated/restart regressions pass. Full exact-head CI and Claude review are tracked in the follow-up PR. This closes C-1 in code only after review; hosted runtime UAT remains Not tested. No schema or stored record conversion is introduced.
