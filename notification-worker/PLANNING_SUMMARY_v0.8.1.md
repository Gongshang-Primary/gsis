# Planning summary and dispatch in v0.8.1

Each scheduled invocation starts notification delivery, pending Inbox replies and the signed Roster scheduler independently. Today's published notices can start delivery while tomorrow's allocation is still running. If the scheduler queues new notices, a second notification drain runs after this invocation's first drain completes. Employment reports remain owned by the existing backend dispatch operation and follow the scheduler.

Existing request deadlines, bounded claim batches and durable backend claims remain in force. Each lane catches its own failure and emits only an event name and scheduled time. A network timeout after a provider send still uses the existing uncertain-send recovery; it is not treated as permission to resend.

## Compact planning summaries

The existing approved `relief_evening` and `relief_morning` contracts continue to receive one summary parameter. It now lists each absent teacher once, without the saved period list, while retaining name qualifiers:

```text
5 absent teachers: Jannie; Siti Fadhilah (MTL); Egwin; Yusri; Amelia (FAJT). 12 periods have planned cover; 0 uncovered. Low-capacity periods: None.
```

Ordering follows the existing stable teacher IDs. The count uses distinct teacher IDs; duplicate absence records do not duplicate names. Contact whitespace is collapsed to keep the template parameter on one line. Coverage, uncovered periods and low-capacity information remain. The evening template still states that allocations are drafts pending publication.

If the summary exceeds 900 characters, it retains the teacher count and coverage/capacity information, explicitly says that names were omitted, and directs the recipient to Roster for the full absence list. The absence fingerprint still includes teacher IDs and effective periods, so changing a teacher's absence periods can trigger a new summary even though those periods are no longer printed.

The user selected compact inline names for this release. One name per bullet line remains queued for a compatible revised approved template. This release does not alter template bodies, names, field order or approval checks, submit templates, or enable messaging.

## Regression checks

```sh
node tests/roster081-notification-lanes.cjs
node tests/roster081-compact-summary.cjs
node tests/roster713-smc-summary.cjs
node tests/roster710-worker-reports.mjs
```

The deferred-promise worker test verifies that delivery starts while allocation and Inbox remain unresolved, the follow-up drain waits for the first drain, each lane isolates failures, and diagnostics mode does not run ordinary work. Summary checks cover zero, one and five teachers, retained qualifiers, duplicate rows, contact whitespace, long-list fallback and period-sensitive suppression.
