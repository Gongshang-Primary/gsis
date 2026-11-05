# roster-live-updates: push revision changes to open pages; idle backoff for the fallback poll

- Status: authorised (owner 6 Nov ~01:45: "the production improvements are worthwhile esp push. for codex"); Codex, lane R. Two PRs: A (idle backoff) small and first; B (push) after the remove-why task and the D1 first week.
- Reviewer/model: Claude. Spec by Claude under the standing rule.

## Today (roster-update/public/roster.js)
- `checkFreshness` every 60 s per visible tab (profile request; reloads page data when revision/day/role changed; skips hidden tabs and dirty/busy states).
- Timetable preload check hourly at :20 and on tab focus. Loading clock every 1 s (display only).
On D1 the poll is cheap but still one request per open tab per minute, and changes by others appear up to 60 s late.

## PR A: idle backoff (small)
1. Poll every 60 s while the user interacted in the last 10 minutes; every 5 minutes when idle; none while hidden; immediate check on focus/visibility, on network "online", and after any own save.
2. Never replace the DOM or state while editing/dirty (keep current guards).
3. Tests: interval switches active→idle→active; hidden tab makes no requests; immediate check on focus.

## PR B: push (live revision notices)
Design:
1. A Cloudflare **Durable Object** "RosterLive" (one instance per school scope) using the **WebSocket Hibernation API** (cheap while idle). Hosted in a Worker the Pages project binds to (or in gsis-operations if that is the cleaner deploy); document the exact dashboard or wrangler steps the owner must perform, including the Durable Object migration.
2. Endpoint `GET /api/live` (WebSocket upgrade) on roster.gsps.edu.sg. Authenticate with the same session/identity check as other API calls before accepting; reject unauthenticated sockets; re-check identity on a schedule (e.g. every 15 minutes) and close on loss of access.
3. After every committed D1 mutation (edge-roster commit path, scheduled jobs, imports, Stapler, opening balances), send the DO a **notice only**: `{scope, revision, dates:[…], kinds:[assignments|absences|stapler|timetable|config|profile], at}`. **No school data over the socket**: clients fetch with the normal authorised API. Fire-and-forget from the commit (never block or fail a save; failures are logged).
4. Clients: on a notice with a newer revision touching the visible page/date, refresh that view (same guards: never while editing/dirty; show "Updated by someone else — Refresh" when dirty). Coalesce bursts (max one refresh per 2 s). Reconnect with exponential backoff and jitter; while disconnected, fall back to PR A's poll.
5. Day rollover: the DO (alarm) or client clock sends a "day changed" notice at 00:00 SGT.
6. Health: System Health shows connected clients count and last notice time; alert if notices stop while saves continue.
7. Limits and cost: cap sockets per user (e.g. 5 tabs), heartbeat via hibernation auto-response, no per-message storage. Estimate the monthly cost at about 150 staff in the PR.
8. Zero Trust/Access in front of the domain must not break the socket (test behind Access).
9. Tests: notice after commit reaches a subscribed client; unauthenticated socket refused; no record data in any frame; dirty page not overwritten; reconnect + poll fallback; save never fails when the DO is down; day-rollover notice.
