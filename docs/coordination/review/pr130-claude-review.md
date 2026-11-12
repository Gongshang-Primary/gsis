# PR #130 review (Claude): roster-d1-employment-mail-dispatch

- Head reviewed: 5a0fd06 (codex/roster-d1-employment-mail-dispatch). Reviewer: Claude (owner exception 12 Nov).
- Verdict: **approve**.

## Evidence
- CI at the head: full-suite success (131481752780); shards 1-4 success.
- Local, TZ=Asia/Singapore, at the head: PASS roster-employment-mail-drain, roster096-dispatch-idle, roster096-scheduled-idle. Canonical build: no diff. Merge-tree against main: clean.
- Against #127's head: conflicts only in CHANGELOG.md and the four generated Worker bundles. Merge with the standard local procedure (HANDOVER §3).

## Findings (none blocking)
1. Root cause confirmed in code: the minute cron never called `dispatchDailyEmploymentReports`. It now does under D1 authority, after the planning step. No new cron, no provider change, no Google redeploy (the mail-only handler runs before the frozen write fence, which a test proves).
2. Cost per minute is small: the dispatcher first runs the cheap `edgeDispatchHasWork` SQL probe, which now matches only queued rows due today or earlier and sending rows over 10 minutes old. It loads the Roster document only when there is work.
3. Safety: past-date queued rows are cancelled with `STALE_BACKLOG`; only today's row sends. A missing or unreadable snapshot fails without sending. A second row with the same date, key and recipient, already sending, sent or uncertain, is cancelled rather than sent. Uncertain rows are never resent. Five sends at most per drain.
4. Minor, accepted: job health is written on every idle minute (as the task asked). History pruning by age already exists.

## For the owner
Merge order: **#127 first, then #130** (local merge of generated files and CHANGELOG). After deploy: the 12 old emails (6, 10, 11, 12 Nov) are cancelled on the first drain. Today's email sends if it is still queued for today. Check System Health → Employment email → Last sent.
