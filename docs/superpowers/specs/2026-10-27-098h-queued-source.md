# Queued after revision G

On 27 October 2026 the user explicitly selected Next patch when asked whether this policy batch should join G. These items are recorded for the next patch and are not implemented in G.

1. Make Publish / Let teachers see a weak visibility control for normal teachers. Business availability, workload and pending cover checks should not block visibility. Preserve server permission checks and protection against overwriting newer saved work.
2. Make SMC WhatsApp notification independent of publication, readily available as a communication tool. Define the message and link content clearly when notifying about unpublished work, so a message does not imply a publication that has not occurred. Existing provider delivery evidence and duplicate protection remain necessary.
3. Format notification timestamps as friendly Singapore date and time. The supplied screenshot shows 2026-10-26T22:52:22.993Z; the intended display is 27 Oct 2026, 6:52 am SGT. Remove raw ISO UTC timestamps from the user facing message body.
4. Enforce the configured UT time cap as a hard limit in the automatic allocator, with an explicit SMC manual override. The existing UT weekly employment cap is 26 periods. During next patch design, confirm its accounting scope and the intended exception to the current confirmed suspended day workload exemption.
5. Treat the final working Stapler layer as the authoritative dated timetable, independent of every baseline. A Stapler plan can exist without a baseline. Its own periods, staff and class identities, placed lessons, recesses, Card Pit and planning annotations remain saved with the plan. A baseline is an optional comparison reference only. Selecting or uploading any baseline recalculates the comparison and must not replace the intended timetable, move cards, force Restart draft, or revoke confirmation. Confirmation applies to the Stapler plan, independent of baseline identity or availability. Changes to baseline timings, teachers or classes should appear as comparison differences or unmapped items, without blocking use of the saved plan. This supersedes the earlier recommendation that an explicit rebase is needed to keep a plan usable. Only explicit actions on the Stapler plan may change the plan or its confirmation. No Cloudflare authority or cache migration is authorised by this requirement.

The next implementation must cover publication and notification independence, private link visibility, unchanged or empty messages, partial failures, duplicate notifications, UT cap boundaries and deliberate manual overrides with appropriate regression checks. No messages, publication changes, allocations or school records were changed while recording these requests.


## Added after revision G deployment diagnostics, 27 October 2026

### Shared secret compatibility and error reporting

Revision G requires exactly 32 printable ASCII characters without whitespace for GSIS_SECRET. The user's existing shared key is 33 characters. Proposed correction: allow at least 32 printable ASCII characters without whitespace, within existing bounded configuration storage limits, consistently across all first party validators and documentation. Preserve failure on malformed configured values, exclusive canonical precedence and legacy fallback only when GSIS_SECRET is absent. Do not trim, truncate or change a configured key silently. No real secret is present in this document.

Roster startup must check the HTTP status and returned error envelope from /api/config before testing clientId. Preserve GSIS_SECRET_INVALID and its safe message. An invalid API key must not be presented as missing school sign-in configuration.

### OVERLORD Background work manager

User request: general management of stuck messages inside OVERLORD, without repeated Apps Script diagnostic or cancellation snippets. This is a proposed focused maintenance patch. It is not implemented, committed or deployed. Existing revision G remains the source baseline.

Recommended entry: administrator-only Background work, accessible from the existing maintenance notice and Settings. Default filter: Needs attention. Use existing OVERLORD styling, dialog controls, Google identity verification, LORD Apps Script Properties and Event Log. No database, Cloudflare authority or notification ledger migration.

| Current state | Recommended controls |
| --- | --- |
| Waiting or confirmed recoverable failure | Inspect, retry selected, or cancel an unsent notification |
| Sending with active lease | Inspect only; preserve the active claim |
| Unknown provider outcome | Review and retire without resending; retain the unknown outcome |
| Expired reminder | Retire without sending; retain uncertainty from an earlier attempt |
| Provider accepted | Inspect provider acceptance; disable ordinary retry |
| Historical warning | Acknowledge selected warning separately from active work |
| Booking repair, custody update or audit event | Inspect and reconcile; exclude from bulk notification cancellation |

Rows should show teacher or recipient, notification type, associated booking, created time, last attempt, safe failure reason, evidence state and available action. Format times explicitly in Asia/Singapore. Use Accepted, Unconfirmed and Retired accurately. Existing LORD evidence does not establish delivery or read status.

Support individual selection and bounded selected batches. Show a preview of exactly what will change. Preserve each recipient's outcome within grouped tasks. Retiring one held recipient must not silently cancel other recipients. State whether other pending recipients will resume. Never include live sends, provider-accepted messages, booking repairs or audit writes in a generic clear-all operation. Retiring stops future attempts; it cannot recall messages already submitted.

