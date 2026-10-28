# Shared project status

Snapshot: 29 October 2026, Asia/Singapore. Refresh against GitHub; this is not live monitoring.

## Established baseline
- main observed at d588ae66c55d5653f638e5b2b19ae98c490631b1 before this coordination setup.
- 0.9.9 imported at 2efd6e003fa9ee3846cf590d07902a22309861ff. README records it deployed on 28 October; the original RELEASE_SUMMARY retains pre-deployment evidence. Do not mistake either for fresh live verification.
- fc0abb99df705ed118209e521d9ec244853e41ee adds later-report replacement, central unresolved-report review and the import-only D1 preparation gate.
- d588ae6 changes the visible Roster header to 0.9.9a; runtime/cache labels remain 0.9.9.
- Roster remains Google-first. Preparation is not authority activation.

## Pending work, not task claims
See ../v099a/PENDING_CHANGELOG.md for Calendar weekly edit anchoring, year loading feedback, relief board, publication timestamp and timetable relief overlays. See ../STAGING_SETUP.md for setup; its Phase C remains marked pending. Do not assume the other model's uncommitted work is absent: check with the owner before claiming overlapping work.

## Active claims
Task files under tasks/ are authoritative for ownership. No product implementation is claimed by this setup. Coordination setup changes documentation only; no tests or live deployments are claimed.

## Known reconciliation work
Root CHANGELOG.md still leads with older releases. RELEASE_SUMMARY.json describes original 0.9.9 preparation. Preserve historical evidence and add dated deployment evidence rather than rewriting history. The newer absence policy can release protected relief on removed periods; evaluate that behavior explicitly during review rather than silently restoring older policy.

## Known test failures (baseline, 29 Oct 2026)
Not regressions; do not report them as new findings unless their cause changes.
- `tests/package.cjs`: needs the historical Q commit, absent from this repository.
- `tests/roster098o-preparation-package.cjs`, `tests/roster098o-timetable-export.cjs`: fixture capture date 28 Oct 2026 expired; fail on unchanged baseline.
- `tests/roster0811-school-absences-browser.cjs`, `tests/roster0811-school-absences-ui.cjs`, `tests/roster090-school-absence-pagination.cjs`, `tests/roster702-operations-ui.cjs`: request counts after fc0abb9; fixed in PR #3 (pending merge).

## Owner directives and deployments
See OWNER_DIRECTIVES.md and DEPLOYMENTS.md.
