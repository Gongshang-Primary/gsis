# GSiS v0.7.11

Baseline: supplied GSiS_v0.7.10_Deployment.zip. Release authorised 18 October 2026 (Asia/Singapore).

## Workload and allocation
- Deploy includes all captured teaching and other timetable workload in W_i once. Existing offload/SIUE weighting applies to teaching; other captured periods remain unweighted.
- Roster consumes Deploy R directly. Timetable blocks constrain availability and do not subtract again from R. Existing overall workload/consecutive safeguards remain.
- Empty annual relief history starts at zero without an Admin verification blocker. Existing records are retained. Pruning removes matching historical counts and recomputes retained totals. Read failures never count as empty data.
- Indexed annual accounting avoids repeated full-array scans. Full timetable preload, compact dated reads, date-cache reuse and stale-response guards reduce repeated loading.

## Stapler
- Confirm replaces planner Publish. It makes a dated plan eligible for allocation, including future dates. Confirmed plans remain editable; allocation uses the latest saved confirmed plan. Daily publication remains separate.
- Add an uncapped lower resize handle; Card Pit follows the workspace. Middle divider adjusts the teacher/class proportions. Tighten tile whitespace and expand rows for wrapped content.
- Add ad-hoc class, pen rename and delete. Deleted custom-class tiles return to Card Pit with the deleted association cleared.
- Rename activity creation to Add teacher tile. Subject, venue, group and class allow blank, existing or custom values with partial search. Class uses checkboxes; a class-POV drop replaces all class associations. Quantity creates separate tiles.
- Sponsor choices retain the existing SMC sponsorship workflow and show eligible teaching SMC only, excluding SL, AM, OM, support and SAT.

## Roster identity and forms
- Add Admin-managed temporary timetable-name bridges to stable Contacts Staff IDs. Seed the seven user-confirmed links only when the exact Contacts target is unique. Normal unique matching takes priority; duplicate/ambiguous identity is not guessed. Links survive imports and can be edited or removed.
- Report Absence and Assign Relief reuse loaded timetable/reference data. Own Arrangements shows the covered lesson details and permits a request for one selected period while other periods remain available for automatic allocation. A colleague's acceptance is still required.
- SMC duty excludes SL, AM and OM; use inclusive start and end dates.
- Subject exclusions have distinct specific-subject selection, wildcard pattern selection and an always-visible combined excluded-subject list. The wildcard contract is unchanged.
- Daily Employment Update becomes Daily Updates. Ordinary teachers see Absences and Relief load; recipient/report settings remain restricted to SMC/Admin, including backend responses.

## Daily publication and notification
- Assign Relief focuses on assignment. Remove its acknowledgements, completion/correction and accounting panels.
- Add Publish & Notify, Publish Only and Export Excel beside its title for the selected day. Excel retains the existing offline Stapler-style period grid, wrapping and draft/unassigned formatting.
- Add SMC/Admin Daily Notify with Publish & Notify All, Publish Update and Notify Affected, and Notify All; teacher search, relief/absent grouping and individual Notify actions.
- All means teachers with changes from their baseline timetable, including Stapler changes and restorations since the prior publication. Update mode includes removed/reassigned duties. Notify-only actions use the latest published snapshot; pending edits are not sent. Publication and notification preserve request-ID retry protection.

## WhatsApp worker changes recovered from the other project chat
- Merge prepared diag1–diag4 into the canonical Roster gateway and regenerate both standalone dashboard Worker files.
- All four Meta requests use redirect:manual. Diagnostics expose safe integer metaErrorCode/metaErrorSubcode, HTTP status and phase, plus Calendar and configuration failure classifications; no credentials, response bodies or staff data are logged.
- Diagnostic mode remains read-only and returns before allocation or message/email dispatch.
- Compact all-21-route activation configuration is 4,135 bytes; disabled example is 4,534 bytes.
- Later operator logs reported all 21 contracts approved and enabled, connectionsReady=true and sendingTested=false. This is recorded project-chat evidence, not a new live provider or delivery test by this build.

## Retained decision
Changing subject exclusions continues to affect new absence reports. Saved absences retain their captured policy until retroactive application is explicitly requested.
