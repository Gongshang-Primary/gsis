# GSiS v0.8.11 latency and code economy

> Execution: focused parallel changes, followed by independent review and verification.

**Goal:** Reduce browser work and repeated Roster calculations while preserving live authority, drafts and exact conflict checks.

**Architecture:** Keep the existing HTML/JavaScript, Workers and Apps Script stack. Immutable timetable content remains keyed by server tags. Generation metadata and check timestamps are small, guarded updates. Retain surgical relief commands and receipts.

**Scope:** The user's requested refactor, extended during implementation with school-wide absence date-range management, bulk deletion, urgent WhatsApp forwarding and concise timetable message text. Previously queued emergency absence alerts and Calendar rate-limit work remain queued. No live deployment, messages or school data changes.

## Tasks

- [x] Cache: serialize and write only missing immutable content. Compare stored generation tags atomically before promotion; guard monotonic check timestamps. Exercise actual IndexedDB with unchanged, single-change, cross-tab and account cases.
- [x] Preload: pass the persisted predecessor tags through refresh and timestamp-only checks. Preserve cached rendering and the Singapore :20 schedule. Test a newer concurrent generation during an older network request.
- [x] Relief: build cell decisions once per projection/merge, retaining full result parity and same-cell conflict protection. Measure assignment scans.
- [x] Conflict review: add an explicit save action to the existing per-cell comparison, preserving local-only choices and uncertain-request replay. Test kept values, another concurrent edit and no implicit publication.
- [x] Calendar: remove unreachable legacy upgrade routines and consolidate duplicate historical diagnostics. Preserve current setup, workbook schema, active atomic writes and all diagnostic checks.
- [x] School-wide absences: inclusive Start/End date fields default to today/tomorrow in Singapore. One compact read supplies the complete range, with all matching selectable records across pages. Bulk deletion sends exact selected IDs through existing authority, reconciliation and retry contracts. Existing past-record protection remains. Test defaults, range boundaries, pagination, atomic conflicts, permissions and no implicit notifications.
- [x] Urgent Message: forward the original message to all verified SMC on duty through the Inbox route. Preserve current-duty checks, exact retry receipts and template limits, splitting long text without truncation.
- [x] Timetable notice: replace the confusing period list in the existing change_details field with short actionable guidance. Retain the fixed template, both buttons, recipient eligibility and detailed timetable.
- [x] Release: rebuild generated sources, run the current suite and browser paths, review the diff, prepare v0.8.11 deployment files and source history, commit and save deliverables.

## Constraints and review focus

No new dependencies. Do not replace shared state with last-write-wins. Cache contents never grant authority. A failed cache promotion cannot stamp another generation as current. Retain unresolved drafts, exact retry IDs, manual allocations and account/role isolation. Keep schema compatibility explicit when removing old Calendar labels.

## Verification outcome

630 release test programs passed with the existing historical exclusions unchanged. All 118 Apps Script files parse; package parity and offline guide checks pass. Focused browser, concurrency, absence-range and notification tests are recorded in VALIDATION_v0.8.11.md. No live deployment or messages.
