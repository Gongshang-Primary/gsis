# Review of PR #38 — Roster: exclude inactive staff from new relief and delivery; preserve history

- Reviewer/model: Muse
- Reviewed head: `d23672c3e81e17438c47f1dfdc61329c83b3b64c`
- Base (merge-base): `f7014a14b0bdcd84b6e35c4665a49d241e0981c7`
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE WITH FINDINGS**

## What the PR does

Inactive Contacts staff are excluded from new relief allocation, ad hoc selection, peer (mutual) eligibility and final WhatsApp/email delivery. The gate is a single new rule, `activeReliefCandidate(person)` (`person.active===true && reliefCandidateEligible(person)`), applied in `shared/roster-allocation.js` (`eligibility`, `ranked`, `manualRanks`, `opportunities`, `solveCoverage`) and in `shared/roster-operations.js` (`candidates`, `mutualChoice`, `saveAdhoc`, `saveAbsence`, `queue`, daily-employment settings/queue, name bridges, shared-subject reconciliation, directory and picker views, and the ad hoc UI). Ad hoc activation no longer overrides inactive status: the old `p.active || adhoc` carve-outs are removed everywhere in this diff.

Preserved, per the task record's 6 November scope refresh (eligibility and delivery only; the old option 1B automatic removal/refill stays held): inactive teachers' saved duties and history stay. In the solver, existing assignments by now-inactive staff are kept fixed (`solveCoverage` treats their staff IDs as excluded, so they are neither re-solved nor in the replaceable pool). In reconcile, a retained duty by an inactive teacher is flagged for review (`workloadReview: 'Teacher is inactive in Contacts. Review this retained duty.'`, `reviewRequired: true`) and not removed. Historical names are shown with a ` (inactive)` suffix (`staffName`) without rewriting stored records. Daily employment settings can remove a retained ineligible recipient (settings UI now shows a "Remove this saved recipient" action for inactive saved recipients). Google retained employment mail rechecks active status at the provider boundary and blocks (not sends) an inactive recipient.

This is a rebase of the 1 November feature (old head `6d2a835`) onto main `f7014a1`. The PR body states the historical main-merge/refresh commits were consolidated with an exact original-tree equality check; the archive ref for the old head is local to Codex and not on origin, so that consolidation claim was not independently verified here. The rebase result itself is verified below.

## Evidence

- **CI run 43314191067 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks 38`. PR is MERGEABLE.
- **Local worktree at the exact head, all 22 changed/new tests PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/roster-inactive-delivery.cjs` (new): PASS — Google directory and final notification/email inactive guards; retained employment mail blocks an inactive recipient before the provider.
  - `tests/roster-inactive-delivery.mjs` (new): PASS — D1 edge delivery: inactive recipients are not queued/delivered.
  - `tests/roster-inactive-eligibility.cjs` (new): PASS — inactive teachers disappear from all relief and absence choices including activated external relief; inactive writes and notifications are rejected before changing records; historical absence, duty export and notification records label inactivity without rewriting history; inactive co-teachers cannot be auto-assigned by shared-subject reconciliation; fresh daily reports count active dated ad hoc engagements and preserve captured reports.
  - `tests/roster-inactive-ui.cjs` (new): PASS — Chromium ad hoc picker and recipient UI: inactive staff cannot be selected, saved inactive recipients are flagged for removal.
  - `tests/roster-reoptimise-priority-parity.mjs` (changed): PASS.
  - `tests/roster-reoptimise-priority.cjs` (changed): PASS.
  - `tests/roster090-mutual-grid-browser.cjs` (changed): PASS.
  - `tests/roster090-mutual-timetable.cjs` (changed): PASS.
  - `tests/roster098f-selection.cjs` (changed): PASS.
  - `tests/roster098f-workload.cjs` (changed): PASS.
  - `tests/roster098l-allocation-modes-ui.cjs` (changed): PASS.
  - `tests/roster099a-sre-daily-priority.cjs` (changed): PASS.
  - `tests/roster701-integrity-review.cjs` (changed): PASS.
  - `tests/roster702-backend.cjs` (changed): PASS.
  - `tests/roster702-mutual-candidates.cjs` (changed): PASS.
  - `tests/roster706-domain.cjs` (changed): PASS.
  - `tests/roster710-adhoc-ui.cjs` (changed): PASS.
  - `tests/roster710-mail.cjs` (changed): PASS.
  - `tests/roster711-settings-dom.cjs` (changed): PASS.
  - `tests/roster712-shared-subject.cjs` (changed): PASS.
  - `tests/roster713-manual-ranking.cjs` (changed): PASS.
  - `tests/stapler095a-staff-eligibility.cjs` (changed): PASS.
