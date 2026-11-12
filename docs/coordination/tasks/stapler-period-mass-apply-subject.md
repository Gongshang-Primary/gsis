# stapler-period-mass-apply-subject: Mass column fill (period mass-apply) needs a Subject field too

- Status: merged (#124 at 196cac2 as a7da2c2)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-12 16:45
- Branch: codex/stapler-period-mass-apply-subject
- Base SHA: c7590be14d027c3da3aec5f0f4aed9d4c5c2d7fb (verified current main including this task record; replaces the earlier f0cc784 reference)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Add a Subject field to the period mass-apply (mass column fill) overlay dialog. Owner request, 12 Nov 16:45 SGT, with a screenshot of the P3 dialog showing Venue, Group and Classes but no Subject. This supersedes the #116 out-of-scope note ("Subject in the overlay (the owner asked for venue, group and/or class only)"). Urgent, for the next release after v0.9.9t. Codex is free (#123 merged); this is the next task.
- Owner ruling (12 Nov, verbatim in substance): "mass column fill needs subject field too"

## Problem
The period mass-apply overlay ("Apply values to P<n>", `applyPeriod`, roster-stapler-ui.js:477) offers Venue, Group and a Class picker, but no Subject. The class-row mass-write already offers Subject. For a mass assembly the SMC wants to set the subject for the whole column as well (for example, every class doing "Celebrate Learning" at P3), instead of editing each tile's subject one by one.

## Required behaviour
1. **Add a Subject input to the period mass-apply overlay dialog**, in the same style as Venue and Group: a text input with a datalist of existing subjects (from the plan's lesson tiles), maxlength 500, placeholder "Leave blank to keep current values". It sits with Venue and Group in the fields row.
2. **Subject is optional, exactly like Venue and Group.** Blank means "leave this field unchanged" on existing tiles, and blank on created tiles. A filled Subject is written to every lesson tile at the period (existing-only mode) and to every tile created in empty cells (create mode).
3. **Extend the `bulkEdit` column branch** (`shared/roster-stapler.js:209`): allow `'subject'` in the patch keys (currently only `['venue','group','classIds']` are allowed) and extract it in the values loop (currently only `['venue','group']`). The "already matches" check must include Subject, so an apply that only sets a Subject every tile already has reports "already matches" and changes nothing.
4. **Created tiles use the dialog's Subject.** In `bulkCreateTiles`, the column (non-row) case currently sets `subject:''`. Change it to use `values.subject` (blank when the dialog's Subject is blank). The row case is unchanged (it already uses `values.subject`).
5. **Nothing else changes.** The choice (a)/(b), the teacher picker, the class picker, the one-Undo rule, the atomic conflict rejection, recess handling, and "changes stay local until Save to online" are all unchanged. No allocation, no relief, no publication, no WhatsApp. The class-row mass-write is unchanged (it already has Subject).

## Files/domains owned (include generated outputs)
- roster-update/public/roster-stapler-ui.js (Subject input in the period overlay dialog, include it in the patch).
- shared/roster-stapler.js (`bulkEdit` column branch — allow and extract `subject`; `bulkCreateTiles` — use `values.subject` for the column case).
- Tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
- Changing what the (a)/(b) choice does; moving or deleting tiles; changing recess; allocation; relief; publication; any live data, settings, merge or deploy.
- Do not rebuild release t or touch any release branch.

## Acceptance checks
1. Test: period apply with a Subject changes the subject on every lesson tile at the period and no tile at any other period (fails on current code — Subject is rejected).
2. Test: period apply with a blank Subject leaves the subject unchanged on every tile.
3. Test: period apply with a Subject every tile already has reports "already matches" and changes nothing.
4. Test: period apply with (b) create mode and a Subject creates tiles in empty cells with that Subject; with a blank Subject the created tiles have a blank subject.
5. Test: period apply with only a Subject set (Venue/Group blank) changes nothing except the subject.
6. Browser test: the Subject input appears in the period overlay with a datalist of existing subjects; applying a Subject shows the changed count; the (a)/(b) choice and teacher picker still work.
7. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Review notes for Muse (reviewer)
- Review at the exact head with HANDOVER_REVIEWER.md §2.
- Check especially: Subject is accepted by the column branch and extracted into values; blank Subject never clears a value; the "already matches" check includes Subject; created tiles use the dialog's Subject; the (a)/(b) choice, teacher picker, one-Undo rule, atomic rejection and recess handling are unchanged; changes stay local until Save; allocation/relief/publication untouched.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the feature works only after the owner redeploys with this fix, and it is wanted in the next release after t.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not change live data, settings, or release branches.

- Claim: Model: Codex, 12 November 2026. Owner-authorized request, next after #123. Branch created from current main. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.

## Implementation claim

Model: Codex. Fresh branch `codex/stapler-period-mass-apply-subject` from verified current main `c7590be14d027c3da3aec5f0f4aed9d4c5c2d7fb`, before product edits. The existing task claim is retained. This task supersedes the earlier no-Subject restriction only; creation behavior, class-row actions and release t remain unchanged.

## Implementation and handoff

Model: Codex. The period dialog now renders Subject before Venue and Group, with the same optional-field placeholder and 500-character limit. Its datalist comes from lesson-tile subjects only. The column patch accepts Subject and uses the existing blank-value, matching-value and validation rules. Newly created column tiles carry the requested Subject in both their current and original card details; a blank Subject leaves existing tiles unchanged and creates blank-subject tiles. Row creation behavior is unchanged.

The existing creation choice, teacher/class pickers, conflict rejection, Undo/Redo, recess exclusion and Save to online path are reused without modification. No allocation, relief, publication, WhatsApp, configuration or release logic changed. The old no-Subject restriction is superseded by this task.

Validation: the new model regression fails on the original code because Subject is rejected. It passes for Subject-only isolation, untouched other periods/recess/fields, blank/matching values, the 500-character limit, both creation views and rollback on a creation conflict. Browser checks verify the field, placeholder/limit, lesson-only datalist, changed and already-matching counts, creation with Subject and existing teacher-choice/Undo behavior. The old invalid-field test now rejects teacherId, which remains unsupported in a period patch. Full local, clean-build and exact-head CI results belong in the draft PR body after they complete. Browser path in this workspace is `/usr/bin/chromium`; all three browser environment variables use it with TZ=Asia/Singapore.

Owner deployment: include this change in the next release after v0.9.9t. Release t, its label and all release branches are untouched. Changed Roster Pages assets are `roster-stapler-ui.js`, generated `roster-stapler-model.js` and generated `edge-roster-domain.js`. Canonical Notification and Operations Worker bundles also include the shared model. Google remains frozen; regenerated Google artifacts are tracked parity outputs, not a request to redeploy Google. Preserve flags, bindings, URLs and credentials. Refresh an open planner after deployment. Rolling back the UI removes the new input but must retain saved plans and their Subject values.

Not tested: live school records, production sessions, Google/D1/provider endpoints or deployment. All new fixtures are synthetic. No merge or deployment performed.
