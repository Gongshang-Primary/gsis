# GSiS optimisation draft

24 October 2026, Singapore. Based on source commit `8b0d350cf476524dda146ac2ec5472140477514e` (v0.8.11a). Prepared changes are uncommitted and not deployed. The release version and existing deployment archives have not changed.

## Results

| Path | Before | Prepared change |
| --- | --- | --- |
| STAPLER one-cell Save, actual import fixture | 2,778 structural tile checks | 1 check; current authority, absences, workload and source validation retained |
| Confirm, unchanged content | 792,780 response bytes | 9,258 bytes, using a server-issued content tag |
| Pending Save recovery, actual import fixture | 2,502,924 stored characters | 1,251,696 characters; exact original command survives reload |
| Save and Confirm screen | Rebuilds tables and resets scroll | Keeps unchanged table DOM and scroll; merged changes still render |
| 30 simulated timetable checks after an edit outside today through +30 | 30 operations reads, 30 model reads, 19,440 redundant delta bytes | 0 operations/model reads and 0 payload bytes; fresh authority/manifest checks remain |

These are fixture work counts, transfer sizes and browser checks, not production latency measurements. The earlier cache already suppressed unchanged whole-timetable downloads. This patch removes additional work; it does not claim to introduce that existing capability.

## Trust and concurrency

Content freshness comes from server-owned content digests and committed revisions, not the browser clock or a last-fetched timestamp. The existing pending/ready commit marker now tracks the 31-date window independently. An interrupted write cannot certify new content as ready. A midnight rollover falls back to the all-date source until a new window marker is committed. Authentication and role filtering precede unchanged responses.

An incomplete suspended delta cannot give old plan content a new tag. It triggers one full-stage recovery. Explicit Refresh continues to obtain a fresh server check; ordinary background tab coalescing remains. A proposed completion-time-based explicit-refresh shortcut was removed after independent review found a delayed-response race.

Exact-revision STAPLER saves use the existing incremental validation path. Real concurrent edits still take the existing three-way merge and conflict path. Old receipts return current plan state separately from historical acceptance, including a correct message when an old Confirm is replayed against a later restored draft. Unknown Confirm tags fall back to full content. Tags suppress transport only and never grant edit rights or bypass validation.

Recovery stores duplicate snapshots once in the same local record. If a new planner command cannot be retained, it is not sent. Existing uncertain commands keep their exact request ID and payload. Old recovery records remain readable, and other dated drafts are not evicted.

## Morning absence and relief concurrency

Report Absence retained its atomic merge and retry guards; the review did not reproduce a lost absence. Thirty overlapping preparations committed in reverse order are covered by fixtures. Human choices remain authoritative over automatic allocation. Each human decision now has a server-issued token, editor and time, including a release-to-auto tombstone. Stale same-value choices cannot silently overwrite a later human edit. Compare with online shows whose choice is current; explicit Keep latest or Replace with my choice records the decision and attribution even when verbose logging is disabled. Latest means server-accepted order, not browser time.

Active Assign Relief windows receive a bounded allocation log with Minimise and Cancel. Clicking Auto-allocate opens it immediately. Cancellation is cooperative: it prevents a proposal from committing and does not undo accepted work. Durable cancellation receipts prevent old requests from restarting after a later run. Lost responses retain the exact request ID across reload; storage failure stops the first send. The same-slot scheduled duplicate cannot replace its active allocation with a report-only receipt. Cancelling allocation still permits the configured 05:30 SMC summary, including report-only completion across 06:30.

Status-only polling avoids operational-document and timetable reads, but still verifies current Contacts authority. It is not free: 30 active windows at five-second polling could generate 360 status requests per minute. Production capacity has not been measured. A locally initiated run keeps the assignment editor disabled until its response resolves; minimising the log does not start a competing command. A scheduled run leaves manual editing available. The solver can continue computing after Cancel, but its final commit is fenced.

Methods logged for future improvements: preserve exact command identity; check durable receipts before retrying; use server-issued per-cell and window tokens; recompute against authoritative state at the final writer lock; preserve human ownership; separate solver cancellation from scheduled reporting; bound progress data; keep unchanged DOM; measure work and bytes before claiming latency. Remaining work includes reducing full-plan Save upload and moving validated preparation out of the shared lock without weakening final checks.

## Suite review and remaining costs

Calendar, Contacts, Deploy, Layout, shared I/O and gateways were reviewed alongside Roster. The component reports identify the paths traced and tests executed. Existing Deploy field deltas, Contacts authority checks and Layout publication caching were retained. No broad framework migration, new dependency or visual redesign was introduced.

Calendar selected-year refresh is the next major candidate. Safe indefinite reuse requires a version protocol covering every event, metadata, birthday, import, publication and recovery writer, plus an explicit policy for direct Sheet edits. A timer alone is not a safe substitute. This remains queued.

STAPLER Save still uploads both the local plan and merge base. A changed Save still returns its accepted full plan. New Save/Confirm still prepare authoritative context under the shared writer lock. Persistence remains one durable operations-document replacement, not a physical one-cell Drive update. The compact Confirm path still computes the authorized projection and digest server-side. The background preload check schedule is unchanged.

## Verification

Source-only generation completed; 119 Apps Script files passed the syntax gate. Canonical backend sections and the browser operations model match their generated copies. Independent correctness and quality reviews found no remaining material issues in the final scoped diff. All 636 current test programs have passing results across the full run and targeted corrections; `verification.md` records the original three failures and exact fixes.

Reports: `cache-window.md`, `stapler-backend.md`, `stapler-ui.md`, `suite-audit.md`, `correctness-review.md`, `quality-review.md`, `morning-concurrency.md`, `roster-morning-ui.md`, `allocator-lifecycle.md`. Numeric evidence excludes raw staff data. The source inventory is not a claim that every line of all historical, generated, vendor, geometry and export files received an exhaustive audit. No Google/Cloudflare production benchmark, school data write, WhatsApp send or live configuration change was performed.