- **Negative control reproduced**: the two new model tests copied into a temp worktree on current origin/main FAIL, exit 1 — `tests/roster-inactive-eligibility.cjs` fails with `AssertionError: The expression evaluated to a falsy value` (inactive 'bob' still appears in candidates without the change), and `tests/roster-inactive-delivery.cjs` fails with `AssertionError: an ad hoc engagement cannot restore an inactive Contacts person`. The tests detect the change.
- **D1 parity guard**: `node tests/roster-d1-parity-guard.cjs` exit 0 — "272 operations/views/routes/writers". `node tests/roster-d1-parity.mjs` exit 0, 272 operations. The `docs/roster/d1-parity.json` and `D1_PARITY.md` edits change source/handler line references only; classifications and outcomes are unchanged.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `TZ=Asia/Singapore npm run build`). The generated bundles (`Roster_Backend_v0.9.9.gs`, `Deploy_Backend_v0.9.9.gs`, both Worker bundles, `edge-roster-domain.js`, `roster-update/public/roster-allocation.js`, `roster-operations-model.js`) are regenerated, not hand-edited.
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main d23672c3e81e17438c47f1dfdc61329c83b3b64c` reports no conflicts. (Main has moved past the rebase base `f7014a1` with v1/docs commits; the merge-tree was run against current origin/main.)
- **Secret scan**: no real secret/token/password/key material in the merge-base diff. The only match is a dummy test-only value, `ROSTER_SERVICE_SECRET:'s'.repeat(32)`, in the new `tests/roster-inactive-delivery.mjs:37` test env. The remaining matches are `rosterOperationsAttachDayToken_` line references in `D1_PARITY.md`.
- **Scope matches the task record** (`docs/coordination/tasks/roster-inactive-teacher.md`, 6 November scope refresh): hand-written changes are only the active-gating in `shared/roster-allocation.js`, `shared/roster-operations.js`, `shared/edge-notification-model.js`, `backend/RosterOperations.gs`, `backend/Code.gs` (generated copy of the operations module), `roster-update/public/edge-notifications.js`, `edge-roster.js`, `roster-operations-model.js` (generated copy), `roster-operations-ui.js`, `roster-settings-ui.js`, plus the 22 tests, the parity reference updates, and the two task records. No allocation policy, quota, ranking, authority, activation, deployment or live-data changes. The `docs/coordination/tasks/backlog-pr-rebase.md` change in this diff is the rebase checkpoint section for #38 itself; it belongs. No v1 files are touched.

## Findings

- **No CHANGELOG.md entry for this feature.** Neither this diff nor current main's CHANGELOG has a dedicated entry for the inactive-staff change (checked both; the only "inactive" mention in the CHANGELOG is an unrelated #41 peer-mail-health line). Every recent feature PR adds one. Add a CHANGELOG entry for the inactive-staff gating before or at merge; it is a docs-only addition and does not change the code verdict.
- **Minor, cosmetic:** in `eligibility()` (`shared/roster-allocation.js`), an inactive teacher now collects two reasons — 'Teacher is inactive in Contacts.' and then 'No active verified timetable.' from the unchanged `!t.person.active` check. Harmless, but the second reason is redundant for inactive teachers.
- **Noted, not a finding:** the task record still names Claude as reviewer (1 November line, and the 6 November refresh says "Claude exact-head review required"). This review is by Muse under the 13 November coordinator return; the PR body already names Muse. The task record's reviewer line is stale.
- **Not independently verified:** the PR body's claim that the pre-rebase consolidation tree exactly matched the original tree. The archive ref is local to Codex, not on origin. The rebased result is fully verified by the evidence above, so this does not affect the verdict.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the 22 changed/new tests plus both parity checks and the canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head. Codex's additional 8 compatibility programs (relief-instructions info-only, employment-mail drain, LSE notice, parity) were not re-run locally by this review; they are covered by the green full CI at the exact head.

## Release notes

Ships in the next release after v0.9.9v. Deploy the updated Roster Pages (`roster-operations-ui.js`, `roster-settings-ui.js`, `edge-roster.js`, `edge-notifications.js`), the generated `roster-operations-model.js`, `roster-allocation.js` and `edge-roster-domain.js`, the regenerated Google backends, and the canonical Notification/Operations Worker bundles. Google stays frozen unless the owner decides otherwise. After deployment, verify: an inactive teacher cannot be picked for new relief or ad hoc, peer requests to an inactive teacher are rejected, final WhatsApp/email delivery skips inactive recipients, and a retained duty by a teacher who later becomes inactive stays visible with the review flag and the ` (inactive)` label.
