# roster-absence-no-instructions-submit: "No relief instructions" submits the absence in one click

- Status: changelog (owner 5 Nov 23:xx); lane R; Codex when authorised. Spec by Claude under the standing rule.
- Reviewer/model: Claude

## Owner intent (verbatim)
"in report absence, clicking 'No relief instruction' is equal to clicking 'Submit absence' with blank relief instructions directly"

## Today
Report absence (roster-update/public/roster-operations-ui.js about line 1183): "No relief instructions" is a toggle. It shows "No relief instructions selected. Your text is kept. Relief is still required where shown." and the user must still press "Submit absence". Two clicks for the most common case (keying in many absences, as on the 6 Nov fresh start).

## Required
1. "No relief instructions" becomes a submit action: one click saves the absence exactly as "Submit absence" with empty relief instructions (same command, receipt, validation, audit and multi-teacher/multi-date handling).
2. If the user has typed instruction text or attached colleague proposals, ask once: "Discard your instructions and submit without them?" (Submit / Keep editing). No silent loss.
3. Relief stays required where lessons need cover (unchanged meaning: no instructions does not mean no relief).
4. Same behaviour for SMC "on behalf" reporting and for teachers' own reports; keyboard accessible; disabled while a save is in flight (no double submit).
5. Tests: one click creates one absence with empty instructions; typed text triggers the confirm; multi-teacher entry submits all; double click submits once.