Reuse requireLiveAdmin_ for live administrator and Google Sub checks on list, preview and apply. Verify authority again under the existing ScriptLock before mutation. Use stable command identity and expected task revisions or hashes so repeated requests and lost responses recover the same action. Return bounded per-item results; changed items require fresh review rather than an overwrite. Expose typed actions, not a general Script Properties editor or arbitrary property access.

Retain compact reviewed receipts at the original queue key and deterministic Event Log review records. Preserve original provider evidence and unknown outcomes. Do not label a retired item delivered or successfully sent. Keep booking, custody and audit history. Use existing bounded pruning for safely completed records; do not duplicate whole message payloads in review receipts.

Important backend correction: current diagnostics classify expired email leases as uncertain, but the queue runner can reclaim and retry them unless an explicit uncertainty flag or send intent is set. The manager and runner must share one classification. Capture durable send intent and safely distinguish definitive nonacceptance from unknown network or checkpoint outcomes for WhatsApp and email. Never retry an unknown send merely because its lease expired.

Scope is moderate across OVERLORD frontend, LORD backend and queue runner. A UI button alone is insufficient. Keep the larger Roster policy and timetable changes above independently queued unless the user explicitly includes them in the next commit.

### Current incident and temporary recovery

At 27 October 2026, 16:43 SGT, the inspected held task was a teacher collectReminder created 26 October at 09:25:10 SGT. Its send intent began 09:25:13 SGT. One recipient remained recorded in the task. No matching provider acceptance was found in the current Event Log. This does not prove non-delivery. The reminder is obsolete; recommended disposition is retirement without resend while preserving an unconfirmed provider outcome.

A guarded one-off maintainer helper was prepared and checked against the current LORD backend harness. It is not part of the released source. The user ran it successfully on 27 October at 17:09 SGT: the specific reminder was retired, no messages were sent, the provider outcome remains unconfirmed, and pending and uncertain task counts were both zero. History was preserved and the historical warning remained. Sixteen checks cover refusal of changed work, active claims, unrelated recipients, repeat execution, and interrupted audit/property saves. The user was then given the separate historical warning acknowledgement command; its execution has not been confirmed.

Temporary helper: [LORD_One_Reminder_Review_2026-10-27.txt](https://chatgpt.com/library?file_id=libfile_56ad3592eaac81919d0d69200dcf5805&account_id=personal).

The assistant did not execute a live queue mutation. The user executed the scoped LORD retirement above. No live booking, custody record or configuration was changed by that helper.

## Stapler recovery and clarified authority, 27 October 2026

The user reported losing the 28, 29 and 30 October plans after Restart draft. The current Roster operations file at revision 680 retains the complete previous confirmed plans in staplerArchives. These reset archives are excluded from G's Deleted plans UI because they are not deletion archives. Browser undo and the current local recovery slot are replaced after a successful reset; the saved server archives remain the primary recovery source.

| Date | Reset archive | Archived at, Singapore time | Original saved record revision | Original plan cards |
| --- | --- | --- | ---: | ---: |
| 28 Oct 2026 | 4b8b95f2-1d5c-433c-ac54-f3031de47b9b | 27 Oct, 12:33:48 | 3 | 1,430 |
| 29 Oct 2026 | 8012e5f1-3d18-4306-8c7c-9060a901c2e7 | 27 Oct, 17:03:45 | 5 | 642 |
| 30 Oct 2026 | 9ea7d4f2-f14b-451a-837f-713421848a3a | 27 Oct, 17:11:19 | 3 | 733 |

All three archived working drafts equal their archived confirmed plans. Gzip size, SHA256, stored proof bindings and the G model validate successfully. Their old and current baseline lesson contents match after excluding only each tile's baselineId. Thus a changed baseline upload identity, rather than changed lesson contents, triggered the baseline block for these dates. The independent source check also confirmed the retained morning snapshot for all three.

Recovery work is read only. Exact original native plans and provenance are being secured as separate recovery files. These are not a rollback of the full operations store. G's Import Offline JSON action cannot import native recovery plans, and conversion to legacy format would discard Card Pit and other plan information. No claim of online restoration should be made until the three dated plans have been restored through a guarded supported path. Preserve original confirmation provenance; do not require reconfirmation merely because a baseline changed.

Next patch must implement the clarified authority rule in item 5 above across plan validation and storage, editor access, confirmation, teacher timetable reads, allocation, exports, comparisons and cache freshness. A missing or replaced baseline must not disable a confirmed suspended timetable. Blank independent plans still require their own valid period timings and timetable structure; that is separate from requiring a baseline.
