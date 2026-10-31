# Owner directives

Song Wee's standing instructions. They override WORKFLOW.md defaults. Newest first. Add, never silently delete; mark a directive withdrawn with its date.

| Date (SGT) | Directive | Applies to |
| --- | --- | --- |
| 29 Oct 2026 | Stapler: a teacher sponsored by an SMC for a date may both plan and publish that date (current behaviour; keep it). Any SMC or Admin may also work on the same plan; the per-date planning lock allows one editor at a time. | Roster policy |
| 29 Oct 2026 | Role split: Codex implements most coding (features, migrations, fixes over about 30 lines). Claude reviews Codex PRs at the exact head SHA and makes small edits only. Claude keeps its open PRs #2 to #6 through review fixes. Each task record carries its own background so the implementer needs no chat history. | Codex, Claude |
| 29 Oct 2026 | Do not guard deployment timings for the owner. Report risks; the owner decides when to deploy. | All models |
| 29 Oct 2026 | Do not edit code until explicitly told. A request such as "you need to…" is logged in the changelog first. | All models |
| 28 Oct 2026 | Treat code requests as changelog entries until the owner explicitly says "commit". Task-branch commits needed to open an authorised PR are allowed; `main` changes only by owner merge or the claim-only rule. | All models |
| 29 Oct 2026 | Latest absence submission overwrites automatically (implemented in fc0abb9). | Roster policy |
| 29 Oct 2026 | Publication timestamp shows time only, no publisher name. | Roster UI |
| 28 Oct 2026 | Staging may use real (official, non-sensitive) staff data. | Staging |

## 31 Oct 2026: Deploy policy changes and R
Owner: "policy update in deploy must update R but not retrospectively". A published Deploy policy change applies to Roster R from the next weekly checkpoint (Sunday 16:00 for the coming week, PR #29). Captured weeks, past entitlement, cumulative R% history and completed duties never change. Unpublished drafts never reach Roster.

## 31 Oct 2026: weekly R source (PR #29)
Owner chose 3B: on publication Deploy writes calculated R to a versioned Cloudflare snapshot; Roster reads it at the Sunday 16:00 checkpoint. Claude's recorded caution: the snapshot is a second copy that can fail or lag independently of Google, so the checkpoint must verify the snapshot's Deploy publication id and revision, expose failure in System Health, and keep last week's verified R (never zero) if the snapshot is missing or stale.
