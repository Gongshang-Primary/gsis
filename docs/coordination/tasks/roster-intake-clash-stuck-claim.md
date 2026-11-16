# roster-intake-clash-stuck-claim: received reports that clash with an existing absence never settle (v0.9 HOTFIX)

- Status: proposed (v0.9 hotfix under the owner's exception until 20 Nov)
- Owner/model: Codex. Reviewer: Claude. Mirror the fix in v1 afterwards.
- Raised: owner, Mon 16 Nov ~08:10 SGT.

## Evidence (Claude, read-only D1, 16 Nov 08:13 SGT)
- `gsis_absence_transport`: 5 intake rows stuck in `claimed` with `last_code` NULL and rising `attempts` (34, 33, 31, 6, 3). Each attempt's capture never settles inside its 90 s lease; the next tick reclaims it. Others accepted in the same window forwarded normally (e.g. b5b019d3 at 06:16).
- Common factor: every stuck report clashes with an absence for the same person and date:
  - Peggy 16 Nov full day, fa124402 (05:35): Peggy then had an absence P8-P9 (82523c7d, deleted 07:02).
  - Owner's Peggy 16 Nov full day, 531b5e7a (08:05): carries `absenceClashToken`, `confirmAbsenceReplacement:false`.
  - Nisha 17 Nov P4-P6, 7cb0d9be: existing absence 98e2d73d P4-P6 (same periods), plus c0438842 P8-P16.
  - Nisha 17 Nov P4-P6 + P8-P11, 424211c0: overlaps both.
  - Nisha 18 Nov P8-P16, 99e7b6d9: existing absence 98b7099a P8-P16.
- Impact: `gsis_job_health` allocation = `failure ABSENCE_TRANSPORT_PENDING` (auto-allocate waits for pending reports on that date), and the report card says "Received; sending to the school register" forever.
- Owner action 08:12: fa124402 set `withdrawn` (duplicate) by Claude on the owner's instruction.

## Required behaviour
1. Find where the clash path stalls (capture of a `saveAbsence` intake whose periods overlap an existing absence). Add timing/stage diagnostics if needed; state the root cause in the PR.
2. A clashing report must settle deterministically within the lease: either merge (if #96's overlap rules say so), or settle `needsReview` with a plain reason ("Overlaps an existing absence for P…; resolve in Manage school-wide absences"). Never leave a row `claimed` without a `last_code`.
3. A row reclaimed after N (e.g. 5) lease expiries with no outcome settles `needsReview` with `TRANSPORT_STALLED`, so it cannot block allocation forever.
4. `ABSENCE_TRANSPORT_PENDING` must not block auto-allocate because of rows that are `needsReview` (only truly in-flight rows).
5. Tests: each of the 5 live shapes above (synthetic data) settles within one dispatch; a forced stall settles after N expiries; allocation proceeds.

## Out of scope
Live data changes, deploys, v1 (mirror afterwards as its own task).
