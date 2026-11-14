# Reviewer handover: Muse reviews, Codex builds (from 6 Nov 2026)

Owner instruction (6 Nov): "make plans for Muse to take over as reviewer and codex to continue coding grunt as your tokens run out".
**Superseded 14 Nov:** owner "take over coordinator ship from muse for v0.9 lanes. retire muse completely". Claude coordinates v0.9 and reviews every Codex PR; Muse is retired. The checklist (§2), merge (§3) and release (§4) procedures below still apply, with Claude as reviewer and release builder. Earlier text kept as history: Coordinator: Muse (owner 13 Nov). Muse coordinates and reviews Codex PRs; Codex reviews Muse PRs; Claude reviews only when the owner names Claude for a task. This file is the rulebook. Owner merges and deploys, always.

## 1. Roles
| Role | Who | Notes |
|---|---|---|
| Builder (default) | **Codex** | Follows the queue in LANES.md. One PR per task; claim first. |
| Reviewer | **Muse** (Claude when available) | Reviews every Codex PR at its exact head. |
| Reviewer of Muse's own PRs | **Codex** | Two-model rule: nobody reviews or merges their own work. Muse's builder tasks (Venues, Stapler teacher search, edge queue) are reviewed by Codex. |
| Merge / deploy / settings | **Owner** | Reviewer says "approve"; owner says "merge N". The reviewer may perform the merge on the owner's explicit word. |
| Coordinator duties (task records, LANES, release builds, prompts) | **Muse** (from 13 Nov) | Docs-only commits to main are allowed for task records, reviews and release notes. |

