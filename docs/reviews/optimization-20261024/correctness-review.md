# Independent correctness review

24 October 2026. Compared the draft against commit `8b0d350`.

## Outcome

No unresolved material correctness findings in the final inspected diff.

Two findings were resolved during review:

1. Proposed explicit Refresh coalescing trusted completion time. A delayed response from before another tab's save could finish later and suppress that tab's fresh read. The proposed coalescing change was removed; explicit Refresh retains its existing live-check behavior.
2. An accepted old Confirm replay could return a correctly unconfirmed current draft while the UI still said "Plan confirmed". The UI now distinguishes the earlier accepted confirmation from the current draft, with a browser regression.

## Scope

Reviewed `backend/RosterOperations.gs`, `backend/RosterTimetableBatch.gs`, `shared/roster-operations.js`, `roster-update/public/roster-timetable-preload.js`, `roster-update/public/roster-stapler-ui.js`, and affected tests. Traced surrounding authorization, confirmed projections, dated lifecycle changes, command receipts, structural validation, cache marker commits and browser recovery contracts.

Verified that matching revisions still validate immutable baseline and current constraints; compact Confirm tags suppress transport only; historical acceptance does not overwrite current revision or confirmation state; window markers retain the pending/ready commit fence; and incomplete deltas cannot relabel retained old content with a new key.

## Independent checks

All passed on the final inspected sources:

1. `stapler0812-draft-recovery-browser.cjs`
2. `082-domain-stapler-merge.cjs`
3. `stapler0812-backend-recovery.cjs`
4. `roster-next-window-source.cjs`, including its 27 imported timetable backend checks
5. `roster089-cache.cjs`
6. `git diff --check`

Browser checks covered exact pending-command recovery, blocked first dispatch when storage cannot retain recovery, compact Confirm lost acknowledgement and reload, current-draft replay wording, unchanged DOM retention, and changed server content preserving scroll position 1500. An initial browser failure used a viewport expectation from before an intentional context reset; after restoring the viewport before the relevant case, the independent rerun passed.

## Limits

This was a focused change review, not a claim that every GSiS line is defect-free. Execution used local fixtures and headless Chromium. No live Google or Cloudflare latency, simultaneous Apps Script executions, production configuration, school data or physical devices were tested. No source changes, commits, deployments or messages were made by this reviewer.

## Morning concurrency review

Final source review on 24 October 2026 also covered `backend/RosterAllocationRun.gs`, the prepared/manual/scheduled dispatch paths, essential decision audit exports, `roster-operations-ui.js`, and the signed gateway error contract. No unresolved material correctness findings remain in this inspected scope. Generated-source synchronization and the repository-wide suite belong to the parent agent's final verification.

The review resolved these concrete issues:

1. A commit-stage crash without a durable receipt could leave the date blocked indefinitely. An exact retry now acquires the shared writer lock, rereads authoritative receipts, and replaces the old execution fence. A different request waits for expiry. Receipt completion remains authoritative when the status-property write fails.
2. Replacing a cancelled run's dated status marker could resurrect its original request. The reproduced sequence was cancelled A, failed B, then retry A. Cancellation now retains a durable terminal receipt, and both preparation and final commit reject that exact command. A lost cancellation acknowledgement cannot undo the receipt. `receiptStatus` explicitly reports cancellation rather than successful allocation.
3. A duplicate delivery of an actively computing scheduler slot could take the new reporting-only fallback, write the slot receipt, and discard the original allocation while marking it completed. This was independently reproduced against the actual wrapper. The fallback now excludes the same active scheduled slot; the regression confirms two saved assignments, one write, and an allocation receipt. Cancellation and a competing manual run can still preserve scheduled reports without changing that manual run's fence.
4. Successful early scheduler returns could leave a running/cancelling marker. They now settle the status. Same-request retries retain increasing log sequence numbers, so the UI does not discard a new attempt as old status.
5. Unknown allocation retries could lose their request ID on lifecycle HTTP 409 responses. The UI now retains the exact payload through those codes and browser reload, persists recovery before first dispatch, and blocks dispatch if storage fails. The gateway exposes only the required lifecycle codes. Cancellation wording distinguishes a confirmed save from an uncertain save stage; a late cancellation reply cannot alter its successor's controls.
6. A same-value A-to-B-to-A human change needed an explicit conflict choice. Server-issued decision identifiers and per-cell versions now survive return-to-automatic; token-bound resolutions are rechecked at commit. Legacy tokenless requests require a current day/document fence. The comparison UI shows the competing editor and requires a choice even when visible values return to the original value.
7. Compact allocation patches omitted returned cell state/provenance. Both maps now merge into the retained view. Human decision and conflict-choice audits also survive disabled verbose logging through the real export capture path.
8. The parent agent's production build check caught logical assignment syntax in the new decision-stamping helper. It was replaced with ordinary assignment for the project's ES2020 target; generated-source rebuilding is part of the parent's final checks.

Independent checks passed:

- `roster0812-allocation-run.cjs`: all 17 final lifecycle regressions, including cancellation/commit races, crash recovery, same-slot duplicate delivery, reporting after cancellation and the morning cutoff.
- `roster0812-human-decisions.cjs` and all eight `roster082-backend-merge.cjs` cases.
- `roster0812-allocation-monitor-browser.cjs` in Chromium and `roster0811-conflict-save.cjs` with real domain provenance.
- `roster097-batch-errors.mjs`, exercising the signed `doPost` and gateway error envelope.
- A read-only integration probe fed two actual compact backend manual-save responses (No Relief, then clear) into the production `applyAllocationPatch` function. The retained state and new provenance token matched each accepted response.
- `git diff --check`.

The final lifecycle suite was rerun after the duplicate-scheduler fix. The two reproduced races above failed before their fixes and are now covered by explicit regressions. Checks use deterministic local adapters and browser fixtures, not live simultaneous Apps Script workers. A window with its own pending automatic request deliberately waits before another local mutation; its log and cancellation controls remain usable. A scheduled run or another editor's run does not disable local editing. No production latency or live cancellation response time is claimed.

## Full-suite fixture follow-up

The parent agent's full suite exposed a missing Apps Script utility in `roster082-backend-teacher-reads.cjs`: its fixture provided date formatting and UUIDs, but neither `Utilities.DigestAlgorithm.SHA_256` nor `Utilities.computeDigest`, now needed by plan content tags. The exact failure was reproduced. A minimal Node crypto SHA-256 adapter was added to that fixture; all existing permission, frozen-confirmation, private-data and no-planning-input/no-writer-lock assertions were preserved. All three cases and `git diff --check` then passed. No production change was needed.

`stapler714-import-ui.cjs` also assumed an import would finish after one `setImmediate`. The import now deliberately yields an animation frame before workbook parsing so progress can render. The failure was reproduced, then only that fixture wait was changed to a bounded check for the actual identity-review dialog or Contacts Admin outcome. Its existing mapping, blank replacement, baseline fallback, Admin and stale-parser assertions all passed unchanged. No production change was needed.
