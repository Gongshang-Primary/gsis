# Review of PR #58 — R4: smoke D1 activation at t+0 and t+20 minutes

- Reviewer/model: Muse
- Reviewed head: `addcaaa1b1d3f01c09427eb6afcbe20318b23182`
- Base: `78f6a214781b66fbaf889b8f2958993bcddd19c6` (current main at rebase time; origin/main is the same head)
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

Tests-only refresh of the D1 post-activation acceptance harness, rebased onto current main from the original head `8f247febd2e0fe4e2bece6f023dce727fba5786e`. The single smoke program `tests/roster-post-activation-smoke.mjs` (60 lines, new against this base) exercises the actual signed gateway freeze, immutable import and D1 activation, then at t+0 and t+20: profile, Assign Relief, Google Deploy calculations, statistics, saved absences and real automatic allocation. It preserves the stale Contacts authority negative control and the actual scheduled reference refresh, checks the disabled allocator gating, and rejects hidden cron failures. Deploy stays on Google. Fixture credentials/session derivation were adapted to the current GSIS_SECRET transport and the existing Calendar credential, and the isolated cron fixture supplies an idle employment-mail stub (introduced on main by #130). No product files changed.

## Evidence

- **CI run 43324221369 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks`.
- **Local worktree at the exact head, the 1 changed test PASSES** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/roster-post-activation-smoke.mjs`: PASS, exit 0 — `PASS actual frozen import/activation and t+0/t+20 profile, Assign Relief, Google Deploy calculations, statistics, saved absences and real automatic allocation; stale authority negative control and actual cron refresh; no live calls or sends`.
- **Negative control verified end to end**: at minute 20 the harness first asserts the stale-authority fault reproduces — the profile request fails with `BACKEND_ERROR` and the backend detail code `ROSTER_AUTHORITY_STALE` (503, visible in the run log) — then runs the actual isolated cron scheduled event, asserts the `references` job succeeds, asserts no cron stage reports `failure`, and asserts the disabled scheduled allocation passes through the current cycle gate as `skipped`. After the refresh, profile, read, calculations, statistics, saveAbsence and autoAllocate all return 200 at t+20. The stale fault is asserted, not just logged.
- **What the harness actually exercises**: the real `roster-update/public/_worker.js` gateway, the real `edge-roster.js` import/activation path (freeze → import → activate, with the freeze snapshot asserted immutable: one snapshot, one fence call, publication cache rechecked at t+20), the real `notification-worker/index.js` scheduled handler run in a VM context, the real allocator (`autoAllocate` must persist new draft cover and complete an optimisation run with coverage > 0 at each checkpoint), and Google Deploy calculations against a fixture publication (verified quotas, commit match, `units` periods/week). Deploy stays on Google (`mode` `legacy`) at both checkpoints while the roster scopes are `active`. All fixtures are synthetic (4 teachers, fixture contacts, `gsps.edu.sg` test identities); no live calls or sends.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `npm run build`).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main addcaaa1b1d3f01c09427eb6afcbe20318b23182` reports no conflicts (single tree OID, no `changed in both` sections).
- **Scope matches the task record** (`docs/coordination/tasks/roster-post-activation-smoke.md`): the diff against the rebase base is exactly 3 files, 82 insertions, 0 deletions — `CHANGELOG.md` (+4), the task record (+18), and the smoke test (+60). No product code, no generated bundles, no live data, settings or release-branch changes.
- **Secret scan**: no password/token/key material in the PR diff. The only credential-like values are synthetic fixture values in the test itself (`GSIS_SECRET` set to `'synthetic-smoke-secret'.repeat(3)`, fixture session HMAC derived from it, fixture Apps Script URLs) — test-only, not real credentials.

## Findings

- **Fixture credential naming**: the test's synthetic `GSIS_SECRET` value is literally the string `synthetic-smoke-secret` repeated. It is clearly a fixture and never leaves the test process, so this is not a finding against approval — noted only so a future reader does not mistake it for a real credential.
- **No findings against approval.**

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the one changed test plus the canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Tests-only; nothing ships to users. No deployment step. The harness gives a repeatable post-activation acceptance check (freeze, immutable import, activation, t+0/t+20 profile and allocation, stale-authority negative control, cron refresh) for any future D1 activation rehearsal.
