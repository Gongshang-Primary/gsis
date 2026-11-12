# Owner directives

Song Wee's standing instructions. They override WORKFLOW.md defaults. Newest first. Add, never silently delete; mark a directive withdrawn with its date.

| Date (SGT) | Directive | Applies to |
| --- | --- | --- |
| 12 Nov 2026 | Standing v1 handoff rule: when switching between Work, Chat and Codex, use the GSiS Git repository's v1 documentation as the transfer medium. Publish the required plans, source references, decisions and handoff context under docs/v1/ before handing over; provide the repository path, branch and exact commit link so the receiving agent can retrieve them. Do not rely on chat-only text or local-file transfer as the sole handoff source. Preserve planning/approval status; publishing a handoff does not authorise implementation, merge of other work, deployment or live-data operations. | v1; Work, Chat, Codex |
| 12 Nov 2026 | v1 quality gates: after two v1 tasks, assess which gates are useful and trim the rest, but always retain the required security and recovery checks even when they find no defects. | v1 (all models) |
| 12 Nov 2026 | When ChatGPT (v1) and Muse (v0.9.9*) both want Codex at the same time, the owner decides which comes first (owner: "user"). Coordinators raise the clash to the owner; neither reassigns Codex alone. | ChatGPT, Muse, Codex |
| 12 Nov 2026 | Owner appointed ChatGPT as v1 coordinator (owner confirmed to Claude: "yes i appointed"). Scope as in LANES.md V1C: ChatGPT coordinates v1; Codex builds; Claude reviews each exact head. Muse keeps v0.9.9* production coordination. Grants no merge, deploy, migration or live-data authority. | v1 (V1C) |
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

## 3 Nov 2026: Gemini (Jules) removed; Muse added
Owner: "include muse into agents that can assign coding to" and "remove jules (gemini)". Builders are Codex and Muse (Muse on pilot, outside lane R). Gemini/Jules gets no new jobs; its history stays recorded below.

## 31 Oct 2026: Gemini joins; Claude coordinates
Owner: "add gemini to agents, be coordinator of jobs and lanes." Gemini is a builder in isolated lanes (pilot: Contacts row C). Claude assigns jobs and lanes in LANES.md, writes prompts for the owner, and reviews every PR at its exact head. Codex keeps the Roster core and D1 lane. The owner still merges and deploys.
