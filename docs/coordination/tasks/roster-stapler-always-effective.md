# roster-stapler-always-effective: when a Stapler plan exists for a date, every screen and the allocator use it

- Status: changelog (owner 6 Nov ~07:30: "need changelog: to always load stapler plan if present"); lane R; Codex when authorised. Spec by Claude under the standing rule.
- Reviewer/model: Claude

## Incident (6 Nov, D1 v0.9.9n)
- Stapler plan 2026-11-06 re-confirmed at 07:04 SGT (revision 3), after allocation and SMC edits. A TIMETABLE_RECONCILE_BLOCKED alert retained 34 relief assignments; published relief reflected the earlier Stapler version; owner: "system didn't seem to take into account suspended timetable". Emergency absence (Widayu 07:22) reported "No timetable applies yet".
- Code today: `readyStaplerPlan(row)` (shared/roster-operations.js) makes a plan effective only while `confirmed` or `published`; saving edits clears confirmation ("Needs reconfirmation"), so between save and re-confirm the date can fall back to the plain baseline. A fall-back makes reconcile see most Stapler lessons as "removed" (likely the 34) and the guard blocks.

## Required
1. **One rule everywhere**: for a date with a Stapler plan, the effective timetable is the **latest confirmed Stapler version**. Editing (saving a new draft) never reverts the date to the baseline; the previous confirmed version stays effective until the new one is confirmed. On confirm, switch to the new version and reconcile lesson by lesson (existing #78 rules and guard).
2. A plan that has never been confirmed is shown in Assign Relief with a banner "Stapler draft for this date is not confirmed; allocation uses the baseline until you confirm" and a Confirm shortcut (no silent use of unconfirmed drafts by the allocator).
3. Apply to every consumer: allocator and reoptimise, reconcile, Assign Relief, Report Absence (period choices and "no timetable applies"), Daily Notify/publication, teacher timetables and private links, exports (Excel, class POV), Drive daily outputs, statistics.
4. Show the effective source on Assign Relief and Daily Notify: "Timetable: Stapler plan rev N (confirmed HH:MM)" or "Baseline <name>".
5. Absence reports for a teacher present in the Stapler day are matched against the Stapler day (fix "No timetable applies yet" when a Stapler plan exists).
6. Tests: save-without-confirm keeps the last confirmed version effective (no reconcile releases, no guard); confirm switches and reconciles only changed lessons; never-confirmed draft shows the banner and baseline; Report Absence uses Stapler periods; Google and D1 parity.

## Owner confirmation (6 Nov): "always load confirmed stapler"
Confirmed: the effective timetable is always the latest **confirmed** Stapler version; unconfirmed drafts never drive allocation or teacher-facing output (banner + Confirm shortcut only).

## Codex claim (6 November 2026, following updated owner order)

Owner/model: Codex. Reviewer: Claude. Branch: codex/roster-stapler-always-effective. Base: 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Scope: canonical Stapler effective-day selection and save/confirm lifecycle in shared/roster-operations.js; Google/D1 context readers and canonical UI source labels/banner; relevant renderer/export consumers only as needed; tests and generated copies. Preserve published/manual/peer relief and the existing reconciliation guard. No live changes, notification sends, authority switch, merge or deployment. Acceptance: saved draft retains last confirmation, confirm changes only affected lessons, unconfirmed-first draft remains baseline with banner, Report Absence and Google/D1/teacher/export parity. Current #87 review/CI continues independently; #90 was already implemented when this owner priority arrived. Claim published on task branch because automatic review rejected direct-main claims earlier in this session.
