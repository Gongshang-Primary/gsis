# GSiS v0.8.11 validation

23 October 2026. Baseline: v0.8.10a commit `249d591`. No live deployments, school-record mutations or WhatsApp test sends.

## Focused checks

- Actual Chromium IndexedDB: unchanged tags, a single changed plan, overlapping refreshes, timestamp guards, account separation and rollback metadata.
- Timetable browser: initial draw count, status-only updates, suspended-content transitions and retained search input.
- Conflict dialog: per-cell choices, direct save, another same-cell edit, overlapping comparison reads, local-only choices and no implicit publication.
- School-wide absences: inclusive today/tomorrow defaults; complete range read without Calendar/timetable/quota preparation; authorization; selected-record tokens; unrelated saves; atomic conflicting batches; exact lost-response retries; range preservation; past-record protection, including crossing Singapore midnight during context preparation.
- Browser range controls at 390, 620 and 1024 pixels; selection across 40 records and pagination; changing-range response races; exact selected IDs and dates. Gateway handles 70 selected dates in Calendar groups of 62 and 8 followed by one atomic backend command.
- Urgent Message: verified duty recipients, off-duty exclusion, missing mobile isolation, duty/role changes before dispatch, duplicate/lost webhook responses, sent/uncertain outcomes and no-recipient handling. The full 4,096-character Unicode/newline source is recoverable from numbered parts and every encoded part fits the existing template limit.
- Timetable notice copy: both new and eligible queued daily/legacy notices use concise guidance. Published lesson details, eligibility fingerprints, approved template/buttons, private-page acknowledgements and sent-message history are retained.
- Calendar: all 31 built-in checks retained. Calendar backend harness passes 38/38 and Sheets API harness passes 63/63 under the required Singapore timezone. All 118 Apps Script source files parse.
- Independent code review covered cache concurrency, range deletion and retries, urgent forwarding and timetable message simplification. The identified comparison-read race and deletion crossing midnight were fixed and regression-tested.

## Measured work, not production timing

| Fixture | Before | After |
| --- | --- | --- |
| Cell decisions: 122 cells, 1,923 assignments | 122 assignment-history scans | 1 scan, same pinned result digest |
| Open baseline timetable | 4 grid draws | 1 draw |
| Change one cached timetable plan | Unchanged baseline payload serialized | Zero baseline serialization/writes; only missing tagged content written |
| Calendar source cleanup | 336,719 bytes | 321,944 bytes; 726 fewer lines |

## Release gates

Final full suite: **630 test programs passed, zero failures, timeouts or missing dependencies**. All targeted transport checks were rerun after the final send-boundary change. The release uses the existing `scripts/verify-release.py` inventory and its unchanged seven historical exclusions; no tests are removed to obtain a pass. Browser tests use the supplied Chromium executable and installed graphics libraries. Package verification checks all 14 declared installation files, exact source parity, hashes, runtime assets, component versions and offline guide links.

## Limits

No production response-time or provider-delivery claim. Apps Script still persists the operational JSON document and checks current authority under the writer lock. Large absence deletions still require context and reconciliation for every selected date. Multipart urgent notices are numbered but provider arrival order is not guaranteed. Installing code does not enable disabled template routes or resolve missing recipient contact details.

Emergency new-absence alerts after first publication and before 14:00 Singapore, the related targeted publication action, and expanded Calendar rate-limit cooldown remain queued separately.
