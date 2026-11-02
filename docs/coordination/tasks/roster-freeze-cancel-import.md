# roster-freeze-cancel-import: stop the import when its freeze is cancelled

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude, exact final PR head
- Last updated (Asia/Singapore): 3 November 2026, 04:34 SGT
- Branch: codex/roster-freeze-cancel-import
- Base SHA: fa4bc0237086f1ae203536f767a08e3269dfe31c
- Current head SHA: pending implementation; exact final head in the PR
- PR: pending
- Lane: R, owner top priority for v0.9.9i
- User-authorised scope: a confirmed Cancel freeze must stop that freeze's server-driven import, retain the reason and evidence, and show “Import stopped because the freeze was cancelled” in edge setup. Owner target is merge by 17:00 on 3 November.
- Files/domains owned: import runner and migration orchestration, their local import lifecycle/freeze guards, shared edge-setup UI and generated copies, focused tests and required regenerated backends/Workers, this task and changelog. Google import adapter only if its existing abandonment contract needs a bounded correction.
- Out of scope: audit PR #61, deferred #58, other held product work, live imports, activation, authority/settings, deployment, school records and provider sends.
- Acceptance checks: preparation and staging stop after a confirmed cancellation; stale cron/Queue actors and resumed jobs make no further Google calls or steps; retained rows, parts, receipts and source evidence remain; the reason is visible after reload; a new freeze and import can complete; failed or uncertain cancellation stays recoverable and cannot stop another freeze's import.

## Background

The [attempt 3 record](roster-d1-cutover-attempt3.md) logs that at 04:23 on 3 November the Worker advanced preparation from step 79 to 81 after cancellation. The owner had to Restart by hand. The import runner currently has a durable lease but no cancellation link to its freeze.

## Plan

Reproduce the defect through the actual migration and server runner on SQLite/D1. Bind import continuation to its freeze, stop or abandon only matching work using retained restart evidence, and revoke stale runner ownership. Guard each preparation/staging boundary so cancellation cannot admit later Google calls or commit new progress. Preserve existing rehearsal and recovery paths. Add the explicit stopped reason to edge setup and verify it after reload. Regenerate canonical outputs, run focused checks and the full Node/LORD suite at the published head.

## Verification

Pending. All checks use Asia/Singapore. No live action is a test.

## Review

Claude reviews the final exact head; owner merges. #61 may land first, so recheck current main and rebase if needed. No force push without owner authorisation.

## Deployment and rollback

Not deployed. Retain all immutable source, staging rows, parts, receipts and cancellation evidence. A code rollback must not silently resume an import that was stopped by a confirmed freeze cancellation.

## Handoff

Implement the bounded correction, publish a draft PR with Model: Codex and the exact head for Claude, and preserve the owner's release decision.
