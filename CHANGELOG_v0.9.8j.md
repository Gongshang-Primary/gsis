# GSiS revision J changelog

Baseline: v0.9.8i, commit `f512ac6f584c26a027c1cf2aefb3b19d01fd6838`. The existing 17 components are harmonised to J, with an optional 18th production Calendar job Worker. Google remains authoritative. The separate I rehearsal is unchanged.

## Roster visibility and communication

Publication exposes saved work with a compact durable receipt. It preserves authentication, source revision/conflict checks and the existing explicit date policy, without full allocation preparation/projection or new workload/intake gates. Lost responses recover the exact receipt before reading current external sources. Standalone publication does not notify.

The blue **Let teachers see and send WhatsApp to all** action has two separately durable stages: publish, then notify-all. A notification failure preserves confirmed visibility and the same pending operation identity. Standalone visibility and notification controls remain. **Save to online** moves one toolbar row down.

## Allocation learning and candidates

**Learn about Auto Allocation**, after **My Relief Duties**, provides the retained calculations, safe effective business rules and existing audit-folder link with the exact user prompt. Teacher, SMC and administrator access remains. The header Calculations button is retired. MK, OSO, SAT and SL staff classifications are excluded from relief candidates, including Unavailable/search/counts. Application administrator role and missing timetable data alone do not imply one of those classifications. Historical assignments remain intact.

## Excel exports

Roster exports remove `[DRAFT]`. Final content is fitted to final widths/fonts after overlays and formatting, immediately before workbook writing. Period timing rows, frozen panes, class/teacher views and data remain.

## Calendar reliability and optional commands

Sync Staff reads use native Sheets access while retaining atomic writes, provider IDs, hashes, locks, checkpoints, bounded retry and resume. The controlled regression reproduces 44 Sheets Values reads in retained I source and requires zero in J's sync path. This is measured source comparison, not a claim of a known-good historical rollback or live latency.

The optional production Calendar job Worker captures supported event commands durably in a dedicated D1 queue. Exact operation identity, per-event serialisation, leases, bounded cron/retention, receipt-first recovery and execution-time actor authority checks protect retries. Google stays the production record destination. Unknown write outcomes require review rather than blind replay. The existing `GSIS_SECRET` authenticates a purpose-separated Calendar service envelope; no new cross-API secret is introduced. Direct mode remains available without the `CALENDAR_JOBS` service binding.

Optional `CALENDAR_SYNC_CONTINUE=true` lets the job Worker resume at most one existing persisted Calendar sync batch per cron invocation, after queue work. The default is `false`. Original initiating Admin authority, D1 maintenance/backend provider leases and persisted retry deadlines remain in force. It starts no new sync and does not replace another configured scheduler.

Glossary edits update in place without document reload or losing the editor/view. Venue suggestions match permitted active names, units and aliases. A selected venue stores stable `VenueID`; custom edits clear stale identity. This does not book a room or assert free/busy status. `upgradeCalendarToRC19` appends the new header idempotently without reordering existing columns or historical data.

## Release boundaries

SETUP provides existing-project/backend redeployment steps, optional dedicated Calendar infrastructure and rollback. It preserves URLs, Script Properties, working 33-character shared secrets and existing schedules. Roster rehearsal D1/private R2 are never reused for Calendar production jobs. The unchanged `GSiS_v0.9.8i_Rehearsal.zip` remains separate and is validated against its pinned I canonical source, including shared dependencies.

Local selected-suite aggregate is 822/829 passing with seven reproduced inherited limits; LORD is 38/38 and five independent reviews have no open material findings. Separate raw attempts and scoped reruns are retained. Final committed provenance and fresh recovery evidence are recorded in the complete release. No live deployment, cloud storage verification, school-data mutation, message send or authority cutover is performed by preparation.
