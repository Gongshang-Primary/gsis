# Roster cutover freeze implementation plan

> For agentic workers: execute this approved task inline with Superpowers executing-plans. The owner supplied the scope and execution order; no further design approval is needed.

Goal: keep the Google source unchanged from capture until verified D1 activation, with an explicit Admin cancellation path.

Architecture: reuse the existing ScriptLock then notification/UserLock ordering and central legacy-writer guard. A Script Property is the Google writer authority; a small primary D1 control row lets background jobs skip work without another Google request each minute. Immutable preparation files remain writable in their private folder. Neither marker selects D1 authority.

Spec: docs/coordination/tasks/roster-d1-cutover-freeze.md.

Constraints: Google stays authoritative until the existing verified cutover; no deployment, real freeze, live flags, records or messages. Preserve request identities, source digests, pending transport and provider uncertainty. Use Asia/Singapore. Build before test after a branch switch; green full Node and LORD before PR. Claude reviews exact head; owner merges. Claude owns the runbook update after F merges, per LANES.md.

Review focus: a writer already holding either lock; capture uploads while frozen; delayed/replayed freeze and cancellation responses; partial or lost activation acknowledgements; queued reports/wakes and the four-hour warning.

## Task 1: Google freeze and writer boundary

- [x] Add behavioral VM tests in tests/roster-cutover-freeze-backend.cjs. A frozen user save, intake commit, notification claim/commit, archive and maintenance must fail before mutable I/O; the real snapshot digest remains unchanged. Lock contention must set no freeze. Same-ID retry stays stable; a cancelled request cannot freeze again.
- [x] Implement status, freeze, cancel and service-only completion helpers in backend/RosterEdgeMigration.gs. Store actor/time/request identity and audit receipts outside imported mutable domains. Freeze acquires ScriptLock then UserLock. The shared guard returns 423 and ROSTER_CUTOVER_FROZEN.
- [x] Preserve preparation reads and private immutable upload writes while frozen. Keep the existing D1 writer fence active for all legacy calls.
- [x] Guard any direct maintenance/archive/audit writer that bypasses central commits. Rebuild and run the new VM checks plus packed capture and migration regressions.

## Task 2: Worker flag, activation and queue preservation

- [x] Add real SQLite tests in tests/roster-cutover-freeze-store.mjs for control-row CAS, retries, stale acknowledgements and age/overdue metadata.
- [x] Implement shared/roster-cutover-freeze.js. Begin the D1 hold before the signed Google freeze call. Failed/unknown outcomes retain the hold; only verified cancellation/completion releases it.
- [x] Wire roster-update/public/edge-roster.js Admin migration actions and status. Complete the Google freeze only after both D1 heads activate; retain it on partial failure. Existing unfrozen changed-source activation still fails.
- [x] Wire notification-worker/index.js to skip Google jobs using the D1 marker. Queue messages retry, and durable report rows remain untouched. Add health codes to shared/edge-health.js. Other D1/R2 receipt capture is still accepted.
- [x] Run integration tests for frozen import/activation and exactly-once queued absence replay.

## Task 3: Operator controls and verification

- [x] Add Freeze Google for cutover and Cancel freeze controls to shared/edge-setup.html/js using the existing confirmation dialog. Show age and a four-hour alert without auto-release; expose the same metadata on System Health.
- [x] Add DOM/gateway tests for Admin-only actions, current identity, same-origin checks, retained request IDs, warning and cancellation.
- [x] Update the task record and changelog; give Claude concrete runbook instructions. Regenerate all canonical outputs.
- [ ] Run npm run build then npm test locally, record any unavailable comparison/browser inputs, and push the exact source tree to its branch for the real full CI gate.
- [ ] Obtain a fresh whole-branch review. Fix blocking findings with failing-then-passing tests. Open one lane-R PR only after exact-head Node and LORD CI succeeds.

## Progress

Claim main: 0860d6b29b03fb55544cc0f452851009364570b4. Local exact tree: ee2e0c36c3032b40d5b9357b16819e9949e63491. Latest main also contains Contacts claim 77915a3, to reconcile before handoff. #30/#29 temporarily closed; branches retained. Contacts lane C is isolated in a separate checkout.

Ruling: private preparation-file creation bypasses only the temporary freeze, never the established D1 legacy fence. Without this exception the requested capture would fail during its source upload.

Ruling: open the restoration activation route only for a confirmed frozen control row, with the existing preparation flag and all current Admin/source checks. Without this narrow route the task would not unblock cutover. This grants no automatic activation or flag change.

Ruling: Claude updates the cutover runbook after F merges, as LANES.md assigns. The task record contains concrete instructions for that update; the overlapping runbook is not edited here.

Implemented: all three tasks' product paths and seven behavioral programs. Backend, store, signed control, queue/replay, activation, gateway and DOM checks pass. Focused/full-suite evidence and independent whole-branch review remain the release gates.

Verification checkpoint: a clean build completed all 18 components. The focused regression runner passed all 19 programs, including all seven new freeze programs. Full local npm test and fresh whole-branch review are running; full remote CI remains required before PR creation.

Independent advisory review found four Important integration gaps at cc63509. All have failing regressions and fixes: outer dispatch, full private upload transport including missing folder, post-lock planning-lease pruning, and both-active completion recovery after reopening setup. A clean rebuild passes. Focused revalidation and follow-up advisory review precede publication; exact-head full remote Node/LORD remains the PR gate. Local full Node and LORD encounter the unavailable Chromium binary and are not claimed green.

Post-review verification: clean build of all 18 components; all 23 focused programs pass, including the strengthened real dispatcher/Drive upload, lock-interleaving and refreshed completion DOM regressions. Full exact-head remote CI and Claude review remain required.

Follow-up advisory review also identified frozen restart cleanup at the outer dispatcher. Admin-only edgeExportAbandon now remains reachable while frozen. A real SQLite restart traverses the signed Worker RPC and actual Google dispatcher, retains immutable source evidence after a lost cleanup acknowledgement, retries to completion and leaves both freeze holds and the source digest intact. The regression failed before the exemption and passes after it.
