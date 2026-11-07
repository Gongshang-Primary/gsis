# Muse review of PR #101

Model: Muse
Reviewer: Muse; 7 November 2026 (Asia/Singapore).
Reviewed head: e6be5a4a62737c9c2f81d794043f8505e31908d0 (draft PR #101, "Model: Codex / D1 parity inventory and dispatcher coverage guard").
Current main checked: 9e1057b.
Verdict: **approve — no blocking findings**. This is a code review at the exact head, not a merge, deployment, or live-provider validation.

Recorded on main by Muse from the review performed in a separate worktree at the exact head.

## Scope

Step 1 of `docs/coordination/tasks/roster-d1-parity-sweep.md` only: the D1 parity inventory (docs) plus the harness test and CI coverage guard. No production handlers, authority flags, settings, or live records change; no Step 2 ports.

7 files, +13055/−0, all additions: `docs/roster/D1_PARITY.md` (272 rows), `docs/roster/d1-parity.json`, `tests/helpers/roster-parity.cjs`, `tests/roster-d1-parity-guard.cjs`, `tests/roster-d1-parity.mjs`, task record, CHANGELOG.md. No product code. Secret scan of the diff: clean. No live data touched; all inventory networking is intercepted locally.

## Verification (Muse, at the exact head)

CI run **42330027869** on head e6be5a4: **green, all 5 jobs** (Regression shards 1/4–4/4 + full-suite), verified via the check-runs API and `gh run view` by Muse. Codex's environment returns Forbidden on GitHub API reads, so Codex did not independently verify CI; the owner supplied the run and Muse verified it.

Local worktree at the exact head (`TZ=Asia/Singapore`, `NODE_NO_WARNINGS=1`, `ROSTER_TEST_CHROMIUM` set to the Playwright Chromium):

- `tests/roster-d1-parity-guard.cjs`: PASS — "272 operations/views/routes/writers; D1 handler or explicit Google-only exception per row".
- `tests/roster-d1-parity.mjs`: PASS — 272 operations, 85 successful, 15 internal references, 172 errors, 57 missing, zero remote requests.
- Neighbours PASS: `tests/roster094-edge-roster.mjs`, `tests/roster099n-intake-overlap.mjs`, `tests/roster099n-intake-overlap-ui.cjs`, `tests/roster-drive-blob-content-type.cjs`, `tests/roster-drive-writer.cjs`, `tests/roster-daily-edge.mjs` (all exit 0).
- Guard negative control reproduced by Muse: `node tests/roster-d1-parity-guard.cjs --prove` — the deliberately added unlisted Google operation was rejected (child exit 1) and the source restored byte-for-byte; worktree left clean.
- `TZ=Asia/Singapore npm run build`: PASS, all 18 production components, **no tracked diff**.
- `git merge-tree --write-tree --name-only origin/main e6be5a4`: exit 0, no conflicts; GitHub mergeable was UNKNOWN at review time (still computing) — the local merge-tree check is the gate.
- Inventory cross-checks by Muse: `d1-parity.json` parses, 272 rows, matching the Markdown table; `view:intakeReview` is present with a D1 handler and works (200) — #96 is correctly recorded as present; all 57 MISSING rows carry a proposed action and an explicit Google-only reason; the 19 high-risk MISSING rows all carry action "port".

## Findings

- The inventory is explicit about its limits, in both the document and the PR body: synthetic probes against the real edge dispatcher with an in-memory SQLite D1 and fixtures, not semantic Google/D1 parity; HTTP rows are unauthenticated GET probes; discovery is static. "Works" means the synthetic request succeeded. This honesty is correct for a Step 1 inventory.
- The task file's "Done when" ("D1_PARITY.md shows no high-risk MISSING rows") spans both steps. Step 1 does not satisfy it alone: 19 high-risk MISSING rows remain, all actioned "port". That is the Step 2 queue (archive, intake, peer mail, venues sync, timetable preparation), not a Step 1 failure — the plan's Step 1 acceptance (D1_PARITY.md complete with risk + action per operation; harness test) is met. Step 2 ports remain separate PRs in risk order.
- Nonblocking: the task file's `Status:` line still reads "authorised, priority" while the Step 1 claim/implementation sections below it record the current state. Updating it would move the reviewed head, so it is left as-is; the PR body is the authoritative head statement.

## Handoff

PR code, draft status, and production settings remain unchanged. Owner controls marking ready, merging and deployment. Re-review any change to the head SHA. Standard staging acceptance remains a separate release step. Step 2 (ports in risk order) starts after this inventory merges.
