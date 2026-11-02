# roster-quiet-mode-log-catchup: catch up verbose logging after quiet mode ends (changelog)

- Status: proposed (owner changelog, 2 Nov 2026 ~06:00); not authorised to build
- Owner/model: unassigned (Codex when authorised)
- Reviewer/model: Claude
- Lane: R (serial); applies to the Google (fallback) workflow, and must also hold on D1

## Owner request (verbatim)
"roster changelog for codex to Google (fallback) workflow: when quiet mode is turned off by "let teachers see", let verbose logging catch up with all the pent up logging (right now verbose logging is missing out details during quiet mode)"

## Context (Claude)
Quiet mode (`shared/roster-quiet-mode.js`) pauses `allocation`, `peer-mail` and `audit-export`. "Let teachers see" ends it (`QUIET_END_OPERATIONS.publish`). The allocation audit export ("verbose logging") runs at most one retained day per five-minute invocation (`notification-worker/index.js`, cron `2-57/5`), so decisions made during quiet mode appear to be coalesced or missed instead of recorded step by step.

## Requirement
1. While quiet, keep recording each SMC decision's audit facts durably (a cheap append, not the heavy export), so nothing is lost.
2. When quiet ends (publish, notifyDaily, expiry or manual end), drain the pent-up audit backlog in order, oldest first, until caught up; then resume the normal cadence.
3. The catch-up must not compete with the morning saves: bounded batches, and it yields while quiet is active again.
4. Same behaviour on D1 authority.

## Acceptance
Test: a quiet session with N decisions, then publish; the audit export afterwards contains all N in order with their times; nothing is duplicated on retry.

## Owner ruling (2 Nov ~06:05)
"Verbose logging" = the **allocation audit export** (the per-day Excel/Drive archive), job `audit-export`, which quiet mode pauses.
