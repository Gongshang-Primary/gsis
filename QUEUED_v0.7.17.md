# Remaining checks after v0.7.17

This release addresses queued items 018 through 021. The authoritative request history is retained in GSiS_Queued_Changelog.md. Local implementation does not close the following live checks.

1. After the matching Deploy backend and Roster frontend are installed, use Refresh dates and open the existing 21 October 2026 Revision 1 draft. Compare its final tiles and blank periods before attempting an edit. Keep the record if it still fails. Capture the diagnostic reference, backend version and failure stage, then inspect the matching read-only showRosterDiagnostics() history.
2. Once that existing draft opens, verify a supported Save followed by refresh and reopen. Confirm only when the actual plan is ready for allocation. Check saved and confirmed states separately.
3. Measure date-list, saved-planner, Inbox list/thread/mutation and Calculations latency on the installed school services. Local operation counts and timings do not establish production latency.
4. Incoming Inbox text was visible in the user's 19 October screenshot. Outgoing reply dispatch/delivery, private voice playback and optional duty alerts still require their own authorised checks. The four Settings present groups do not prove those paths work.
5. Nonempty offline reliefAbsences, including saved absence decisions and swaps, remain outside the final-timetable importer. The five supplied JSON files do not contain those decisions.

The claim that Singapore teachers report a national average of 150% preparation and marking time has not been verified. The current explanation uses the saved SIUE allowance and does not publish that attribution.

6. New item 022: Baseline switch/save is unconfirmed in the supplied v0.7.16 screenshot, reference e45fe844-6bf0-49d5-96b9-7bcd94ac34a3. Retry the same request and inspect read-only diagnostics. This route is separate from Stapler decompression; no functional fix or live success is claimed. If its 20 October validity is saved, normal date selection applies it on that date. Keep both baseline records.
