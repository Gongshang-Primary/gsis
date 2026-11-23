# Review: PR #290 — Calculate relief estimates from saved Deploy plans (Muse, exact head 8fcf8f71)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive: Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `8fcf8f71b197f87328ad247cb14430a27e1e8881`.**

## PR

- #290, `codex/v1-deploy-planning-relief`, "Model: Codex / Calculate relief estimates from saved Deploy plans". Reviewer named: Muse at exact head `8fcf8f71`. Merger: GPT.
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `main`; merge-base `5fd9f79d` (the task claim commit, also origin/main at review).
- Implements DEP-23-002/003: Ledger shows Planning R (estimate) beside the accepted-evidence R; Stats averages planning groups when every member has a numeric estimate. The worker replays the existing formula on saved version inputs and binds the result to that revision. The UI withholds a stale estimate while edits are pending or the loaded revision differs.

## CI at the exact head

- "Isolated v1 product", run 45165748701, head `8fcf8f71`, event pull_request. Attempt 1 completed **failure** at 20:00 SGT on exactly one program, `v1-product-deploy-planning-eligibility-browser.mjs` (waitForFunction 7000ms timeout, no failed assertion — the known flake signature; #290 does not touch that file and its own new test passed 5/5). Attempt 2 (rerun of the failed job) completed **success** at 20:27:54 SGT (25m54s). The new browser test's five groups are verified locally below.
- "Verify GSiS queue changes", run 45165702666, head `8fcf8f71`, completed **success**: scope and full-suite pass, regression shards skipped (v1-only change under the #280 scope rule). No waiver needed: this is a `codex/**` branch, so Node/LORD CI ran.

## Scope

Diff against the merge-base (`5fd9f79d`): **6 files, 510 insertions, 3 deletions.** The file list matches the task record's stated scope.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-deploy-planning-relief.md` | +26/−1: diagnosis, implementation and verification sections |
| `scripts/v1/build-web.mjs` | +11: inject the Planning R column into Ledger and the Planning R (average) row into Stats |
| `tests/v1-product-deploy-planning-relief-browser.mjs` | +367, new: five-group browser test |
| `v1/services/deploy/planning-relief.mjs` | +38, new: read-only replay of the shared workload and relief engines over the saved plan |
| `v1/services/deploy/service.mjs` | +3: wire the projection into bootstrap; exclude it from flattening and write intent |
| `v1/web/shared/deploy-relief-ui.js` | +57/−2: expose `window.GSISV1PlanningRelief`, withhold stale estimates, explain unavailable ones |

- `git merge-tree --write-tree --name-only origin/main 8fcf8f71` returns a clean tree (`7deccabc…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values (the only `token` hit is a pre-existing code literal in `build-web.mjs`).

## Change, read (not trusted)

- The new module is a read-only projection: it builds the planning view (with the existing planning-eligibility and subject-alias handling), runs the shared `Workload.analyse` and `Relief.analyse` engines over the saved version's teachers, assignments, loads, offload and relief settings, and returns `{versionId, revision, reference, teachers: [{teacherId, R, reason}]}`. It runs in bootstrap before Contacts hydration, so the estimate uses saved planning choices only and never the accepted-evidence inputs.
- The response binds the estimate to the saved version and revision. The write boundary holds in source: `flatten` skips `planningReliefResults` (it is never written into stored rows) and `cleanIntent` deletes it from incoming write intent (a client cannot set it). Publication and Roster callers continue to use the existing accepted-evidence calculation.
- Ledger adds a `Planning R (estimate)` column next to R; Stats adds a `Planning R (average)` row under the existing complete-category rule (average only when every member has a numeric estimate; numeric zero counts). The accepted R column is relabelled in the diagnostics title as "accepted-evidence" so the two remain independently readable.
- The UI withholds the estimate and says why: queued edits show "Save changes to update Planning R."; a version/revision mismatch or stale accepted result shows "Refresh to load Planning R for the saved version." Unavailable estimates list per-teacher reasons. The estimate never grants authority: Contacts acceptance, publication and Roster entitlement keep their existing contracts.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt290-review` at `8fcf8f71`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234 (`chrome-linux64/chrome`).

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `node tests/v1-product-deploy-planning-relief-browser.mjs`: exit 0 — **5/5 groups pass** (separate saved-version Planning R numeric, including zero, without accepted EO; Ledger and Stats distinguish numeric planning estimates from unavailable accepted R; missing workload withholds estimates and version/revision mismatches cannot reuse another result; queued workload changes withhold old estimates until native Save and reload recompute the saved revision; explicit Contacts acceptance alone changes accepted R, estimates never grant or write authority). 28.067s.
- `node tests/v1-product-deploy-relief-quota-browser.mjs`: exit 0.
- `node tests/v1-product-deploy-workload-planning-browser.mjs`: exit 0 — 4/4 groups pass.
- `node tests/v1-product-deploy-workload-sci-alias.mjs`: exit 0.
- `node tests/v1-product-roster-workload-snapshot.mjs`: exit 0.
- `npm run build`: exit 0. `git diff --exit-code`: zero tracked drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0. The built output (`deliverables/v1/product/web/assets/deploy/app.js`) contains both "Planning R (estimate)" and "Planning R (average)"; `calculatePlanningRelief` is bundled only in the Deploy worker (`deliverables/v1/product/deploy/worker.mjs`).
- The task record's claim commit checks out: `5fd9f79d` is the claim commit (and this diff's merge-base) and origin/main at review.

## Findings

None.

## Quality gates

- Q01 (scope): six files inside the task record's stated scope; DEP-23-002/003 as claimed. Pass.
- Q02: one read-only projection per saved version/revision; the write boundary (flatten skip, cleanIntent delete) keeps the accepted-evidence R the single authority. Pass.
- Q03: the new test covers numeric and zero estimates, unavailable inputs, version/revision mismatch guards, the pending-edit withhold with native Save/reload, and the accepted-R independence after explicit Contacts acceptance. Pass.
- Q04: revision binding withholds stale estimates; the mismatch and save/reload paths are tested. Pass.
- Q05: bounded change reusing the existing engines; no new dependency. Pass.
- Q06: product CI green at the exact head on attempt 2 (attempt 1 failed only on the known eligibility-browser timing flake in a file this PR does not touch); queue CI green. Pass.
- Q07: PR carries Model: Codex attribution, exact head, inventory, evidence, limitations (hosted UAT pending) and rollback (remove the preview response and its display; no migration). Pass.
- Q08: no deployment, migration or live-data effect. Hosted signed-in UAT remains pending, as the task record states. Pass.
- F5 remains OPEN. This PR is a Deploy read-only projection; it does not close it.

## Release notes

- DEP-23-002/003 implemented: Ledger and Stats now show Planning R estimates from the saved Deploy plan beside the accepted-evidence R, withheld while edits are pending or the revision differs.
- GPT to merge. No deployment authorised.
