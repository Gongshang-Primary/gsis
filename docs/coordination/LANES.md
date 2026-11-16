# Lanes and job coordination (three models)

Owner and release decision: Song Wee. Coordinator for v0.9 lanes: **Claude** (owner 14 Nov: "take over coordinator ship from muse for v0.9 lanes. retire muse completely"). Muse is **retired**: no new tasks, reviews, releases or commits. History: Claude 31 Oct, Muse 13-14 Nov, Claude again from 14 Nov. v1 lanes are unchanged (ChatGPT coordinates; Claude reviews named v1 tasks). Previously: Claude reviews only when the owner names Claude for a task.

The coordinator assigns each job to a lane and a model, keeps this file and the queue current, writes each model's prompt for the owner to paste, and reviews every PR at its exact head. The owner merges and deploys. The coordinator does not merge without the owner's word.

## Models
| Model | Role | Branch prefix | Commit/PR label |
|---|---|---|---|
| Codex | Builder, Roster core and D1 path | `codex/<task-id>` | `Model: Codex` |
| Muse | **Review only from 16 Nov 2026** (owner role switch; retirement of 14 Nov no longer applies to review). Writes no code, merges or coordination. Branches `muse/*` and records kept as history. | `muse/<task-id>` (history) | `Model: Muse` |
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
| **Y: Layout and Venues** | `layout-update/public/`, `venues-viewport/public/` | Layout: Codex. **Venues: Codex** (from 14 Nov; was Muse, retired) | Independent. Roster-side Venues sync code stays lane R: changes need Claude's OK. |
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
- Owner exception 3 Nov 2026: Muse takes `roster-consecutive-after-gap` in lane R (allocator occupancy only), running beside Codex's lane R work on disjoint files. Rebase on main before review; the later PR rebases.
- Never claim another model's approval or a test run that is not in CI. After the pilot the coordinator reports quality and the owner decides which lanes open to Muse.

## Gemini (Jules): removed 3 Nov 2026 (owner: "remove jules (gemini)")
Kept for the record. Gemini/Jules no longer receives jobs; its branches no longer trigger CI. Pilot history:
- First job: **row C**, Contacts Edit Info "Find by TTb name" filter (PENDING_CHANGELOG 31 Oct). Small, lane C only.
- After the pilot the coordinator reports quality (correctness, rule-following, test discipline) and the owner decides whether lanes K, L and Y open to Gemini.

## Current assignments (update on every change)
**ROLE SWITCH (owner 16 Nov, usage limit reached; see OWNER_DIRECTIVES.md):** Muse reviews only, at the exact head SHA. GPT builds, merges and coordinates: Codex builds, ChatGPT coordinates jobs and lanes, and GPT merges. Claude is not the coordinator, builder or merger while this stands. Owner still decides releases and deployments. The sections below predate this switch; where they name Claude as coordinator or reviewer, the switch governs.
**v0.9 HOTFIX (owner exception, 16 Nov):** `tasks/roster-intake-clash-stuck-claim.md` (Codex; Claude reviews; mirror in v1).
**v0.9 DEVELOPMENT STOPPED (owner 15 Nov: "school ends 20 nov, lets push last version for v0.9 out (build and deploy) then stop development on v0.9 already").** v0.9.9y (deployed, bundle `deploy/2026-11-15-v0.9.9y`, source d9d180c) is the **final v0.9 release**: main has no v0.9 product change since y (checked 15 Nov), so no further build is needed. No new v0.9 tasks, PRs, rebases or releases. Only exception until Fri 20 Nov (widened by owner 15 Nov for flexibility): **any fault the owner raises**, not restricted to relief allocation, saving, publishing or messaging. Built by Codex as one hotfix PR, reviewed by Claude, released as a one-change hotfix and mirrored in v1. After 20 Nov: frozen; all work goes to v1.
**v0.9 state (15 Nov, owner):** v0.9.9y is live (x + #153 ad hoc hotfix; release record #156 merged). Owner is planning the move to v1. Closed on owner's word: Muse release PRs #110, #113, #117, #122, #126, #135, #141; #103; backlog #72, #40. Full D1 backup still fails live after #127 (lease expiry during the timetable-cache stage); owner chose to ignore it pending v1. Employment email confirmed received (13 Nov).
**Muse retired (owner 14 Nov).** Claude coordinates v0.9: assigns tasks, writes prompts, reviews every Codex PR at its exact head, builds releases. Codex is the only v0.9 builder. Muse's unfinished work moves to Codex (reassign only when the owner prioritises it): `overlord-dismiss-past-unknowns` (lane L), `calendar-deploy-version-check` (lane K), `roster-consecutive-after-gap` (lane R), `edge-queue-google-authority` (remaining phases), Venues ownership, draft PR #103 (LORD return assertions). Muse's release PRs #110, #113, #117, #122, #126, #135, #141, #143 are records; the owner closes them when convenient. Deployed: v0.9.9x (bundle `deploy/2026-11-14-v0.9.9x`).
**Codex, lane R HOTFIX (owner 14 Nov, before Mon 16 Nov), reviewer Claude:** `tasks/roster-adhoc-inactive-regression.md`: #38 blocks activated ad hoc relief teachers (inactive in Contacts by design) from search, manual assign, auto-allocate and WhatsApp. Jumps the queue.
**Done 13 Nov (merged #127, #130; awaiting deploy). Owner exception ended; Muse reviews again.** Was: Codex, lane R URGENT (owner 12 Nov), reviewer Claude: 1) `tasks/roster-d1-full-backup-fix.md` (no full D1 backup has ever verified), then 2) `tasks/roster-d1-employment-mail-dispatch.md` (Daily Employment Update not sent since 6 Nov). Owner exception: Claude reviews; Muse does not review these two; all other Codex tasks keep Muse as reviewer.
**Codex, lane R URGENT (owner 11 Nov):** `tasks/roster-relief-instructions-info-only.md`: relief instructions are info only, never block a report, always reach the relief teacher (Roster duty details + WhatsApp). Muse reviews. Supersedes `roster-intake-instruction-edit` and `roster-intake-instruction-orphan-close`.
**PR plan while Claude is away:** `plans/2026-11-handover-pr-plan.md` (Codex C1-C13, Muse M1-M4, owner decisions).
**Reviewer handover (owner 6 Nov):** Muse reviews Codex PRs; Codex reviews Muse PRs; owner merges. See `HANDOVER_REVIEWER.md`.
**Codex priority (owner 6 Nov 12:50, "put priority")**: A) roster-intake-overlap-message (Review report on D1 + plain reasons) and B) roster-d1-parity-sweep (inventory PR today, then ports) come first.
**Codex order (owner 6 Nov ~10:20, "follow your order")**: 1) #87 Drive outputs (approved pending CI) → 2) roster-stapler-always-effective → 3) deploy-contacts-catalogue-sync (replaces #83) → 4) calendar-stale-dispatch → 5) roster-assign-relief-export-day → 6) old backlog (PRs from 1-4 Nov: rebase/re-verify or close) → allocation rules rework (rules book) when the owner starts it. Supersedes the 'clear the backlog without stopping' order recorded in PR #88.
Edge queue with Google authority (owner 6 Nov): `tasks/edge-queue-google-authority.md`: **Muse, all phases** (module + Deploy, then Venues, then Contacts); Codex keeps deploy-contacts-catalogue-sync.
Codex, lane R (owner 6 Nov): `tasks/roster-allocation-rules-rework.md`: owner reworks allocation rules in natural language directly with Codex; rules book first, shadow mode before switching.
Codex, urgent lane R (owner 3 Nov 08:37): `tasks/roster-peer-quota-override.md`: colleague approval may exceed weekly R.

