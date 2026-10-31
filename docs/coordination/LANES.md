# Lanes and job coordination (three models)

Owner and release decision: Song Wee. Coordinator: **Claude** (owner directive 31 Oct 2026: "add gemini to agents, be coordinator of jobs and lanes").

The coordinator assigns each job to a lane and a model, keeps this file and the queue current, writes each model's prompt for the owner to paste, and reviews every PR at its exact head. The owner merges and deploys. The coordinator does not merge without the owner's word.

## Models
| Model | Role | Branch prefix | Commit/PR label |
|---|---|---|---|
| Codex | Builder, Roster core and D1 path | `codex/<task-id>` | `Model: Codex` |
| Gemini | Builder, isolated product lanes (pilot) | `gemini/<task-id>` | `Model: Gemini` |
| Claude | Coordinator, architect, reviewer; small fixes | `claude/<task-id>` | `Model: Claude` |

All three share one GitHub identity, so the label is the only attribution.

## Lanes
| Lane | Scope (files/domains) | Assigned builder | Notes |
|---|---|---|---|
| **R: Roster core and D1** | `shared/roster-*.js`, `backend/Roster*.gs`, `backend/Code.gs`, `roster-update/public/`, `shared/edge-*.js`, `shared/roster-import.js`, `shared/roster-mirror.js`, generated Roster/Deploy backends and Worker bundles | Codex | Serial: one open task at a time touches this lane (WORKFLOW rule). Critical path to D1. |
| **D: Deploy (planning, workload, relief settings)** | `public/` (Deploy frontend), `shared/workload.js`, `shared/relief.js`, `shared/teaching-rules.js`, `backend/Relief.gs` | Codex or Claude | Shares generated bundles with lane R, so it is serial with R. |
| **C: Contacts** | `contacts-update/public/`, `backend/Contacts_*.gs`, `Contacts_Code.gs` | Gemini (pilot) | Independent of Roster bundles except the Contacts API used by Roster; API changes need coordinator sign-off. |
| **K: Calendar** | `calendar-update/public/`, `calendar-backend/`, `calendar-job-worker/` | Gemini or Codex | Independent. |
| **L: LORD suite UI** | `lord-suite/Source/` (frontends) | Gemini after pilot | LORD backend and queued writes stay with Codex until designed (D1-first rule). |
| **Y: Layout and Venues** | `layout-update/public/`, `venues-viewport/public/` | Gemini after pilot | Independent. |
| **T: Docs and tests only** | `docs/`, `tests/` without product code | Any | Coordinator approves. |

Any job that touches files in two lanes belongs to the stricter lane (R before D before the rest). Release assembly (`scripts/build-release.py`, `package.json`, `release-installation-manifest.json`) is coordinator-owned.

## Rules for every builder
1. Read `AGENTS.md`, `docs/coordination/WORKFLOW.md`, `OWNER_DIRECTIVES.md`, `STATUS.md`, this file and the task record before editing.
2. Work only inside the assigned lane and task scope. If a fix needs another lane's files, stop and ask the coordinator.
3. One open PR per builder unless the coordinator allows more. Lane R stays serial.
4. Run `npm run build` before `npm test` after every branch switch. Open a PR only when the full suite (Node and LORD) is green with `TZ=Asia/Singapore`; state exactly what ran.
5. Never deploy, change live settings, activate D1 or change `ROSTER_EDGE_AUTHORITY`. Never send messages or change live school records.
6. Claude reviews each PR at its exact head SHA; the owner merges.

## Gemini pilot
- First job: **row C**, Contacts Edit Info "Find by TTb name" filter (PENDING_CHANGELOG 31 Oct). Small, lane C only.
- After the pilot the coordinator reports quality (correctness, rule-following, test discipline) and the owner decides whether lanes K, L and Y open to Gemini.

## Current assignments (update on every change)
| Job | Lane | Model | Status |
|---|---|---|---|
| R2: D1 import capture saves packed state | R | Codex | Merged #34, deployed v0.9.9e |
| F: cutover freeze before snapshot | R | Codex | **Top priority** (1 Nov 04:05) |
| Row I: inactive Contacts staff unavailable in Roster (#30) | R | Codex | Draft, paused behind R2 |
| #29: weekly R checkpoint plus FAJT levelling | R | Codex | Draft, paused |
| Row P: peer-mail health fix | R | Codex | Queued after I |
| Row C: Contacts Edit Info TTb filter | C | **Gemini (pilot)** | Ready to start |
| Cutover runbook | T | Claude | Draft; finish before the D1 trial |
