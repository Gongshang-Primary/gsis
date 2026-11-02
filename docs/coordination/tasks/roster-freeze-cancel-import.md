# roster-freeze-cancel-import: superseded by merged PR #62

- Status: superseded; no implementation from this branch was published
- Owner/model: Codex
- Reviewer/model for the landed fix: Claude
- Last updated (Asia/Singapore): 3 November 2026, 05:51 SGT
- Branch: codex/roster-freeze-cancel-import
- Original base: fa4bc0237086f1ae203536f767a08e3269dfe31c; local alternative rebased on ea7ea67ffec35757e0cc86b8673f09feebd4ee7a
- Superseding PR: https://github.com/helper-gsps/gsis/pull/62
- Landed implementation head: 65697756a494f709aa04384c56debcb42210a743
- Merge commit: 1ddb60ddade47ce396f43ff285dca1985ebfbac0
- Current main/release label: 2520ff13ee7f4d20b5dcbb569a162c4b5190a26e, v0.9.9i
- Lane: R; owner target was merge by 17:00 SGT on 3 November

## Outcome

The authorised cancellation fix landed through the separate codex/roster-cancel-freeze-import branch while this alternative was being prepared. PR #62 merged at 05:19 SGT; its task record is docs/coordination/tasks/roster-cancel-freeze-import.md. No duplicate PR was opened, and no alternative implementation was applied over the accepted fix.

The merged code atomically stops the server import and invalidates its preparation/write claims when cancellation is confirmed. It retains source, checkpoints, rows and receipts, shows the cancellation reason in edge setup, and keeps the explicit evidence-review/Restart recovery before a fresh import. This is the owner's permitted stopped-job recovery option. An already dispatched Google request may return; its late result cannot commit further progress, and later runner Google requests are rejected.

## Verification of the landed result

- Verified PR #62 is merged, its exact implementation head is 65697756a494f709aa04384c56debcb42210a743, and main's build label is 0.9.9i.
- Exact-head CI: https://github.com/helper-gsps/gsis/actions/runs/41525253902, completed successfully. All four regression shards and the required full-suite aggregate passed. The PR records 949/949 current Node programs, all LORD checks and browser checks.
- Read the merged runner, cancellation transaction, migration guards, task and PR evidence. Existing acceptance covers preparation/staging cancellation, late replies, transaction races/recovery, stale or duplicate cancellation, replay protection, retained evidence, explicit Restart and a fresh freeze/import.
- No live import, authority change, deployment, school-record mutation or provider send was performed here. A release label alone is not deployment evidence.

## Alternative work and coordination

A broader local alternative was prepared at ad0c1142c10f2f8e2d11849fc7e0d8defccb83d2, tree 47a68712cf024c48dc5e691bc9c0090b9b563b5d. It used automatic Restart abandonment, explicit freeze associations, R2 operation guards and cleanup-race handling. Its 22 focused checks passed. Its earlier full local run passed 947/948 Node programs, with packaging blocked by the checkout's missing historical baseline object; all 39 LORD programs passed. These are local-alternative results, not additional claims about #62.

The alternative changes recovery semantics and must not be merged over #62. Its review findings and fixes concerned that implementation. Large generated-file connector uploads stalled, so they were not published. Small unreferenced blobs do not constitute a branch change. The implementation publish was stopped when the merged result was discovered.

Automatic approval review had rejected a documentation-only main claim update. The original claim was instead published on this feature branch at 8f4001b4b3f307fe4d08e4378a47acef39178bf7. This superseded record closes that claim on the same branch, preserving current main as the code base and the claim as a parent without a force update.

## Handoff

Use merged PR #62 and its exact-head CI as the release evidence. The owner retains merge and deployment authority. No further implementation or duplicate review request remains on this task.
