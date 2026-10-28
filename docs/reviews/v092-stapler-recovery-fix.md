# STAPLER durable recovery and cap warning correction

25 October 2026. Local source implementation and synthetic browser/backend validation for GSiS 0.9.2. No live school reads, saves, messages, or deployment were performed. The starting diagnosis is `v092-stapler-cap-diagnosis.md`.

## Browser recovery

The first-send guard was correct to stop a mutation when its request identity could not be retained. The storage implementation was the limitation: a full base/current plan pair could exceed 1 MB, and localStorage had to share its small origin quota with retained drafts. The fix keeps the guard and uses native asynchronous IndexedDB for large recovery records.

`roster-stapler-ui.js` now captures each complete snapshot before enqueueing its write. The snapshot retains the exact pending request ID and command; matching `plan` and `basePlan` inputs remain compact references into that same saved snapshot. Writes are serialized for the active draft. IndexedDB changes use a read/write transaction with strict durability where supported, wait for transaction completion, then independently read back the exact bytes before dispatch. The Save busy gate begins before the asynchronous write, so double clicks cannot create a second command. Leaving the current view during persistence prevents dispatch from its old context.

A transaction compares the retained bytes before updating. If another tab changed that key, the write creates a new per-tab/date fork. The localStorage fallback also forks foreign-writer records and verifies exact read-back; a successful `setItem` alone is insufficient. No storage pruning or all-site clearing is performed. If both engines fail, the new mutation is not sent, the dirty plan stays in memory, and the error names each storage engine and exception (for example SecurityError versus QuotaExceededError). The planner exposes Download recovery JSON, including unsaved plans and pending snapshots.

Schema 1/2 localStorage drafts remain readable. A legacy record is removed only after its replacement commits to IndexedDB and matches on a separate read. Failed migration retains its original bytes. Recovery scans both stores within the exact account/date prefix and offers other retained copies for recovery or JSON download. An incompatible-baseline retained copy is available for download. A successful online acknowledgement conditionally removes only its own matching recovery record; other tabs' records remain. Async restore and recovery offers check the active view/date/load ticket before applying.

The existing localStorage-only recovery regression explicitly disables IndexedDB to continue exercising the fallback under real origin quota pressure. Its snapshot measurements remain 1,342,545 characters for the dirty plan and 1,342,776 with compact pending metadata.

## Weekly cap warnings

The UI now displays every available finite configured cap in `weekly-cap-unverified` warnings, alongside the server-owned reason when present. A missing/invalid cap is identified explicitly. All warning text remains escaped.

Reasons flow from published Deploy analysis (`r.reason`) through the quota projection, selected-week timetable checks, workload classification, confirmed STAPLER accounting, allocation balances, and saved workload warnings. The quota projection cache schema advances to 2 so cached old projections cannot hide the newly supplied reason. Reasons cover invalid cap/basis, missing non-teaching reservations, invalid reservation values, unknown activity codes, a missing active baseline on a named date, zero/multiple teacher timetable matches, upstream Deploy verification failures, and invalid adjusted totals.

The optional diagnostics argument to `capWorkload` preserves its number-or-null return contract. Cap counting, conservative verification, imported-plan warning policy, and allocation limits are unchanged. Existing saved warnings that predate the reason field display their known cap immediately; the reason is populated when the server next recomputes the warning on Save/Confirm.

No live teacher cap or failure reason was inferred. The supplied screenshot establishes Ahyoung's saved total/cap of 29/26. It does not establish Kavitha's or Fazdriel's live cap or which upstream input was unverified.

## Evidence

Red tests were observed before implementation:

- With localStorage blocked and native IndexedDB available, Chromium made zero saves instead of the expected one.
- The warning UI omitted the configured cap of 1 from a synthetic unverified warning.
- Backend cap-reason assertions received undefined instead of the source reason.
- A cached schema-1 quota projection hid the current workload reason until its schema gate was updated.

The new native Chromium test uses a 100-teacher plan exceeding 1 MB and covers native localStorage quota exhaustion, IndexedDB persistence before first send, exact command/snapshot reload after an accepted save with a lost response, duplicate clicks, copied-tab pointer forks, conditional own-record cleanup, both-store no-send, exported recovery JSON, successful and failed schema-1 migration, account/date isolation, localStorage fallback, silent write/read-back failure, and leaving during pre-send persistence.

Fresh focused validation passed 24 scripts, using `NODE_PATH=/workspace/scratch/2c52ae6e6b97/test-runtime-091/node_modules:$CODEX_PRIMARY_RUNTIME_NODE_MODULES` and Chromium at `/workspace/scratch/2c52ae6e6b97/test-runtime-091/chromium/chromium`:

- `stapler080-date-retention.cjs`, `stapler080-pending-request-retry.cjs`
- `stapler0810-planner-ui.cjs`, `stapler0810-planner-browser.cjs`
- `stapler0812-backend-recovery.cjs`, `stapler0812-draft-recovery-browser.cjs`
- `stapler092-cap-reasons.cjs`, `stapler092-indexeddb-recovery-browser.cjs`
- `stapler710-browser.cjs`, `stapler711-ui.cjs`, `stapler712-lock-browser.cjs`
- `stapler714-import-ui.cjs`, `stapler715-loading.cjs`, `stapler715-loading-browser.cjs`
- `stapler717-reopen-ui.cjs`, `stapler718-lifecycle-ui.cjs`, `stapler718b-save-recovery-browser.cjs`
- `stapler718c-import-policy.cjs`, `stapler718c-persistence.cjs`, `stapler718c-warning-ui.cjs`
- `stapler719-contacts-import-ui.cjs`, `cap708.cjs`, `release086-ut-cap.cjs` (8 subtests), `roster705-quota.cjs`

The first broad focused pass exposed old synchronous test assumptions and warning-object expectations; tests now wait for the durable Save gate or restored planner DOM, and assert the reason field. An empty `/tmp/chromium` placeholder was replaced with a symlink to the supplied real executable for legacy tests that hardcode that path. The final 23-script rerun passed all scripts; the added cache-schema regression then passed separately. `git diff --check` passed.

The integrated full-project test command, generated mirror synchronization, package validation, and deployment are owned by the release/root task. This report claims the focused checks above, not an unrun complete-suite result. Browser storage remains subject to browser/user eviction; failure of both stores deliberately retains the no-send guard and requires keeping the page open or downloading the recovery file.
