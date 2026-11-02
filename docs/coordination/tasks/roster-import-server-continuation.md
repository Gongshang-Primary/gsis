# roster-import-server-continuation: R7 browser-independent preparation and staging

- Status: verifying
- Model: Codex
- Reviewer: Claude, exact final PR head
- Branch: codex/roster-import-server-continuation
- Base: R2 stack at 9371a1a51e22c167fbb19189990ed64d486ee666
- User-authorised scope: R7 in the revised attempt-3 queue. A Worker advances preparation and staging without a browser tab; stage 2 to 4 independent parts concurrently; page shows progress.
- Owned files: shared/roster-import.js; roster-update/public/edge-roster.js and import runner; shared/edge-setup.js; roster-update/public/_worker.js; notification-worker/index.js; health job label; related tests and generated outputs.
- Out of scope: live activation, live Google writes outside authorised preparation, notification delivery, policy and held #38/#40-#48.
- Acceptance: actual gateway starts one durable import; cron/Queue finishes it with no page polling; stalled pages do not stall it; bounded 4-part parallel staging preserves object dependencies, exact receipts, current Admin checks, restart and unknown-outcome recovery. Heads stop at imported.

## Plan
Reuse existing immutable import and preparation receipts. Add one durable continuation lease and the original authenticated identity. The Worker revalidates the Admin on every bounded continuation, parallelises only parts before the next object dependency barrier, and retains ambiguous preparation leases. The UI polls status only for the server-driven protocol. Existing direct one-step helpers remain available for regressions and recovery.

## Verification
The new actual-gateway regression first failed on the missing serverDriven protocol. Build now succeeds. Actual Pages start, signed dedicated wake, isolated Queue completion without page polling, current Admin revocation, lost capture and part responses, retained sibling receipts, concurrent runner claims, actual cron during freeze, segment/object dependencies and status-only UI pass. Existing one-step import, setup, reset, cron idle, dispatch idle and preparation checks are retained. Full CI pending. No deployment or live authority/data/message change.

Deployment prerequisite: install the matched notification Worker against the same D1 and private R2, Roster/Calendar adapter URLs and shared API secret as Pages. Existing minute cron advances jobs even if the optional immediate Queue wake fails. A dedicated import wake does not run delivery jobs.

## Rebase after R1 merged, 2 November 2026
Model: Codex. Rebased onto updated R2 #54, which is based on current main b0c30bed and includes best-effort publication caching. Preserves merged R1 and lease-digest fixes. Generated files rebuilt by npm run build without hand edits. Actual Pages/isolated Queue continuation and stalled-page UI checks pass; fresh full CI must use the new head. No live import, authority change or provider send.
