# Lanes and job coordination (three models)

Owner and release decision: Song Wee. Coordinator: **Claude** (owner directive 31 Oct 2026: "add gemini to agents, be coordinator of jobs and lanes").

The coordinator assigns each job to a lane and a model, keeps this file and the queue current, writes each model's prompt for the owner to paste, and reviews every PR at its exact head. The owner merges and deploys. The coordinator does not merge without the owner's word.

## Models
| Model | Role | Branch prefix | Commit/PR label |
|---|---|---|---|
| Codex | Builder, Roster core and D1 path | `codex/<task-id>` | `Model: Codex` |
| Muse | Builder, pilot (owner directive 3 Nov 2026) | `muse/<task-id>` | `Model: Muse` |
| Claude | Coordinator, architect, reviewer; small fixes | `claude/<task-id>` | `Model: Claude` |

All three share one GitHub identity, so the label is the only attribution.

## Lanes
| Lane | Scope (files/domains) | Assigned builder | Notes |
|---|---|---|---|
| **R: Roster core and D1** | `shared/roster-*.js`, `backend/Roster*.gs`, `backend/Code.gs`, `roster-update/public/`, `shared/edge-*.js`, `shared/roster-import.js`, `shared/roster-mirror.js`, generated Roster/Deploy backends and Worker bundles | Codex | Serial: one open task at a time touches this lane (WORKFLOW rule). Critical path to D1. |
| **D: Deploy (planning, workload, relief settings)** | `public/` (Deploy frontend), `shared/workload.js`, `shared/relief.js`, `shared/teaching-rules.js`, `backend/Relief.gs` | Codex or Claude | Shares generated bundles with lane R, so it is serial with R. |
| **C: Contacts** | `contacts-update/public/`, `backend/Contacts_*.gs`, `Contacts_Code.gs` | Codex (Muse after pilot) | Independent of Roster bundles except the Contacts API used by Roster; API changes need coordinator sign-off. |
| **K: Calendar** | `calendar-update/public/`, `calendar-backend/`, `calendar-job-worker/` | Codex (Muse after pilot) | Independent. |
| **L: LORD suite UI** | `lord-suite/Source/` (frontends) | Codex (Muse after pilot) | LORD backend and queued writes stay with Codex until designed (D1-first rule). |
| **Y: Layout and Venues** | `layout-update/public/`, `venues-viewport/public/` | Codex (Muse after pilot) | Independent. |
| **T: Docs and tests only** | `docs/`, `tests/` without product code | Any | Coordinator approves. |

Any job that touches files in two lanes belongs to the stricter lane (R before D before the rest). Release assembly (`scripts/build-release.py`, `package.json`, `release-installation-manifest.json`) is coordinator-owned.

## Rules for every builder
1. Read `AGENTS.md`, `docs/coordination/WORKFLOW.md`, `OWNER_DIRECTIVES.md`, `STATUS.md`, this file and the task record before editing.
2. Work only inside the assigned lane and task scope. If a fix needs another lane's files, stop and ask the coordinator.
3. One open PR per builder unless the coordinator allows more. Lane R stays serial.
4. Run `npm run build` before `npm test` after every branch switch. Open a PR only when the full suite (Node and LORD) is green with `TZ=Asia/Singapore`; state exactly what ran.
5. Never deploy, change live settings, activate D1 or change `ROSTER_EDGE_AUTHORITY`. Never send messages or change live school records.
6. Claude reviews each PR at its exact head SHA; the owner merges.

## Muse pilot (owner 3 Nov 2026: "include muse into agents that can assign coding to")
- Muse follows AGENTS.md, WORKFLOW.md and this file exactly like Codex: one claimed task, one `muse/<task-id>` branch, `Model: Muse` on every commit and PR, draft PR naming Claude as reviewer with the exact head SHA, full CI green before review.
- Pilot scope: one small, isolated task outside lane R (for example a Contacts, Layout or Calendar fix). Lane R (Roster/D1) stays with Codex until the pilot is reviewed.
- 3 Nov 2026: a lane R exception for Muse (`roster-consecutive-after-gap`) was granted and then withdrawn the same day; the task went to Codex. Lane R stays with Codex.
- Never claim another model's approval or a test run that is not in CI. After the pilot the coordinator reports quality and the owner decides which lanes open to Muse.

## Gemini (Jules): removed 3 Nov 2026 (owner: "remove jules (gemini)")
Kept for the record. Gemini/Jules no longer receives jobs; its branches no longer trigger CI. Pilot history:
- First job: **row C**, Contacts Edit Info "Find by TTb name" filter (PENDING_CHANGELOG 31 Oct). Small, lane C only.
- After the pilot the coordinator reports quality (correctness, rule-following, test discipline) and the owner decides whether lanes K, L and Y open to Gemini.

## Current assignments (update on every change)
Codex, urgent lane R (owner 3 Nov 08:37): `tasks/roster-peer-quota-override.md`: colleague approval may exceed weekly R.

Muse pilot (owner 3 Nov): 1) `tasks/overlord-dismiss-past-unknowns.md` (lane L UI), then 2) `tasks/calendar-deploy-version-check.md` (lane K tooling). Review by Claude before any next Muse task.

Owner 1 Nov 2026 08:05: "allocate any left PR to codex". All open work goes to Codex, in this order. Updated 1 Nov 19:10 after the first cutover attempt refused activation.

| # | Job | Lane | Model | Status |
|---|---|---|---|---|
| 0 | **Attempt 3 blockers (tonight 22:00): R1 reset after rollback, R2 Deploy-from-Google, R3 backup, R4 smoke test, R5 review #49/#50** `tasks/roster-d1-cutover-attempt3.md` | R | Codex | **Top priority**, owner 2 Nov 05:22; merge by 17:00 |
| 1 | G: cutover diagnostics `tasks/roster-cutover-diagnostics.md` | R | Codex | Merged #45; shipped in v0.9.9g |
| 2 | #38 inactive Contacts staff (1B) | R | Codex | Reviewed, no blockers; merge held until after Monday's first busy period on D1 |
| 3 | #40 weekly R snapshot plus FAJT levelling (3B) | R | Codex | CI green; Claude full review pending; held |
| 4 | #41 peer-mail health (row P) | R | Codex | One question open (store under D1 authority); held |
| 5 | #42 import progress totals | R | Codex | No blockers; held; rebase chain #38, #40, #41, #42 serially after Monday |
| 6 | #43 Calendar row 9 | K | Codex | Reviewed, no blockers; owner may merge |
| 7 | #44 LORD queued writes phase 1 | L | Codex | Reviewed, no blockers; owner may merge |
| 8 | Close the freeze gap for webhooks; top-up import; drop short-lived state from the digest (items 1, 4, 5) | R | Codex | Next after G; needs Claude design note first |
| 9 | Relief count shows 0 for a teacher who did relief; quota-0 wording `tasks/roster-relief-count-investigation.md` | R | Codex | Authorised 1 Nov 20:45; merge held |
| 10 | Statistics table "Cumulative percentage of relief done R%" `tasks/roster-statistics-next-in-line.md` | R | Codex | Authorised 1 Nov 20:45; after or with row 9; merge held |
| 11 | Wording: "individual occupancy" terms in Deploy and Roster `tasks/wording-timetabled-occupancy.md` | D+R | Codex | Authorised 1 Nov 21:25; start after rows 9 and 10; merge held |
| - | Cutover runbook updates for F | T | Claude | After F merges |

Gemini: no active job. Pilot result (#35): in-lane and fast, but an empty first push, a weak string-only test, a likely locked-grid bug, and a false "verified by Claude" claim. Reassess before giving Gemini another lane.
