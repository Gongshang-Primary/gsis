# Review: PR #105 — Edge queues with Google authority (design note)

- Reviewer/model: Muse
- Reviewed head: `7c3b839f5b6873e3bac43bde37e1c5d65dd73e41` (exact head; re-review if the head moves)
- PR: https://github.com/helper-gsps/gsis/pull/105 — draft, open, base main
- Branch: `codex/edge-queue-design-note`
- Task: `docs/coordination/tasks/edge-queue-google-authority.md` (design note first in the edge-queue series)
- Date: 8 November 2026

## Verdict: APPROVE

## Evidence

- **CI**: run 42481479100 at the exact head — completed success, all 5 jobs (full-suite + Regression shards 1–4). Verified via the check-runs API and `gh run view`.
- **Local** (worktree wt105 at the exact head, `TZ=Asia/Singapore`): all 10 relative links resolve (9 in the design note + 1 in the task record) — verified by the reviewer with a path check, 0 bad. `git diff --check` passes. Worktree clean.
- **Canonical build**: `TZ=Asia/Singapore npm run build` at the head — PASS, **no diff**.
- **Merge-tree** vs main 0c897a4: **clean** (tree 90325ae7e7e174aa77a3d449df9a5d533831c334). GitHub reports MERGEABLE/CLEAN.
- **Secret scan**: not applicable beyond the usual check — the diff is prose only (192-line design note + task-record lines). No secret values, tokens, private links or school records.

## Findings

- **Scope matches the task and the prompt.** Docs-only: exactly two files changed — the new design note `docs/coordination/plans/edge-queue-design-note.md` and the task record. No product code, no generated files, no live settings or data. The note states it implements nothing and authorizes no deployment or mode change.
- **The note covers all ten topics the prompt required**, per app (Deploy P1, Venues P2, Contacts P3): data model and D1 schema (tables, indexes, caps, retention), atomic admission with idempotent request IDs and canonical payload digests, document-wide FIFO dispatch under the Google writer lock, receipts and publish steps (including the #90 frozen publication/Contacts/Layout outcomes and the "Published; Contacts update pending/failed" partial-success wording), verified read caches ("As of HH:MM SGT, revision N"), direct fallback with the same operation identity, switch-back, observability (10-minute / two-failure Admin alerts), security and privacy, and phasing with per-phase acceptance gates.
- **The open LORD detail is resolved with a verified correction.** The earlier claim that `queueCommand` existed only in a test was a case-sensitive search error. The reviewer verified at base 0c897a4: `lord-suite/Source/backend/Code.gs` lowercases the action in `doPost` and dispatches `queuecommand` to `lordQueueCommand_` at line 531, defined at line 7485. That handler supports execute/status/backup, not D1 admission — the note records this and places edge admission in the Worker service's proposed `POST /commands`, with a new document head/gate because LORD's per-job lease is not a whole-workbook FIFO guarantee.
- **Two design decisions the owner should notice.** (1) The note requires a separately reachable Google-hosted recovery page (validating a Google school identity token server-side) before any app can enable `queued` — a full Worker outage cannot be recovered through the same Pages Worker, and a second Worker does not prove recovery from a Cloudflare-wide outage. This is recorded as a future implementation gate, not an existing feature. (2) The note deliberately differs from LORD phase 1's no-direct-replay rule: edge direct fallback is safe only after both direct and queued adapters share durable deduplication, mode checks and native-journal recovery, plus the Google decision ledger (`edge_operation_receipts`) under the existing writer lock. P1 cannot claim fallback from today's bounded request lists.
- **The note is honest about its limits.** It claims no runtime behaviour, performance (the one-second warm-admission target is a measurement gate), or live verification. Required test cases for each phase are listed as acceptance gates, not as tests run. The task record states the same, including what this docs work did not test.
- **Live safety.** No behaviour change in this PR. The note keeps Google as the system of record, keeps `direct` as the default mode for every app, and requires owner enablement of `queued` per app after acceptance gates pass. The Venues route suspension, #67 stale fix and live Contacts 401 are explicitly excluded.
- **Not independently verified by the reviewer**: the full local Node suite (CI green at the exact head covers it). The note's LORD and backend line references were verified by the reviewer at the base (see above).

## Nonblocking notes

- The task file's `Status:` line reads "design note written; local documentation checks passed; final-head build and full CI pending". It is stale now that the build and CI are green and the PR is open; left as-is because updating it would move the reviewed head. The PR body is authoritative.
- The note's shadow period (comparing reads and exercising synthetic commands before enabling `queued`) has no standalone acceptance criteria beyond the phase gates table. The P1 PR should state its shadow evidence explicitly when it arrives.

## Release notes for the owner

The edge-queue design is now written and reviewed. After this merges, the next queue items are secret consolidation — Roster/Deploy, then edge-queue P1 (shared module + Deploy, default mode `direct`). P1 must prove the Google-hosted recovery path and the shared decision ledger before any app can be switched to `queued`. No mode change, deployment or live probe follows from this note.
