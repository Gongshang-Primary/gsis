# roster-quiet-mode: SMC quiet-mode toggle on Assign Relief

- Status: review
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:15
- Branch: claude/roster-quiet-mode
- Base SHA: ba778101a25e7dd0e4838917b4c0cdebb1b7eaf4
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026: toggle on Assign Relief for SMC and Admin that pauses lock-competing background jobs; ends automatically on "Let teachers see", any "Send WhatsApp" action, or 07:15 SGT; after 07:15 it can be switched on for 30 minutes; new absence reports keep processing; WhatsApp sending keeps running.
- Files/domains owned (include generated outputs): roster-update/public/_worker.js, roster-update/public/roster-operations-ui.js (toolbar only), notification-worker/index.js, shared quiet-mode module, generated Worker bundles, new tests. Overlaps PR #3 (same implementer).
- Out of scope: backend Apps Script, absence policy, D1 import.
- Acceptance checks: toggle visible to SMC/Admin only; state in D1 with actor and expiry; notification Worker skips scheduled allocation, peer mail and audit export while active; received reports, notifications, inbox and webhook continue; auto-off on publish/send success and at expiry; audit trail.

## Decisions and changes
- New `shared/roster-quiet-mode.js`: state row `gsis_quiet_mode` and log `gsis_quiet_mode_log` in the shared GSiS D1 (created on first use). Before 07:15 SGT quiet mode ends at 07:15; from 07:15 it lasts 30 minutes. Paused jobs: scheduled allocation, peer mail, audit export. Absence intake, notifications, inbox and webhook keep running.
- `notification-worker/index.js`: scheduled tick and queue consumer skip the paused jobs while quiet mode is active.
- `roster-update/public/_worker.js`: `/api/quiet-mode` (GET status for any signed-in user; POST on/off needs current SMC or Admin from a fresh signed Google read). A successful `publish` or `notifyDaily` ends quiet mode on the server.
- `roster-operations-ui.js`: Assign Relief toolbar toggle (SMC/Admin only) and status note; status refresh at most every 20 s from D1 (no Google call).
- Publisher name is not shown (owner directive on names); the actor is stored in D1 for audit.

## Verification
TZ=Asia/Singapore, Chromium at /tmp/chromium:
- New `tests/roster099a-quiet-mode.mjs` PASS (expiry rules, state, single log entries, no storage).
- New `tests/roster099a-quiet-mode-route.mjs` PASS (sign-in, teacher refused, SMC allowed, invalid action, server-side end after `notifyDaily`, manual off).
- `tests/paid097-jobs-idle.mjs` extended with a quiet pass: PASS (only absence intake, notifications and inbox reach Google; audit lane idle).
- PASS: roster093b-worker-routes, roster093b-intake-gateway, roster098-recovery-worker, pages096-packaged-worker, paid097-bundles, edge094-setup, paid097-backend-gateway, roster093b-peer-ui, roster098a-intake-flush-browser, roster098d-choice-browser, paid097-receipts-browser, roster098j-ui.
- `tests/roster702-operations-ui.cjs`: toolbar expectation updated (new Quiet mode button); still fails at the intake request count fixed by PR #3. Passes once PR #3 is merged.
- Not run: full suite on this head.

## Review

## Deployment
Not deployed. Needs both: Roster Pages upload (`Roster_Frontend_v0.9.9a-quietmode.zip`, SHA-256 0f988b05…2da8) and `gsis-roster-notifications` code (`Roster_Notification_Worker_v0.9.9a-quietmode.txt`, SHA-256 d9db2b9e…f042). Packages delivered to the owner, not stored in git.

## Handoff
Next: Codex reviews; merge PR #3 first or rebase this branch on it.