Muse pilot (owner 3 Nov): 1) `tasks/overlord-dismiss-past-unknowns.md` (lane L UI), then 2) `tasks/calendar-deploy-version-check.md` (lane K tooling). Review by Claude before any next Muse task.
Codex (reassigned from Muse by owner 6 Nov ~05:45): `tasks/deploy-contacts-catalogue-sync.md` (Deploy/Contacts), continuing from Muse's PR #83.
Muse, owner exception 6 Nov ~01:30: `tasks/stapler-add-tile-teacher-search.md` (Stapler UI only, roster-stapler-ui.js; disjoint from Codex's lane R files). One PR at a time: finish the Contacts task first unless the owner says otherwise.

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

## V1C: isolated v1 Core contracts, owner-authorised 12 November 2026

This scoped entry applies only to v1 T1A and overrides the general coordination/reviewer defaults above for that task. ChatGPT coordinates v1; Codex builds T1A; Claude independently reviews each exact implementation head without editing Codex's branch. Muse retains v0.9.9* production coordination and its existing rules and responsibilities.

Owner instruction: "sufficiently released. overwrite gate conditions, proceed". T1A proceeds ahead of Venues; the production claims and release PR #117 review are not taken over by this task. Claim and exact allowlist: `tasks/v1-core-t1a.md`. V1C covers only the isolated `v1/core` contract library, its named tests and contract documentation. This does not reopen permission policy or authorise T1B–T1D, production authentication changes, merge, deployment, infrastructure, migration or live-data operations. Existing production coordination rules remain unchanged.

## V1C T1B extension: bounded Contacts read library, 12 November 2026

Owner accepted the recommendation to implement the bounded T1B package after reading the revised plan and final addendum at `99b56377edf8cb34d05fccac671e3fbb65962ca4` ("take your recommendation"). Codex owns `tasks/v1-contacts-t1b.md` on `codex/v1-contacts-t1b`; ChatGPT coordinates v1 and Claude reviews the exact head. The task's exact 14-path allowlist controls; this entry does not extend T1A or production permissions. Muse retains v0.9.9* responsibilities. Owner resolves actual competing allocations.

The deliverable is an isolated read-only contract library with injected providers, synthetic tests and documentation. F5 stays open. No authoritative store, durable observation writer, Core changes, Contacts writes/migration, T1C/T1D implementation, production integration or deployment is authorised. Official T1B-01 and T1B-02 remain Not tested.

## V1C Package A: missing authority evidence contract, 13 November 2026

Owner explicitly authorised Package A of the queue at `110bf5838b4a9c95735d503f42587dd0d1f34a40`. Codex implements `tasks/v1-authority-evidence-missing.md` on `codex/v1-authority-evidence-missing`; its exact eight-path allowlist controls. ChatGPT coordinates; Claude independently reviews the exact head. Only Core's reason mapping and the Contacts adapter change runtime behaviour. No Core authority/audit implementation, store, production, acceptance writes, merge or deployment. Owner also permits one independent B–D design/documentation PR alongside A; no concurrent additional implementation PR. Muse's production responsibilities and existing claims remain unchanged.
