# GSiS change queue

## v0.9.5 — OVERLORD: clean up System settings

Requested 26 October 2026 (Singapore). Screenshot highlights the Staff member selector, detached WhatsApp agreement checkbox and oversized spacing around the administrator action. Status: queued UI cleanup; no runtime change in this changelog commit.

- Align the administrator list, Staff member label, teacher selector, supporting text and primary action into one compact, consistent form. Keep the close control and form actions reachable at laptop and mobile viewport sizes.
- Remove obsolete individual WhatsApp consent controls and the misleading WhatsApp agreement needed status, consistent with the existing school-managed operational notification policy. Granting administrator access must not depend on a separate personal opt-in checkbox.
- Label the administrator action clearly as Grant admin access. Explain operational notifications separately without conflating administrator authorization with notification enrolment.
- Replace implementation-specific Contacts column F helper text with concise user-facing contact-source guidance; preserve Contacts as the authority for contact details.
- Acceptance: the selected staff member and grant action are easy to identify, spacing and wrapping remain readable, no detached checkbox or stale consent status remains, and administrator grants still require server-side authorization and retain their audit record. Operational alert delivery remains enabled under the existing school policy.

## v0.9.5 — OVERLORD: clean up upper-left dashboard area

Requested 26 October 2026 (Singapore). Screenshot shows background-task warning details overlapping the summary cards and a visually heavy Logging incidents strip below them. Status: queued UI cleanup; no runtime change in this changelog commit.

- Give the background-task notice its own space in normal document flow. Expanding Background task details must push subsequent content down rather than overlap the summary cards or incident summary.
- Show a concise status message with clear distinction between a historical warning and a confirmed current fault. Keep diagnostic and maintainer instructions in expandable details, collapsed by default.
- Restyle Logging incidents as a compact, aligned summary with Collection, Return, Total and booking counts; keep Since last REIGN close visibly associated with it. Preserve its existing action, if any.
- Align spacing and typography beneath the header; keep warning details, summary cards and incident counts readable on laptop and mobile widths.
- Acceptance: no overlap or clipped text with details open or closed; active faults remain visible, and visual cleanup does not clear or acknowledge a warning or change any incident counts.

## v0.9.5 — LORD: restore administrator booking on behalf of others

Reported 26 October 2026 (Singapore). User reports this worked before GSiS integration and is unavailable in the current version. Screenshot shows a fixed signed-in identity on Book Devices with no recipient selector. Status: queued regression fix; no runtime change in this changelog commit.

- Restore the ability for an authorized LORD administrator to choose another eligible teacher when booking devices. Check the previous LORD implementation when restoring the flow.
- Keep the signed-in administrator as the acting user and record the selected teacher separately as the booking recipient. Preserve both identities in the audit record.
- Enforce administrator permission and recipient eligibility on the backend. Ordinary users retain the existing self-booking permissions.
- Apply existing booking confirmation and reminder rules to the selected teacher's booking, using that teacher's contact details rather than silently substituting the administrator's.
- Acceptance: a LORD administrator can select another eligible teacher, submit a booking, and see the correct recipient on the saved booking; its audit identifies the administrator who created it. Notifications and subsequent booking management resolve the correct booking owner. Existing self-booking remains functional.

## v0.9.5 — LORD: remove WhatsApp notifications link

Requested 26 October 2026 (Singapore). Status: queued for v0.9.5; no runtime change in this changelog commit.

- Remove the **WhatsApp notifications** link below **Pending Return** on the LORD home page, as marked in the supplied screenshot.
- This is a navigation-link removal only. Existing operational WhatsApp notifications and booking/reminder delivery remain enabled.

## v0.9.5 — Venues: authoritative register and administrator editing

Requested 26 October 2026 (Singapore). User directed integration into v0.9.5 instead of separate hotfix installation. The locally verified manual patch in `docs/v094/venues-live-register/` is retained as implementation evidence. Canonical runtime files and release bundles are unchanged; production installation is not verified. Include the correction in the normal v0.9.5 backend packages so no manual function replacement is required.

