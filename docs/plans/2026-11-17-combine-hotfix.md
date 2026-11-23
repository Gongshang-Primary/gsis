# Occupied-lesson Combine hotfix on v0.9.9y

Model: Codex. Owner-requested hotfix extending PR #182. The owner has waived Claude review for v0.9 hotfixes and retains merge/deployment responsibility.

Combine now accepts a timetabled activity with a subject and an empty class label. The receiving teacher keeps the activity while taking the additional class; the assignment costs zero R. Ordinary Relief still requires a blank period. Explicit non-teaching block/duty exclusions, attendance/identity checks and the one-additional-class limit remain. Empty labels never count as proof of the same class.

## Owner installation

Keep the current versions of both Workers and Roster Pages for rollback. The package remains labelled v0.9.9y and is identified by COMMIT.txt and SHA256SUMS.txt.

1. Update `gsis-roster-notifications` from `gsis-roster-notifications_worker.js`.
2. Update `gsis-operations` from `gsis-operations_worker.js`.
3. Publish `Roster_Frontend.zip` to the existing Roster Pages project with files at the ZIP root. Reload the browser so its candidate calculation uses the matching allocation source.

No Apps Script upload, configuration, binding, URL, flag, cron, secret or Meta template change is needed. No rows or R2 objects are deleted. All preceding PR #182 memory, intake, absence-clash and public-menu changes are included; preserve their deployment checks in `2026-11-17-d1-memory-hotfix.md` and `2026-11-16-absence-clash-hotfix.md`.

## Checks and rollback

- Select the affected period, then Combine. An available teacher with an existing subject/venue activity must be selectable even when its class label is empty.
- Save to online. Confirm a saved combined assignment and the retained original activity. A retry of an uncertain save uses the same receipt; do not send another operation to guess its result.
- In Relief mode the occupied teacher stays unavailable. A genuinely blank period can still receive ordinary relief.
- Reported-absent/inactive teachers and explicit blocked duties remain unavailable. An unrelated second combined class remains rejected by the existing limit.
- Publish only through the normal owner workflow when desired. Existing lesson/activity details and the added class must both remain visible in the teacher's timetable. Publication and WhatsApp remain explicit separate actions.
- Roll back by restoring the saved matching versions of both Workers and Roster Pages. Preserve all data and receipts; rollback does not undo combinations already saved.

Synthetic regression tests cover domain eligibility/publication, real-DOM selection/online batch intent and generated D1 policy/SQLite persistence with exact replay, stale revisions and denied access. Canonical build, full local tests, exact-head CI and package checksums are recorded in the PR and verification record. No live deployment or provider outcome is claimed.
