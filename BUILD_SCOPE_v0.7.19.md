# v0.7.19 build scope

Baseline: tagged v0.7.018e at `30558e7`. Authorised on 20 October 2026, Singapore time. Preserve the complete v0.7.18 suite and every v0.7.018a–e patch, including owner/generated copies and regressions.

| Request | Release scope |
| --- | --- |
| 031 and subsequent patch carry-forward | Final offline overlay; Assign Relief readability; signing/recovery; imported workload warnings; staged absence review; compact date and instruction controls |
| 033: Stapler date list | Reduce redundant work for first open, return and refresh while retaining fresh metadata, authority and concurrent changes |
| 039: Selected-day absence verification | Reduce avoidable timetable work, especially for suspended dates; preserve correct review readiness, date-change handling and no early write |
| 040: Contacts import identities | Full Contacts candidate pool excluding SLs/MK/OSO, no baseline membership gate, explicit resolution and permitted contact creation without losing the draft |
| 041: Relief edit saves | Clear/no-relief responsiveness within the existing atomic command and receipt model; preserve ordered edits, conflicts and uncertain-save recovery |
| New Assign Relief toolbar | Export Class POV, Absent Teachers and Relief Load on the second row before Refresh records; existing first-row actions retained |
| Earlier live incidents | Preserve the existing suspended plan and uncertain baseline request; require installed readback and matching diagnostics |

Class POV covers the complete effective dated class timetable for ordinary and suspended dates, including teacher/subject/venue/group and online coverage status. Absent Teachers handles partial-day absence and zero required lessons. Relief Load derives current online assignment counts and covered teachers, not historical annual usage. All three actions are read-only with respect to publication and messages.

## Installation boundary

The minimum update from v0.7.018e is **Deploy_Backend_v0.7.19.gs**, followed by **Roster_Frontend_v0.7.19.zip**. The existing v0.7.18 Contacts backend remains compatible. An optional full-suite refresh includes all five frontends, three complete Apps Script backends and the separate notification Worker. A component's new package label alone does not require a functional deployment.

Retain existing Staff IDs, `/exec` URLs, secrets, private media binding, cron, saved business rules, exact receipts and school records. Opening a saved plan does not replace it with the recurring baseline. Import exceptions do not disable constraints for new online work. Current Contacts authority, source/date identity, revisions, lease fencing, signatures and protected history remain required.

## Evidence boundary

`VALIDATION.md`, `PERFORMANCE_v0.7.19.md` and `RELEASE_SUMMARY.json` record the actual final checks and limitations. Release text does not substitute for that evidence. Measured work reductions and local failure/concurrency checks are separate from live school-service latency, simultaneous production load and delivered WhatsApp messages.

No live deployment, production flag change, operational record deletion, data reset, timetable publication or staff message is authorised merely by building and committing this package.
