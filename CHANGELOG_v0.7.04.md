# GSiS v0.7.04 changes

Finalised on 16 October 2026, Singapore time, from the v0.7.03 baseline and the reviewed v0.7.04 source draft. Finalisation creates deployment packages, not a Git commit or live deployment.

## Report Absence and Own Arrangements

Reason, Select All and Clear periods share one control baseline. Small screens retain wrapping. Report Absence starts one read when the user points to, focuses or presses its tile. Opening joins that request. Fresh report data remains reusable for 60 seconds from completion; idle Home does not fetch it.

The first Own Arrangements save can return colleague availability in the same response. It reuses the save's Contacts, timetable and date context instead of starting another request chain. Optional candidate preparation runs after the save lock is released. A candidate lookup failure does not reverse a completed save.

Normal progress uses a rotating spinner. Reduced motion uses a visible opacity pulse. Response projection runs outside the shared save lock. The durable save still uses one atomic document write and an exact request receipt. Ordinary saves still require fresh server checks.

## Assign Relief and recovery

Assign Relief follows the supplied toolbar, inline absence form, horizontal period controls and compact status cards. Remove, Edit and View are direct actions. Complete same-date entry details open from loaded data. Manage reported absences uses saved lesson snapshots for read-only details.

Missing data still loads from the backend. Failed reads expose Retry and a diagnostic reference. Editor data stays paired with its revision. Late responses cannot replace a different date or account. Confirmed saves and receipt replay close the original editor correctly, including after date navigation.

Conflicts retain drafts, refresh candidates and require explicit review. A denied refresh removes actionable data. Ad hoc navigation retains its selected date. Cancelling a teacher search restores the prior control state.

## Deploy Subject Type

**Program Settings > Subject Type** lists subjects from Subject Load. Admin chooses Class only, TG only or Both for each editable subject. RRP, SDR, CCE and LSM default to TG only. Empty form-class cells for these subjects no longer add planned school demand.

Existing assignments and defined TGs remain visible and counted. A placement warning identifies records that need review. Language and FTT placement rules remain fixed. Both keeps the established whole-level TG replacement rules and Art exception.

Each version owns its settings. A per-subject change uses the existing atomic draft batch, conflict checks and receipt recovery. New class and TG allocations, TG subject changes, automatic PAL additions and legacy conversion use the same placement policy. Policy edits apply before allocations within a mixed batch, regardless of click order.

## WhatsApp preparation

The evening summary route uses the approved `gsis_relief_evening_v1` template. The v2 template remains on Meta. Roster shows a collapsed notification readiness table to SMC and Admin, with separate Sending and Approval states for each type. The table uses cached metadata and adds no Meta request to normal page loads. Approval records are observations, not permission to send.

The conditional relief instruction submission is prepared in `notification-worker/proposed-template-submissions.json` and explained in `notification-worker/CONDITIONAL_RELIEF_TEMPLATE.md`. It has not been submitted. Messaging, the contact menu, diagnostics and automatic allocation remain disabled by default. Exact template checks, recipient authority, quiet hours and durable delivery tracking remain in place.

## Verification and limits

Pstack reviews cover correctness, failure recovery and affected callers. Ponytail reviews cover unnecessary work and complexity. `VALIDATION.md` and `RELEASE_SUMMARY.json` contain the final test and archive results. The draft review records remain in `verification/704-review.md` and `verification/704-subject-types-review.md`.

The full staff timetable remains in bounded browser memory. Current authority checks still govern writes. The exact public privacy page and its images remain included. Live save latency, the earlier intermittent production startup incident and historical absence cleanup require separate operational checks. This package does not send a message, open a service window or change school data.
