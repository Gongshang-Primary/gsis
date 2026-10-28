# GSiS v0.7.15 release queue

Status: Full package authorised on 19 October 2026 at 15:34 Singapore time. Implemented from v0.7.14a at 8588d19387933fbdfd20fcf1902fbd5e5ac16f58.

1. Included v0.7.14a final offline timetable import, validated TTB name resolution, full day replacement including blanks, baseline fallback for teachers entirely missing from JSON, and preserved online absence records.
2. Fixed the signed backend request limit that rejected the five school sized imported plans before Save could write.
3. Verified Save without Confirm through fresh storage readback, then Confirm and readback, plus errors and retries.
4. Reduced date-list lock metadata to one fresh service read and showed the timetable before its editing lock response, with editing disabled until ownership is verified.
5. Normalised both 0.7.14 and 0.7.14a components to 0.7.15; included the full suite and release evidence.

## Retained limitation

Nonempty offline reliefAbsences, including saved assignments and swaps, remain rejected before draft mutation. The five supplied timetable files have no saved offline absence decisions. Extending that scope requires separate handling and review; it is not part of this release.

See CHANGELOG_v0.7.15.md, BUILD_SCOPE_v0.7.15.md, PERFORMANCE_v0.7.15.md and VALIDATION.md. No live deployment or staff messages are included. Later requests remain log only unless implementation, commit or build is explicitly authorised.
