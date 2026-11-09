# Review: PR #106 — Release v0.9.9p for Drive daily outputs

Model: Muse. Reviewer: Muse. Verdict: **APPROVE** at exact source head `0bb7033a9b2bdd953ddb5434660e2a391d960251` and exact bundle head `21bef884145592cf39f98280e7df3072b7c08207`.

## What this PR is

A release build, not a product change. One commit on branch `codex/release-v0.9.9p`, from main `1bddd5f`: `package.json` `gsisBuildLabel` `0.9.9o` → `0.9.9p`, 16 frontend `index.html` label strings `v0.9.9o` → `v0.9.9p`, and the release plan `docs/plans/2026-11-08-v0.9.9p.md`. No handwritten product logic or tests were edited (18 files, +116/−61). The owner-deployable bundle is the separate branch `deploy/2026-11-08-v0.9.9p` at `21bef88`. The owner merges this PR and deploys from the bundle branch; nothing in this review deploys anything.

## Evidence

- **CI**: run 42485689449 at the exact head `0bb7033` — completed, success, all 5 jobs (verified via the check-runs API and the run API).
- **Local worktree** (wt106, detached at the exact head): `TZ=Asia/Singapore npm run build` PASS, 18 production components, `git status` empty — **no diff** at the final head. `git diff --check` clean. Merge-tree vs main `1bddd5f` clean (tree `617db92c…`).
- **Changed tests**: none — the PR changes no test files. The full suite is covered by the green CI run at this head. Codex's local full-suite claim (1041/1041 Node, 40/40 LORD at the head) was **not** independently re-run by the reviewer; CI is the gate.
- **Merge inventory**: verified independently — `git log d667c11..0bb7033 --merges` returns exactly 15 merge commits: 11 PR merges (#94, #95, #96, #97, #98, #99, #100, #101, #102, #104, #105) and 4 branch-sync merges (09ca307, 1527407, 47ff233, 4da2fa8). The full SHA list in the label commit, plan and DEPLOY_STEPS.md matches. **#103 is excluded**: no #103 merge appears in the range, and the label commit states it explicitly. Nothing is omitted.
- **Bundle provenance**: `deploy-bundle/LABEL.txt` = `0.9.9p`; `COMMIT.txt` = `0bb7033a9b2bdd953ddb5434660e2a391d960251` (the reviewed source head). 21 files under `deploy-bundle/`. `SHA256SUMS.txt` verifies **20/20 OK** (it covers every delivered file except itself); its own SHA-256 `78d59913…` matches the value stated in the PR body exactly.
- **Bundle parity** (reviewer-measured, SHA-256 vs the canonical build in wt106): all 7 text artifacts match byte-for-byte — `1_Roster_Backend.gs`, `2_Deploy_Backend.gs`, `4_gsis-roster-notifications_worker.js`, `5_gsis-operations_worker.js`, `REQUIRED_Contacts_Backend.gs`, `REQUIRED_Calendar_Backend.gs`, `REQUIRED_Calendar_Job_Worker.js`. The emergency helper is byte-identical to the o bundle. All 9 frontend ZIPs pass CRC; the Roster frontend ZIP carries the `v0.9.9p` label.
- **Drive fix present**: the bundle's `1_Roster_Backend.gs` line 12104 carries the exact #100 fix (`Utilities.newBlob(Utilities.base64Decode(p.data), 'application/x-gzip')`); 8 `application/x-gzip` occurrences, matching main. The o bundle lacks it (built from d667c11). This is a code comparison, not live verification.
- **Scope**: the `7_Venues_Backend.gs` omission is correct per the handover (only if changed; the Venues backend is unchanged since o). The `REQUIRED_` classification for Contacts/Calendar/LORD product updates is stated in both the plan and DEPLOY_STEPS.md.
- **Secret scan**: the diff contains no secret values; `secret`/`token` grep hits are only prose ("no tokens or secrets need to be pasted here") and merge-table rows.

## Findings

No blocking findings. The PR body and DEPLOY_STEPS.md are honest about limits, and the reviewer verified the material ones:

- The retained LORD failure evidence is recorded, not hidden: the first local `npm test` stopped at `gsis098h-background-ui` because `LORD_TEST_CHROMIUM` was unset; the complete rerun with both browser variables passed with no code or assertion changes. The reviewer did not re-run the full suite locally; CI green at the exact head is the gate.
- No separate full-suite run at the artifact-only bundle head `21bef88` is claimed; the bundle commit adds only delivery artifacts to the tested source. The reviewer confirmed parity by SHA-256 instead.
- DEPLOY_STEPS.md states the release goal as an owner post-deploy check (excel + log rows `verified` with a nonempty `drive_file_id`), states **full backups are NOT fixed** (missing R2 part, 15-minute lease), requires private GSIS_SECRET alignment for Contacts/Calendar with `CALENDAR_SESSION_SECRET` unchanged, and gives deploy order, crons, checks and rollback to the captured o bundle (`deploy/2026-11-06-v0.9.9o`, `ec7a1f4`).

## Release notes for the owner

- Merging this PR puts label `0.9.9p` on main. Deploying is a separate owner step from `deploy/2026-11-08-v0.9.9p` — verify `sha256sum -c SHA256SUMS.txt` first, then follow `deploy-bundle/DEPLOY_STEPS.md`.
- After deploy, enable daily outputs once and require an excel row and a log row in `gsis_backup_ledger` with status `verified` and a nonempty `drive_file_id`. That is the only evidence that #100 worked live; nothing in this review claims it yet.
- Contacts and Calendar need the same GSIS_SECRET on both ends of each pair before switching the new code; verify Contacts entry after publishing the new Apps Script version (the owner attributes the earlier 401 to Apps Script deployment lag).
- Rollback returns to o, which still lacks #100 — daily Drive outputs stay unverified until a working code version is deployed.