**Owner exception (12 Nov), closed 13 Nov:** Claude reviewed `roster-d1-full-backup-fix` (#127) and `roster-d1-employment-mail-dispatch` (#130); both merged. Muse reviews all Codex PRs again.

## 2. Review checklist (every PR, exact head)
1. Record the exact head SHA; review nothing else. If the head moves, re-review.
2. CI: the **full-suite** check is green for a complete run at that SHA. A cancelled duplicate run shows as "failure" — check run IDs (`gh api repos/helper-gsps/gsis/commits/<sha>/check-runs`) and rely on a complete green run.
3. Local: in a separate worktree at the head, run every changed/new test file with `TZ=Asia/Singapore NODE_NO_WARNINGS=1` and `ROSTER_TEST_CHROMIUM=/opt/pw-browsers/chromium-*/chrome-linux64/chrome` for browser tests; then `TZ=Asia/Singapore npm run build` and require **no diff** (generated bundles current).
4. Scope: matches the task file and every owner ruling in it; no files outside the lane without the coordinator's OK; no secrets, tokens, private links or private school records.
5. Live safety (Roster runs on D1): saves must never fail because of reporting/derived code; manual, peer, protected, Stapler-imported, published and started relief are never moved; latest **confirmed** Stapler version is the timetable; alerts to the right audience (duty SMC vs Admins only).
6. Compatibility with live data when the change reads stored records (ask the owner for a read-only check if you lack D1 access).
7. Conflicts with main: `git merge-tree --write-tree --name-only origin/main <head>`.
8. Write the review to `docs/coordination/review/pr<N>-<reviewer>-review.md`: verdict (approve / changes requested), evidence (CI run ID, local counts), findings, release notes for the owner. Never claim approval, tests or deployment without evidence.

## 3. Merge procedure (on the owner's "merge N")
- Clean: `gh api -X PUT repos/helper-gsps/gsis/pulls/N/merge -f merge_method=merge -f sha=<reviewed head>` (mark ready first if draft).
- Conflicts only in CHANGELOG.md and generated files (Worker bundles `notification-worker/dashboard-worker.*`, `operations-worker/dashboard-worker.*`, `*_Backend_v0.9.9.gs`, `backend/Code.gs`): merge locally in a worktree on origin/main, keep **both** CHANGELOG entries, take either side of the generated files, run the canonical build, run the PR's changed tests, then push the merge commit to main with message "Merge pull request #N from …" naming the reviewed head and the conflict resolution. Any conflict in hand-written source: stop, send the PR back to its builder.
- Afterwards set the task file `Status:` to "merged (#N at <head> as <merge sha>)".

## 4. Release procedure (coordinator-owned)
1. `package.json` `gsisBuildLabel` → next letter; `TZ=Asia/Singapore python3 scripts/build-release.py`; commit "Release label v0.9.9X (…)".
2. Full suite: `ROSTER_TEST_CHROMIUM=… TZ=Asia/Singapore NODE_NO_WARNINGS=1 npm test` → must pass (timing test `roster-backup-throughput.mjs` may flake under load; re-run alone).
3. Bundle branch `deploy/<YYYY-MM-DD>-v0.9.9X` with `deploy-bundle/`: 1_Roster_Backend.gs (Roster_Backend_v0.9.9.gs), 2_Deploy_Backend.gs, 3_Roster_Frontend.zip, 4_gsis-roster-notifications_worker.js (notification-worker/dashboard-worker.mjs), 5_gsis-operations_worker.js, 6_Deploy_Frontend.zip, 7_Venues_Backend.gs only if changed, emergency/EdgeAuthorityTools.gs, optional-label-only/*, COMMIT.txt, LABEL.txt, SHA256SUMS.txt, DEPLOY_STEPS.md.
4. DEPLOY_STEPS.md: what changed, deploy order, manual steps (crons, settings), checks, rollback. Record in `docs/plans/<date>-v0.9.9X.md`.

## 5. State at handover — see also `plans/2026-11-handover-pr-plan.md` (PR-by-PR plan, 6 Nov afternoon; supersedes the queues below)

### Earlier snapshot (6 Nov ~11:45)
- **Live**: v0.9.9n on D1 (fresh start 5 Nov 23:10). Drive backups/daily outputs **disabled** (writes failed with ROSTER_BRIDGE_ERROR; #87 records the real reason).
- **Main, not deployed**: #84 ad hoc priority, #87 Drive failure reasons + Admin-only system alerts, #91 always-confirmed Stapler → **release o**. Approved, awaiting merge: #90 (Contacts publish retry; then close #83), #92 (Calendar stale save), #93 (day export, no status tags).
- **After deploying o**: SMC confirm 10 and 12 Nov Stapler drafts (rev 2) if intended; enable daily outputs once, read the recorded reason, fix or keep on.
- **Owner/ops items**: `gsis_system_alert_v1` pending Meta approval (id 1846305353057485; keep `enabled:false` until approved); 5 WhatsApp routes ready for buttons (`docs/reference/whatsapp-v2-buttons-status.md`); 5 Nov relief counts to add to opening balances; Venues `VENUES_ROSTER_WORKER_URL` + Pages `VENUES_BRIDGE_SECRET` check; close #88 (superseded) and #83 (after #90).
- **Codex queue** (LANES.md): old backlog (rebase or close 1-4 Nov PRs) → capture contracts for contact_review/relief_unacknowledged/relief_urgent_smc v2 → LSE notice wiring → live updates (idle backoff, then push) → allocation rules rework (rules book first, shadow mode).
- **Muse builder queue**: Venues D1 route verification → Stapler teacher search → edge queue design note → Deploy P1.

## 5b. Handback to Muse (13 Nov)
- Merged, not deployed: #127 full D1 backup fix (ccdcba3), #130 employment mail on D1 (c9aec8b). Muse: include both in the next release; DEPLOY_STEPS must say (1) wait for one verified full backup (check manifest `timings`, `missingCacheParts`) and one verified restore test before the owner enables `system_alert` (APPROVED by Meta, id 1846305353057485); (2) the first employment drain cancels the 12 old emails (6-12 Nov) and sends only today's.
- Open live issues for Muse to track with the owner: SMC duty roster empty, so `TIMETABLE_RECONCILE_BLOCKED` and inbox duty alerts reach nobody (69 smcAlerts `no-duty-recipient` since 6 Nov); Excel export timeouts (13 on 12 Nov) and clash refusals; 1 peer email to Fadzriel (13 Nov) uncertain.
- Relief instructions are info only (owner 11 Nov; `roster-relief-instructions-info-only`, merged #115 per Codex). 8 stuck drafts were withdrawn by hand on 11 Nov.
- v1 track: ChatGPT coordinates; #125 (T1B) merged 16eb139. T1C must create a Contacts reader per request (128-stream cap).

## 6. Reference
- D1 `gsis-jobs` 0e8359f6-d86a-4a8d-9fcb-59aa6819fcf2. Drive home base 1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z; Daily Relief 1SY-pUUcQWKB9auDFAbSzYhZcy90Ei4vN; Backups 1J6Ac1Cb-yj5kX3WaTAKIpZ3Riqlltnk9; Allocation Audit 1imeTP73ZowWLIAWZPP_fsh7_8SbRKqZI; Releases 1aY_cKNr0MzW3Pl-LActB09AR2INQsT7D.
- WhatsApp: Gongshang Primary account 971916692625997, business 1367896852088548; message catalogue `docs/reference/whatsapp-messages.html`.
- Owner rules: owner states intent, reviewer/builder specify to production class (WORKFLOW.md); keep records (no pruning); never paste secrets; code only on authorisation ("codex work"); deployments and timings are the owner's.
