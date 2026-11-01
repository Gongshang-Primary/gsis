# roster-cutover-diagnostics: name the drift, check it early, retry by itself (row G)

- Status: claimed (implementer: Codex)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026 19:10
- Branch: codex/roster-cutover-diagnostics
- Base SHA: current main (4a93be7 or later)
- Current head SHA: none yet
- PR: none yet
- User-authorised scope: owner 1 Nov 2026 ~19:00: "do 2,3,7 now" (items from Claude's cutover improvement list), "do up PR, let codex code".
- Files/domains owned (include generated outputs): `backend/RosterEdgeMigration.gs` (and its regenerated copy in `backend/Code.gs` and the built Roster backend), `roster-update/public/edge-roster.js`, `shared/edge-setup.js` (and built copies `public/edge-setup.js`, `roster-update/public/edge-setup.js`), `roster-update/public/edge-setup.html` if a button is needed, focused tests, this record.
- Out of scope: changing what the digest covers, closing the freeze gap for webhooks, top-up import (items 1, 4, 5; separate rows). Any weakening of the activation fence.
- Acceptance checks: below.

## Why
1 Nov cutover: import `8ff7f19b` completed and passed Claude's parity check (digest `d6d3eb31…`, 13,114 + 21 records). Activation then refused, after a 5.5-hour freeze: "The imported snapshot is no longer current." Nothing tells us which part of Google changed, and we learned it only after 3 hours of import. Separately, slow preparation steps (125 s bridge timeouts, 503 "The Google adapter did not return a verified result") made the owner wait about 7 minutes for the lease and press retry by hand.

## Items
### Item 2: name the changed part on refusal
- At snapshot capture (`rosterEdgeSnapshot_` callers in `backend/RosterEdgeMigration.gs`, the v2 capture at about line 151 and the envelope at about line 264), compute a short digest per top-level part of the stored view (each key of `value.state`, plus `index`), and keep it with the snapshot's `sourceDigest` (for example one Script Property `ROSTER_EDGE_SNAPSHOT_PARTS` = `{sourceDigest, at, parts}`; keep it well under the 9 KB property limit, for example 16-hex digests).
- In the `edgeFence` refusal (about line 81, "The imported snapshot is no longer current…"), when the stored parts belong to `p.sourceDigest`, compute the current parts and append the plain-language list of changed parts, for example "Changed since the snapshot: inboxMessages, peerMail." Keep code 409 and the same refusal; never change authority.
- Refusal text must reach edge-setup unchanged through `signedBridge` and the `activate` route in `roster-update/public/edge-roster.js`.

### Item 3: drift check during the import
- New admin-only operation `edgeDrift` (Apps Script), read-only: computes the current snapshot digest and returns `{current: boolean, sourceDigest, changed: [part names] | null, checkedAt}` for a given `sourceDigest`. It must not write anything except reading the stored parts.
- New edge-setup operation `drift` routed in `edge-roster.js` (admin session, same checks as `status`): passes the retained import's source digest (session `source_digest`, available as soon as capture finishes).
- edge-setup: a "Check snapshot is current" button, usable while the import runs (it must not interrupt the import loop) and after it completes. Shows "Current" or "Changed: …".
- Bonus if cheap: the import loop runs the drift check automatically every 30 minutes during staging and shows a warning, without stopping the import.

### Item 7: automatic retry on transient failures during import
- In `shared/edge-setup.js` `run('import')`: when a step fails with a transient error (HTTP 502/503/504, `ROSTER_BRIDGE_RESPONSE`, `ROSTER_BRIDGE_ERROR`, a network failure), show "Google step took too long. Retrying automatically in N s (attempt k of 10). Keep this tab open." and resume the same request (same request ID and session). The Worker already answers `preparing` while the timed-out step's lease (`PREPARATION_LEASE_MS` = 420000) is held, so the loop simply waits it out.
- Reset the attempt count after any progress. Stop and show the error after 10 consecutive failures, on `requiresRestart`, any 4xx, `ROSTER_CUTOVER_*`, or any code that is not transient.
- `call()` should attach the HTTP status to the thrown error.

## Acceptance checks
1. Backend test: snapshot parts stored at capture; a change to one part (for example `peerMail`) makes `edgeFence` refuse with that part named; no authority change on refusal.
2. Backend test: `edgeDrift` returns current=true when unchanged and the changed part names when changed; it writes nothing.
3. Worker test: `drift` requires the admin session and returns the bridge result; it cannot start, stop or change an import.
4. Browser/unit test: a 503 during preparation retries automatically and the import completes; a 409 or `requiresRestart` stops at once; 10 consecutive failures stop with the error.
5. Existing cutover tests stay green: `roster-cutover-freeze-*`, `roster099-*`, `edge094-setup`, the full suite in CI.
6. Rebuild generated outputs with `npm run build`; no hand edits to generated files.

## Notes for the implementer
- Lane R is serial. Open PRs #38, #40, #41 and #42 are held by the owner until after Monday's first busy period. #42 also edits `shared/edge-setup.js` and the import progress code; base this branch on main and keep the edge-setup change small so #42 can rebase after.
- The owner may want to use this before the next cutover attempt. Ship it as a small, separate PR.

## Verification
Not started.

## Review
Not started.

## Deployment
Not deployed.

## Handoff
Next action: Codex claims, builds on `codex/roster-cutover-diagnostics`, opens a draft PR naming Claude as reviewer and the exact head SHA.
