# Review: PR #109 — Assign Relief Export Excel and Drive daily file list baseline + ad hoc teachers only

- Reviewer: Codex (relayed by the owner)
- PR: https://github.com/helper-gsps/gsis/pull/109
- Branch: `muse/assign-relief-export-baseline-adhoc`
- Exact head reviewed: `7ee7afe5db48a8e7ae3abfb8c45054743e0406e7`
- Verdict: **CHANGES REQUESTED**
- Date: 2026-11-10

## Verdict

Changes requested. One P1 finding (below). No other findings were relayed. The full review text and reproduction details are saved locally by Codex and were not relayed; this record covers the finding and verification summary the owner passed on.

## Finding

### P1: absence reasons leak into Export Excel

The new renderer hides reasons from the absence overlay but retains reasons already embedded in imported timetable lessons. Codex reproduced `EL (absent — PRIVATE_SYNTHETIC_MEDICAL)` appearing in the download despite `hideAbsenceReasons:true`. The previous renderer and the current Drive export remove it. Required: fix the export path and add regression coverage.

Cause (confirmed by Muse while fixing, not by Codex): the tile loop in `roster-update/public/roster-stapler-export.js` wrote `tile.subject` raw. An imported lesson's subject already carries the reason — `shared/roster-stapler.js` annotates it at import (`'<subject> (absent — <reason>)'`) — and the overlay (`applyReliefSummary`) appends to the existing cell text rather than replacing it, so the reason survived the overlay too. The daily renderer scrubs the tile subject first (`roster-export.js` `dailyTeacherPage`).

## Codex's reported verification at the reviewed head

- Canonical build: passed (Codex's report; not independently re-run by Muse for this review).
- Nine targeted tests: passed (Codex's report; the nine programs were not named in the relayed summary).
- All five CI jobs: green (Codex's report; Muse independently verified CI run 42733163866 green at 7ee7afe on 10 Nov ~09:55 SGT).

## Muse's verification of the finding

- Reproduced the leak locally before fixing: the rewritten test `tests/roster-assign-relief-export-day.mjs`, with Alice's P2 tile subject annotated `EL (absent — PRIVATE_SYNTHETIC_MEDICAL)`, failed on the pre-fix code with the assertion "reason embedded in the imported lesson tile must not leak into the download".
- Fix (branch commit `f70cbe0`, pushed 10 Nov): the tile loop in `roster-stapler-export.js` scrubs `values[0]` with the same two replaces the daily renderer uses when `hideAbsenceReasons` is set, so the download matches the Drive file. The standalone Stapler export still shows reasons (the scrub is conditional). Regression coverage is in the rewritten test, which asserts neither file contains the sentinel reason.
- After the fix: the rewritten test passes; nine targeted tests pass (rewritten test, stapler098h standalone, 714-teacher-export, 714-export-ui, 098j-exports, daily-workbook, daily-workbook-writer, daily-audit, 099a-excel-relief-for); canonical build passes with no diff. Full local suite and CI at the new head are the gate; the PR body is updated once CI is green.

## What this review does not cover

- No formal approval was given. The PR must be re-reviewed at its new head after the fix, or the owner must decide the fix plus CI is enough.
- Nothing is merged or deployed by this review.
