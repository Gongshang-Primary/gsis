# roster-cutover-diagnostics: name the drift, check it early, retry by itself (row G)

- Status: implemented locally; exact-head CI pending (implementer: Codex)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026 19:10
- Branch: codex/roster-cutover-diagnostics
- Base SHA: b8612f5e85736eccb09233f8dbb49b691c39991c (current main at start)
- Current head SHA: see the PR for the exact published head
- PR: pending exact-head verification
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

## Implementation and scope notes

Model: Codex. Only items 2, 3 and 7 are implemented. The complete stored-view source digest and activation decision remain unchanged. Capture stores 16-hex per-part digests in `ROSTER_EDGE_SNAPSHOT_PARTS`, bounded below 9 KB. Matching metadata supplies added, removed and changed part names; old, corrupt or unrelated metadata cannot override the full digest.

`edgeDrift` reads the current Google snapshot under the existing Admin requirement. The Worker selects the retained import and passes its accepted source digest. Current main does not populate the session's `source_digest` until manifest binding, so the route also reads `preparationStatus().result.sourceDigest` during preparation. Status and import replies expose that same accepted digest without changing the schema or import source. Drift never advances or cancels an import.

Two necessary canonical dependencies extend the original file list: `roster-update/public/_worker.js` adds only `drift` to the existing preparation allowlist; `shared/edge-setup.html` supplies the button template. Both remain in lane R. The HTML in `public/` and `roster-update/public/`, and all backend/Worker copies, are regenerated with `npm run build`. The shared template hides the Roster-only check on Deploy.

Transient retries reuse the exact request/session. Only 502/503/504 without another code, the two named bridge codes and network failures qualify. Any 4xx, cutover code, other code or restart requirement stops. Ten consecutive failures stop; accepted progress resets the count, lease polling alone does not. Retry delays rise from 1 s to 30 s; the existing preparation lease remains intact. The optional 30-minute background drift poll is omitted to keep this PR small.

## Verification

Regression tests first failed for missing capture fingerprints, the missing gateway route and lack of automatic retry. New tests exercise backend fingerprints and read-only drift, signed gateway authentication/current Admin/origin checks, captured digest selection, unchanged D1 import rows, stable request/session retries, the ten-failure cap, progress resets and a concurrent drift check. Existing setup tests now expect automatic recovery; an activation regression asserts the exact refusal text and unchanged imported heads.

`TZ=Asia/Singapore npm run build` passes. The 28 focused programs pass, including the repaired isolated export fixture, all `roster-cutover-freeze-*`, all `roster099-*` and `edge094-setup`. LORD reaches its browser checks, then stops because the local Playwright Chromium executable is absent. The local broad run encounters the existing missing `/tmp/chromium` executable; these browser failures are not reported as passes. Full verification will use the branch CI with its installed Chromium.

## Authority, rollback and remaining gates

No production state, authority/configuration, provider messages or deployment changes. One additive Google diagnostic property is written only at capture. Rollback restores the prior code; the property is harmless and retained imports remain usable. Existing imports without matching part digests can still be checked for current/not-current, but cannot name their changed parts. No deployment or live cutover acceptance is claimed. PRs #38, #40, #41 and #42 are untouched.

## Review
Not started.

## Deployment
Not deployed.

## Handoff
Next action: finish exact-head CI, then open a draft PR on `codex/roster-cutover-diagnostics` naming Claude and that head. Owner decides merge and deployment.
