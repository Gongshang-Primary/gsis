# PR plan while Claude is away (from 6 Nov 2026 afternoon)

Owner: "plan a set of PRs meant to handover to muse and codex while you take a token-reset break".
Rules: `docs/coordination/HANDOVER_REVIEWER.md` (Muse reviews Codex; Codex reviews Muse; owner merges; exact-head reviews; canonical build no diff; full CI). One PR per task; Roster lane R stays serial within each builder. Every PR names its task file and reviewer.

## Live state
- Live: v0.9.9n on D1. Built, awaiting owner deploy: **v0.9.9o** (Drive steps doc 1i4bltWdXjnAGUppxoY6pIsX4hb0pAJ6YLV9z3nNEOac).
- Open now: #94 Muse Venues findings (Codex reviewing in #97), #95 Codex WhatsApp v2 contracts, #96 Codex intake overlap + Review report on D1.

## Codex — builder queue (Muse reviews), in order
| # | PR | Task file | Acceptance (short) | Release |
|---|---|---|---|---|
| C1 | #96 intake overlap + `intakeReview` on D1 | roster-intake-overlap-message.md | Review report works on D1 with Google parity; plain overlap reason; exact duplicates auto-resolve; card shows true state | p |
| C2 | D1 parity inventory (docs-only) | roster-d1-parity-sweep.md | `docs/roster/D1_PARITY.md` complete with risk + action per operation; harness test | p (docs) |
| C3 | #95 WhatsApp v2 contracts (contact_review, relief_unacknowledged, relief_urgent_smc) | docs/reference/whatsapp-v2-buttons-status.md | exact approved bodies/buttons as contracts; flags stay off | p |
| C4 | Drive outputs root cause | roster-drive-outputs-bridge-error.md | after the owner's o test gives the real reason; fix + test; outputs can stay enabled | p |
| C5..Cn | D1 parity ports, highest risk first (one PR each) | roster-d1-parity-sweep.md | each port has a Google/D1 parity test; CI guard against new Google-only ops | p / q |
| C6 | My Calculations headline = completed count | roster-calculations-relief-done.md | headline matches the card; R% separate | q |
| C7 | "No relief instructions" one-click submit | roster-absence-no-instructions-submit.md | one click saves; confirm if text typed; no double submit | q |
| C8 | LSE notice wiring | roster-lse-notice.md | notify duty SMC at next timer when LSE reported (template must be APPROVED first) | q |
| C9 | Live updates A: idle backoff | roster-live-updates.md | 60 s active / 5 min idle / none hidden | q |
| C10 | Old backlog triage (#38, #40, #41, #42, #46, #47, #48, #58, #60, #72) | LANES.md | per PR: rebase + re-verify, or close with a note (owner decides close; list in a docs PR) | — |
| C11 | Offline Excel export | roster-export-excel-local.md | export from IndexedDB after reload offline | r |
| C12 | Live updates B: push (Durable Object) | roster-live-updates.md | owner deploy steps documented; after a week on D1 | r |
| C13 | Allocation rules book (docs-only), then shadow mode | roster-allocation-rules-rework.md | only when the owner starts the conversation | later |

## Muse — builder queue (Codex reviews), in order
| # | PR | Task file | Acceptance | Release |
|---|---|---|---|---|
| M1 | #94 Venues D1 route findings → #67 "stale" false-alarm fix | venues-muse-ownership.md | findings merged; only a real pending token alerts | p |
| M2 | Stapler teacher search | stapler-add-tile-teacher-search.md | reuse existing combobox; partial search; same staffId | p |
| M3 | Edge queue design note (docs-only) | edge-queue-google-authority.md | data model, admission, dispatch, receipts, Uncertain, fallback, switch-back | — |
| M4 | Edge queue P1: shared module + Deploy (default `direct`) | edge-queue-google-authority.md | builds on #90; tests as listed | q |

## Muse — reviewer and release coordinator duties
- Review every Codex PR at its exact head within the day; record `docs/coordination/review/pr<N>-muse-review.md`.
- Release **p** when C1, C2, C3 (and C4 if ready) plus M1/M2 are merged: follow HANDOVER §4; note which deploy files changed; Drive steps doc optional (owner can read DEPLOY_STEPS.md on the bundle branch).
- Keep `LANES.md` current; mark merged tasks; close superseded PRs only on the owner's word.

## Owner decisions waiting (ask, do not decide)
1. Deploy v0.9.9o (and do its post-deploy steps: confirm 10/12 Nov Stapler rev 2, one Drive outputs test, withdraw 2 overlapping reports).
2. WhatsApp: switch 5 routes to buttons (config only); later 3 more after C3.
3. Retire the unused templates `relief_final` and `relief_manual_review`, or wire them?
4. Quiet mode on D1: pause only the scheduled allocator for the date being edited? (Claude's suggestion, not yet decided.)
5. Venues: check `VENUES_ROSTER_WORKER_URL` (Venues script) and `VENUES_BRIDGE_SECRET` (Pages) — Muse's #94 may already say what is needed.
6. Opening balances: add 5 Nov relief counts (source: Allocation Audit 2026-11-05.txt on Drive).
7. Close stale PRs (#83, #88, #90/#93 already merged, old backlog per C10).

## Escalate to the owner immediately (do not wait for Claude)
Any live data risk on D1 (mass cancellation, saves failing, WhatsApp to wrong audience), a failed deploy check, or a reviewer disagreement that blocks a priority PR.
