# Published-day reminder fast checks

- Status: implementing, prepared branch; no additional PR until a queue slot opens.
- Owner/model: Codex
- Reviewer/model: Claude
- Branch: codex/roster-reminder-cheap-check
- Base SHA: 59c9ba45581205433867a7a667ea2754a013a2a5
- PR: none

Model: Codex. Owner authorised the full queue. Queue row 4 and Claude's nonblocking notes on PR #7 request a version-fenced next-due hint so published days do not load the full operations file every minute. Preserve existing reminder/SMC/report deadlines, stale-hint fallback, dirty markers, allocation slots and Google authority. Keep only present/future notice dates in the bounded hint.

Plan: add a pure next scheduled notice projection using existing publication/acknowledgement state and dedupe keys; persist its earliest reminder/report deadline in schema-2 hints; skip only while that deadline is future or absent. Invalid/missing/stale metadata falls back to the full read. Verify before/at deadlines, acknowledgement, duplicate notifications, summary slots, version changes and historical-date pruning. No live sends or deployment.

Local verification: next-deadline/fence/pruning tests pass, all 18 components built, and existing scheduled-slot/SMC/reminder checks pass. The 15-minute freshness bound is retained. Full Linux CI and Claude review remain required.
