# roster-d1-employment-mail-dispatch: Daily Employment Update emails send on D1

- Status: investigating (Model: Codex)
- Owner/model: Codex
- Reviewer/model: **Claude** (owner exception 12 Nov: "owner approve to skip muse for just these 2 tasks and claude to review. muse to sit and skip these 2 only"). Muse does not review this task.
- Last updated (Asia/Singapore): 2026-11-13
- Branch: codex/roster-d1-employment-mail-dispatch
- Base SHA: 61c628f13ff9edbacabd9a7f2044bb25b7594915 (verified current main before claim).
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: owner, 12 Nov ("write tasks that fix these errors"). The scheduled Daily Employment Update is queued every school morning but never sent on D1. Make it send, with the same claim/settle safety as today. Deal with the backlog once.

## Evidence (Claude, read-only D1, 12 Nov ~19:40 SGT)
- `dailyEmploymentMail`: 12 rows `queued`, none sent since the move to D1. 3 recipients per day (Sumiryati ×2 addresses, owner) for 6, 10, 11 and 12 Nov, `requestedBy: scheduled`.
- `gsis_job_health` `employment-mail`: last run 3 Nov, `last_success_at` null.
- Code reading (to confirm):
  - dispatch runs only through `ctx.waitUntil(dispatchDailyEmploymentReports(env))` after a Pages request returns `dailyEmploymentMailQueued` (roster-update/public/_worker.js:344). Rows queued by the **scheduled** path never trigger it, and no cron drains `queued` rows.
  - `dispatchEdgeEmploymentMail` sends through `legacyServiceBackend` (_worker.js:595). Check whether that still works while Google is frozen (`ROSTER_EDGE_AUTHORITY=d1`) or is refused.

## Required behaviour
1. **Scheduled drain.** The notification worker's existing cron drains `queued` employment mail (bounded per tick), using the existing claim → send → settle flow (`edge-notifications.js:157-172`), and records `employment-mail` in `gsis_job_health` on every run.
2. **Send path that works on D1.** If the send goes through the Google adapter, confirm it is allowed as a mail-only service call under the D1 fence and works. If it is refused, use the same mail path the working peer email uses (peer-mail sent on 11 Nov). Do not add a new provider.
3. **Content from D1.** The email body is built from the D1 `dailyEmploymentSnapshots` for that date, as today. If the snapshot is missing, settle the row `failed` with a plain reason. No blank email.
4. **Backlog, once.** On first run after deploy, rows `queued` for a date **before today** are settled `cancelled` with reason `STALE_BACKLOG: date passed before D1 dispatch was fixed` and not sent. Today's row, if any, sends. Keep all rows. (Owner may instead want the old ones sent; if the owner says so before release, send them oldest first, one per recipient per date.)
5. **No duplicates.** A recipient gets at most one email per date and key, even if both the Pages `waitUntil` path and the cron fire. `sending` past 10 minutes goes `uncertain` as today, and is never auto-resent.
6. **Health.** System Health shows "Employment email: last sent <time>" and any failed or uncertain row.

## Files/domains owned
notification-worker/index.js (cron drain), roster-update/public/_worker.js (dispatch entry, `legacyServiceBackend` use), roster-update/public/edge-notifications.js (claim/settle, backlog rule), shared/edge-health.js (health line), tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
Changing recipients, time or content of the email; Google backend changes or redeploy; WhatsApp; any live data, settings, merge or deploy.

## Acceptance checks
1. Test: a row queued by the scheduled path is sent by the cron drain without any Pages request (fails on current code).
2. Test: the Pages `waitUntil` path and the cron racing produce exactly one send per recipient.
3. Test: past-date queued rows are cancelled with the stated reason, not sent. Today's row sends.
4. Test: a missing snapshot settles `failed` with a reason; no email is sent.
5. Test: the send path works with `ROSTER_EDGE_AUTHORITY=d1`, or the PR shows which path is used and why.
6. `gsis_job_health` `employment-mail` is written on every drain.
7. Canonical build no diff; full local suite green; full CI green; draft PR naming **Claude** as reviewer at the exact head; deploy steps list the files and any cron change.

## Decisions and changes
- Owner exception 12 Nov: Claude reviews this task instead of Muse. Muse skips this task only.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review


## Claim (Model: Codex, 13 Nov)

Branch `codex/roster-d1-employment-mail-dispatch` from verified main `61c628f13ff9edbacabd9a7f2044bb25b7594915`. Evidence read before implementation. Reviewer: Claude under the owner exception.

The owner directed starting this task after posting the corrected PR #127 head for re-review. That was done at `73d057b0c6fc28bf0fc0dbfd81085e9c04c102a3`, with all five CI jobs green in run `43299901288` and a clean canonical build. This explicit sequence supersedes waiting for #127 to merge. The tasks overlap in generated Worker bundles and potentially the health display; this branch starts from main without importing the unmerged backup implementation. The full local #127 rerun continues in its separate worktree.

No main push, force-push, merge, deployment, live reads/writes, provider calls or WhatsApp activation. Claim recorded on this branch before product edits, consistent with the owner's no-main-push rule.
