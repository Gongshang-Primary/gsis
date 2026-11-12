# PR #121 review — Muse, exact head 760b00b

- PR: #121, "Model: Codex / Send information-only LSE notices to duty SMC"
- Head reviewed: `760b00b5ca07d6c86aadb2dd2b2a761a7226785b` (branch `codex/roster-lse-notice`, base main `c2b3b09`)
- Verdict: **APPROVED** at the exact head. Owner merges and deploys.
- Reviewer: Muse. Date: 12 November 2026 (Asia/Singapore).
- Task: `docs/coordination/tasks/roster-lse-notice.md` (C8, lane R). Owner ruling (4 Nov): LSE is "for info only and not urgent." Live case (12 Nov): Habibah's LSE at 11:16 for P11, P12 was sent as a generic urgent "Emergency absence" message instead of the dedicated LSE notice.

## What it does

First saved Leave School Early attendance queues the approved information-only `lse_notice` for the verified duty SMC, and an LSE no longer creates a generic emergency/late-absence alert. A durable staff/date notice record prevents a second notice on edits, same-LSE resubmissions, transport replays and re-reporting after cancellation. Other absence types keep their existing urgent behaviour. Disabled template or missing duty SMC is retained as a read-only Daily Notify entry; no job is created. Quiet-hours delivery requires the durable LSE event and still verifies recipient and template.

## CI (verified live)

- Full CI run **43154508789** at the exact head: all 5 jobs pass (Regression shards 1/4, 2/4, 3/4, 4/4 and full-suite).
- PR is a draft, MERGEABLE, base main. No conflicts (`git merge-tree --write-tree --name-only origin/main <head>` returns only the tree, no conflicted files).

## Local verification (worktree wt121 at the exact head)

All with `TZ=Asia/Singapore NODE_NO_WARNINGS=1` and the Playwright Chromium path (`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`) for the browser variables.

- New tests, all PASS:
  - `tests/roster-lse-notice.cjs` — first-save routing, multi-teacher, disabled/no-duty records, dedup, edit/cancel, urgent exclusion; plus Google adapter and legacy intake pipeline checks.
  - `tests/roster-lse-notice-edge.mjs` — native D1 routing, replay, disabled template, quiet-hours proof, fresh duty check, approved static-button contract and exact payload.
  - `tests/roster-lse-notice-browser.cjs` — Daily Notify shows no-duty and disabled LSE outcomes and refreshes them, with no retry action.
- Changed tests, all PASS:
  - `tests/roster702-notification-setup.mjs` — LSE contract checked separately from the immutable October provider snapshot (no fabricated approval there).
  - `tests/roster711-worker-diagnostics.mjs` — activation count 22 to 23.
- Negative control reproduced: `tests/roster-lse-notice.cjs` run against base code (`c2b3b09`) FAILS with exit 1, `AssertionError: 0 !== 1` — the first LSE save creates zero dedicated notices without the change. The test proves the change.
- Canonical build: `npm run build` at the head passes (18 production components), `git diff --exit-code` clean. No diff.
- Codex reports 1054/1054 Node + 40/40 LORD in the full suite. Not independently re-run by Muse; CI is the gate (and CI is green at this head).

## Code checked

- `shared/roster-operations.js`: `lseNotices` (first save only via `p.id` guard and `existingAbsenceIds`; one per staff/date via the `lse-notice:<date>:<staffId>` key and the smcAlerts dedup; recipients from `dutySMC`; reason recorded when disabled or no duty SMC), `lseNoticeCurrent` (job must match the saved absence, key, recipient, creation time and queued status), `absenceAlerts` skips `typeId==='lse'`, `notificationCurrent` expires stale LSE jobs and blocks any emergency-absence job whose absence is now LSE, `dailyNotifyView` exposes `lseNotices`. Both saveAbsence paths (attendance-only and normal) call `lseNotices` before `absenceAlerts`.
- `notification-worker/template-contracts.json`: `lse_notice` contract matches the task spec exactly (gsis_lse_notice_v1, en_GB, UTILITY, id 1130191476390314, fields duty_smc_name / absent_teacher_name / duty_date, body as specified, submissionState APPROVED, static Open Roster button). The bodySha256 `8b0e0026b74883219f90d97f7db02a2bea79951fb5fc204f63f06bbc5390cf3b` was independently verified against the body text.
- `notification-worker/templates.activation.json`: `lse_notice` entry added, `enabled:true`, name and bodySha256 match the contract.
- Activation is server-derived: the edge path sets `ctx.lseNoticeEnabled` from `env.WHATSAPP_ENABLED` and `WHATSAPP_TEMPLATES_JSON` (edge-roster.js); the Google path sets it from the server payload, not the client. The activation flag is excluded from receipt digests, so a caller cannot enable it by replay. The edge test confirms a request-supplied `lseNoticeEnabled:true` does not create a job when the template is disabled.
- Quiet hours: `shared/edge-notification-model.js` bypasses quiet hours only when `lseNoticeCurrent` proves the saved event, recipient and creation identity; a forged job key is rejected with "LSE notice no longer matches the saved report."
- Daily Notify UI (`roster-operations-ui.js`): renders a read-only "Leave School Early notices" section (name + reason, no retry button); the view refresh key includes `lseNotices`.
- Generated copies (notification/operations Worker bundles and txt, edge-roster-domain.js, roster-operations-model.js, Deploy/Roster_Backend_v0.9.9.gs, backend/Code.gs) mirror the shared change; the canonical build regenerates them with no diff.
- D1 parity: `docs/roster/d1-parity.json` and `D1_PARITY.md` — 272 rows, identical after stripping handler references and source line numbers. Only line-number references shifted (+19 lines from the new code). No operation, outcome or missing-handler entry changed.
- Scope: matches the task record and the owner's rulings. The only files outside the narrow LSE wiring are the generated bundles/parity references and the two test-expectation updates (roster702, roster711), which are required by the new contract and activation count.
- Secrets: no new secret reads and no secret values in the diff. The only secret-like matches are pre-existing `rosterOperationsAttachDayToken_` references inside the parity inventory (line-number shifts only). No new transport credential is introduced.
- Live safety: no live config, data, provider or deployment change in the diff. The PR body and task file give correct owner-only deploy instructions (merge only the `lse_notice` activation entry into the deployed `WHATSAPP_TEMPLATES_JSON`; deploy the notification/operations Workers with Roster Pages together; Google stays frozen). Not tested: live D1/Google records, real WhatsApp delivery, deployed configuration, production browser sessions.

## Findings

None blocking. Two notes, both acceptable:

1. The LSE notice is queued on first save, but delivery still depends on the deployed `WHATSAPP_TEMPLATES_JSON` containing the enabled `lse_notice` entry (the owner merges only that entry at deploy time, per the task file). Until the owner deploys, an LSE save records the notice as queued/not-sent in Daily Notify and sends nothing. This is the intended deploy-time gate, not a defect.
2. The task record Status line still reads "in progress" in the PR. The reviewer updates it to approved on main after this review (separate docs-only commit, per the handover).

## Release notes

C8 LSE notice wiring. First saved Leave School Early reports queue the approved information-only LSE notice for the verified duty SMC and skip generic emergency alerts. Staff/date identity prevents duplicate notices on edits, retries, resubmissions and re-reporting. Disabled or missing-duty outcomes remain visible in Daily Notify. Quiet-hour delivery requires the durable LSE event and still verifies the recipient and template. No live configuration, messages or deployment. See `docs/coordination/tasks/roster-lse-notice.md`.
