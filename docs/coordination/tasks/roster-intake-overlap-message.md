# roster-intake-overlap-message: overlapping absence reports — say why, and show the true status

- Status: implementing; claimed by Codex on 6 November 2026, 13:06 SGT; lane R.
- Branch: `codex/roster-intake-overlap-message`
- Base: `afe4c6ea3d6034c78743e980fa0d8c70c8bb529f`
- Reviewer/model: Muse or Claude

## Evidence (D1 `gsis_absence_transport`, 6 Nov)
- db77bad5… (Yoke Yeong + Widayu, 18 Nov P5–P6 "WR"): state needsReview, BACKEND_REJECTED_409; both already have 18 Nov P5–P6 "WR" absences (duplicate).
- 9b500d10… (Jenny Tan, 10 Nov P10 "Mathcheckplus"): needsReview after 2 attempts, BACKEND_REJECTED_409; existing 10 Nov absence P7–P10 "Work review" overlaps P10. The teacher's card still said "Received; sending to the school register".

## D1 gap found (6 Nov 12:45)
"Review report" fails on D1 ("The report review could not load"): `read` view `intakeReview` exists only on Google (`rosterAbsenceIntakeReview_`, backend/RosterOperations.gs); roster-update/public/edge-roster.js has no handler (retryAbsenceIntake and resolveAbsenceIntake do exist on D1).

## Required
0. **Implement `intakeReview` on D1** with the same read-only projection as Google (requested coverage, type, relief flag; per teacher and date the saved entries and missing dates), from D1 state and `gsis_absence_transport`; parity test Google vs D1.
1. Map the overlap 409 to a plain reason for the reporter and SMC: "You already have an absence for P<n> on <date> (<reason>). SMC will review." List the overlapping existing absence(s).
2. Exact duplicates (same teacher, date, periods, type/reason): resolve automatically as "Already recorded" with an audit note; no SMC work.
3. Partial overlap: SMC review offers "Merge into existing" (extend periods / update reason), "Keep existing, close report", or "Edit existing then retry".
4. The reporter's card shows the true transport state (needs review / already recorded / applied), never "sending" for a parked report.
5. Tests: duplicate auto-resolves; partial overlap shows reason and options; card state matches transport state.

## Implementation claim

Model: Codex. Owner priority in LANES.md supersedes the remaining backlog drafts. Scope: D1 intake review and transport handling, shared absence overlap projection/resolution, received-report UI and Google/D1 parity tests; canonical generated bundles only as required. Preserve retained reports, original request IDs, all current permissions, unknown outcomes and existing protected relief. No live repair, records, settings, sends, deployment or merge. Reviewer: Muse (Claude when available), exact final head. Build and full Node/LORD CI before handoff. Branch claim used because direct-main claim updates were rejected earlier in this session.
