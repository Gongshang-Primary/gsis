# GSiS v0.9.1b changes

25 October 2026, Singapore time. Component patch over v0.9.1a. Changes apply to LORD, OVERLORD, STARLORD and Roster; other installed components retain v0.9.1.

## LORD booking and returns

Booking Remarks accepts Space and Enter without triggering the surrounding card. Normal typing, draft restoration and saved text retain spaces; redraws retain input focus and selection. Selecting a booking card updates its highlight without rebuilding the full grid.

Return actions share one horizontal row in equal thirds: Back left, red Return devices with issues in the middle, and green-filled Return devices without issues on the right. The return labels occupy two lines on desktop and narrow phones. Quantity discrepancies still require the issue path.

Opening bookings requests current references and the selected day's bookings together. Responses remain date-specific and booking data cannot enter the shared reference cache. Older-backend fallback and stale-response fencing remain supported.

Multi-booking queue admission reuses one property snapshot only while continuously holding the same writer lock. Local 20-booking checks reduce full property reads from 42 to 3 while retaining 40 durable background tasks, 41 property writes and one atomic Sheets commit. Ambiguous property-write failure invalidates the snapshot. New safe phase timings help measure real installations; local operation counts are not production latency measurements.

## OVERLORD and STARLORD

OVERLORD distinguishes unresolved work, automatic retry and historical warnings. Safe details identify channel, time, failure category, provider codes when available, counts, storage estimate and a concrete next action. Uncertain outcomes and missing work must remain visible until reconciled; an unrelated successful retry must not clear them.

STARLORD's upstream timeout covers headers and the complete response body. A stalled body can no longer leave later polls permanently attached to the same unfinished request. Last-good data and the existing stale/retry indicator remain visible, with normal polling restored after recovery. This repairs a locally reproduced failure mode; live incident logs were not inspected.

## Roster prepared timetable sources

The patch prepares reusable compressed baseline and suspended timetable source data when source records are created or changed. Fresh authorisation and source metadata remain separate from shared immutable contents. Existing clients retain their compatible response path; matching trusted versions reuse client timetable data. The existing Roster preload window is unchanged. Venue school-year occupancy remains a separate product design.

## Report Absence responsiveness

The teacher picker and date range share one desktop row, with responsive wrapping on phones. Choosing a teacher closes the menu immediately instead of waiting on background timetable work. Existing local timetable data is used through the trusted cache flow, while the server remains authoritative for saving. Final checks cover delayed responses and preservation of selected teachers, dates, periods and instructions.

## WhatsApp timetable acknowledgement

The acknowledgement button is full-width and at least 64px tall near the top, above the timetable. Pending acknowledgement is maroon; a server-confirmed acknowledgement keeps a disabled green button visible, including after refresh. A missing or mismatched receipt triggers a fresh check and cannot claim success. Changed publications still require review before acknowledgement.

The first signed timetable read starts before stylesheet loading completes; rendering waits until the document is ready. No private timetable response is added to shared browser or edge caches. Existing links remain valid for seven days from notification creation, require no school sign-in, and stay tied to the notification's date. Anyone holding the complete signed link can view that teacher's published timetable above the usual baseline. The date stays fixed when the link is reopened later.

## Workflow and Drive study

Changelog requests authorise implementation and commit by default. The separate product backlog remains outside Git and releases until explicitly promoted.

LORD already compresses photos in the browser. The user explicitly promoted photo reliability into this patch after the study. The new evidence path uses Advanced Drive v3 generated file IDs, durable actor/request/content-bound manifests in the existing Event Log, verification of uncertain uploads and safe retry of the same file. No new Script Properties or worksheet is introduced, and maintenance never deletes Drive evidence. This adds retry reliability; it is not a measured upload-speed improvement. Chunked resumable transport is not included.

No live deployment, source publication, settings change or provider message was performed. The Venues design captures the clarified rules but is not a delivered booking application in this patch.
