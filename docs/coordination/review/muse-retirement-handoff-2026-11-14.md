# Muse retirement handoff (14 Nov 2026)

Recorded by Claude (v0.9 coordinator) from Muse's final report, relayed by the owner. Muse confirmed: work stopped, PR watch removed, no uncommitted work, no pushes after the decision.

## Corrections by the owner
- **Live version is v0.9.9x, not r.** The owner deployed x from `deploy/2026-11-14-v0.9.9x` (Muse reported "remains v0.9.9r"; that is out of date). The ad hoc regression (#38) is live because x is live.

## Open items taken over by Claude
| Item | State per Muse | Action |
|---|---|---|
| Release x record, PR #143 (`muse/release-v0.9.9x` @ 7f818ae) | Draft, CI green, Codex review pending, not merged. Bundle `deploy/2026-11-14-v0.9.9x` @ d8810b7 | x is deployed, so main should carry the x label and `docs/plans/2026-11-14-v0.9.9x.md`. Claude reviews #143 (label/plan-only, 18 files) and asks the owner for "merge 143". |
| Release PRs #110, #113, #117, #122, #126, #135, #141 | Drafts, superseded by x | Owner closes (records). |
| Ad hoc hotfix `roster-adhoc-inactive-regression` | Task on main; Codex PR not opened | Codex builds; Claude reviews. Needed before Mon 16 Nov 07:00. |
| PR #103 LORD return assertions (`muse/lord-return-assertions-before-submit` @ 2bdb0b2) | Draft, Codex approval pending | Parked. Codex may adopt it later as its own task (re-verify at a new head); not merged as Muse work. |
| Backlog #40 (5d10650), #72 (6829397) | Drafts, rebase stopped, blockers unresolved | Parked. Lesson from #38: re-check old PRs against behaviour added since (e.g. ad hoc activation) before any rebase. |
| Live bug "Hoon Kian / Mai Ling" | Undiagnosed, awaiting reporter | Likely the same #38 regression: Mai Ling (FAJT) is an ad hoc teacher, inactive in Contacts by design. Claude re-checks after the hotfix or the Contacts workaround. |
| Venues secret consolidation | Held, awaiting owner's clash call | Owner decision pending; Claude asks when Venues work resumes. |