- Use the corrected live `Venues` sheet selected by Deploy's `LANDMARK_SHEET_ID` as physical-room authority instead of stale room arrays inside published Deploy documents. Keep published Deploy version/effective-date authority and Roster timetable authority.
- Include live room content in the Deploy source key and that source key in the Venues publication-cache key. Reject concurrent changes and invalid/duplicate register entries. Preserve stable unit identities and existing booking/grant reconciliation.
- Full-release integration must cover Worker-backed Deploy authority; the manual Apps Script patch fails closed after Worker cutover rather than reading stale legacy storage.
- **New requested UI:** allow Venues administrators to edit the shared physical room register through the Venues viewport, with changes synchronized to Layout, LORD and Deploy. Use one canonical register and revision-aware consumers, with server-side administrator authorization, audited edits and concurrency conflict handling. Preserve room ownership, bookings and timetable references when editing metadata; unit identity changes require explicit reconciliation.
- Acceptance: an authorized administrator edits room metadata once in Venues; Layout, LORD and Deploy obtain the same updated revision without independent manual edits. Unchanged revisions retain cached data. Unauthorized edits are rejected and concurrent edits cannot silently overwrite newer changes. This viewport and cross-application synchronization work remains queued, not implemented by the manual hotfix.

The accepted v0.9.4 work is included in the v0.9.4 release. Final release evidence is in [validation](docs/v094/VALIDATION.md); original requests and diagnostic evidence are retained in [the accepted scope record](docs/v094/ACCEPTED_SCOPE.md). No separate product backlog has been created.

## After v0.9.4 — Roster: Manage school-wide absences and Manage my absences

Requested 25 October 2026 (Singapore). Status: recorded for the next implementation; no runtime change in this changelog commit.

- On both Manage school-wide absences and Manage my absences, show and edit absence coverage using explicit timetable periods, matching the selector in Report absence.
- Replace the full-day / start–end-time controls and descriptions with the selected periods. Show period timings as supporting reference, as in Report absence.
- Preserve existing absence dates, teachers and coverage when presenting existing records; opening the page must not change an absence.

Acceptance: an SMC user managing school-wide absences and a teacher managing their own absences can identify and select the affected periods directly, using the same period-selection interaction as Report absence. Existing access permissions remain in force.

## After v0.9.4 — Venues source diagnostics

Reported 26 October 2026 (Singapore). Status: diagnostic gap reproduced locally; the cause of the school's live source failure is not yet identified.

- Some Deploy/Roster and Contacts error envelopes drop `VENUES_SOURCE_*` and `VENUES_FENCE_PENDING` codes. Venues then displays `SOURCE_UNAVAILABLE`, obscuring setup, signature, pending-recovery and publication failures. Preserve explicitly approved safe source codes and identify the failing source; never expose raw upstream responses or private data.
- Add regression coverage through actual signed source entrypoints and error envelopes, not only synthetic responses. A local reproduction confirmed that missing Roster source recovery and missing/mismatched source bridge credentials lose their specific codes.
- A separate, tested `diagnoseVenues094()` editor-only script probes source manifests and reports safe connection/status information, snapshot-folder access, Contacts matching and existing administrator grants. It does not change settings, grants or bookings. Runtime correction is pending.
- `VENUES_ADMIN_EMAILS` remains initial setup input: `setupVenues()` creates grants only when no administrator grant exists. Existing grants, including inactive ones, prevent bootstrap replacement. Diagnose saved grants and active Contacts matching before changing access or running recovery.

## v0.9.5 — Venues: multiple room owners

Requested 26 October 2026 (Singapore). Status: queued; no runtime change in this changelog commit.

- Allow a Venues administrator to select multiple owners for each room using checkboxes.
- Show the room's existing owners as selected when editing. Save the selected owners together, preserving unrelated room settings and grants for other rooms.
- Apply the existing room-owner permissions to every selected owner. Room ownership does not grant product administrator access.

Acceptance: select two or more owners for one room, save and reopen it; all selected owners remain checked and each can manage that room under the existing permissions.

## v0.9.5 — Deploy room export compatibility

Confirmed 26 October 2026: the published legacy list has 143 rooms, including EAS Store and Pump Room both identified as D1-06B. The Venues snapshot export rejects this duplicate before reaching Roster. Existing Layout/Deploy compatibility rules already map the legacy Pump Room to D1-06C while retaining EAS Store as D1-06B; apply that same specific correction to the export without changing immutable published data. Preserve rejection of other ambiguous duplicates. Also accept unitNumber for physical registry rows that have no id. The operator hotfix was tested locally; production refresh outcome is pending. Include both corrections in the next packaged implementation and its regression coverage.
