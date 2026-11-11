# stapler-period-mass-apply: One down arrow at each period header writes the same venue, group and/or class down the whole period (mass assembly)

- Status: in progress (Model: Codex; owner resolved duplicate-coverage stop condition)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~17:49
- Branch: codex/stapler-period-mass-apply
- Base SHA: 522094e9ba63617e41dc9fb352e8f7717e0d03f3 (verified current main before branching)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- Owner ruling (11 Nov, verbatim in substance): "currently we have the yellow highlighted functions in class which mass-writes the value across the whole row. wish for 1 single down arrow (see red arrow) at each period header that allows us to write the same venue, group and/or class. on click, opens a overlay for us to key in the values. used for creating the same mass-assembly across whole school. wish to have by tonight in next release"

## Problem
In the Stapler planner class view, each class row has Subject / Venue / Group fields with a "→" button (`classFields`, roster-stapler-ui.js:220) that mass-writes one value across the whole ROW (all periods for that class). There is no equivalent for a COLUMN: to create a mass assembly (every class in the Hall at P2, same group), the SMC must edit each class's tile one by one.

## Required behaviour
1. **One down arrow (↓) at each period header** in the Stapler planner grid — in the teacher view's `<thead>` period cells and the class view's period row (`<tfoot>`, "Periods"), next to the period label. Only when the plan is editable (`s.data.canEdit`); disabled/hidden otherwise, matching the existing row mass-write.
2. **Click opens one overlay** (dialog, reusing the tile edit form's field style) with three fields: **Venue**, **Group**, and **Class** (a class picker reusing the tile edit form's existing-classes checkboxes plus custom class). Each field is optional. Blank means "leave this field unchanged".
3. **Apply writes the filled-in values to all lesson tiles at that period** (down the whole column, across all classes/teachers). It reuses the `bulkEdit` command path (`shared/roster-stapler.js:190`, which already accepts a `periods` filter) — extend it to accept a period without a classId, and to accept a `classIds` patch (validated: every id must be an existing class, or a custom class created the same way the tile edit form creates one).
4. **Only existing lesson tiles are changed.** Recess tiles are untouched. Empty cells (no tile at that period) are left empty — no tile is created. A tile whose period is spanned by a multi-period lesson is changed once (by its start period).
5. **Changes stay local until Save to online**, exactly like the row mass-write ("Changes stay local until Save to online."). After applying, tell the SMC how many lesson tiles were changed (and how many were already matching, if any).
6. **Nothing else changes.** No allocation, no relief, no publication, no WhatsApp. The plan's teachers, classes, periods and recess blocks are untouched. The existing row mass-write (Subject/Venue/Group) is unchanged.

## Files/domains owned (include generated outputs)
- roster-update/public/roster-stapler-ui.js (period-header down arrows, overlay dialog, apply handler).
- shared/roster-stapler.js (`bulkEdit` — period without classId, `classIds` patch validation).
- Tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
- Subject in the overlay (the owner asked for venue, group and/or class only).
- Creating tiles in empty cells; moving or deleting tiles; changing recess; allocation; relief; publication; any live data, settings, merge or deploy.
- If setting `classIds` to the same list on every tile at a period would create duplicate coverage (several tiles at the period already cover different classes), stop and report back to the owner instead of silently unifying them.

## Acceptance checks
1. Test: applying venue+group at P2 changes every lesson tile at P2 and no tile at any other period (fails on current code).
2. Test: a blank field leaves that field unchanged on every tile (venue set, group blank → group untouched).
3. Test: recess tiles at the period are untouched, and empty cells gain no tile.
4. Test: applying a class list sets `classIds` on the period's lesson tiles; an invalid class id is rejected.
5. Test: applying values that already match every tile at the period reports "already matches" and changes nothing.
6. Browser test: the down arrow appears at each period header in both views when editable, and is absent/disabled when the plan is read-only; the overlay opens, and applying shows the count.
7. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Review notes for Muse (reviewer)
- Review at the exact head with HANDOVER_REVIEWER.md §2.
- Check especially: the apply touches only lesson tiles at the chosen period (no other period, no recess, no empty-cell creation); a blank field never clears a value; `classIds` are validated and the duplicate-coverage case is handled per the out-of-scope note; changes stay local until Save; allocation/relief/publication untouched; the arrow is absent when read-only.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the feature works only after the owner redeploys with this fix, and it is wanted in tonight's release.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not change live data, settings, or release branches.

- Claim: Model: Codex, 11 November 2026. Owner-authorized branch created from current main. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.

## Codex investigation: duplicate coverage requires owner ruling

Model: Codex, 11 November 2026. Branch `codex/stapler-period-mass-apply` created from current main `522094e9ba63617e41dc9fb352e8f7717e0d03f3`. No product implementation, live operations or changes to the existing info-only PR #115. The new priority supersedes the previous queue ordering; #115 remains a draft.

The task explicitly requires stopping if a uniform classIds patch would duplicate coverage. A synthetic in-memory plan with two teachers at P2, one assigned Synthetic A and the other Synthetic B, confirms this case. Applying the existing validated tile-edit classIds operation to both tiles with `[class-a]` succeeds: Synthetic A then has two simultaneous lesson tiles and Synthetic B has none. The original plan is unchanged. The class-slot validator currently rejects recess overlaps but permits simultaneous lesson tiles for a class. Consequently, the new period bulk operation cannot rely on existing validation to prevent this case.

Evidence: `TZ=Asia/Singapore node /tmp/stapler-mass-apply-duplicate-proof.cjs` passed against the exact main model copied to `/tmp/stapler-mass-apply-model.js`. This is a diagnostic reproduction using synthetic data, not an implementation acceptance test. No canonical build, full local suite or CI was run for a product implementation because none was made.

Recommended bounded resolution, pending owner direction: allow Venue and Group across all existing lesson tiles; allow Class only if the requested replacement creates no new duplicate coverage, otherwise reject the whole apply without changing any field and ask the user to leave Class blank. Do not merge tiles, drop original class coverage, alter teachers or create tiles. Owner direction is required before implementing that behavior because the task says stop and report.

## Owner resolution, 11 November 2026

Owner: "take the latest action as canonical. user relies on undo function to undo." This supersedes the duplicate-coverage stop condition and the proposed rejection above. Apply the selected class list to every existing lesson tile starting in the chosen period, including when that produces identical class coverage on several tiles. Preserve tile identities, teachers, periods and recess; do not merge or delete tiles. Use one existing local command/Undo entry for the whole apply, so Undo restores all prior values and any newly created custom class. Blank fields still leave values unchanged. No remote save until Save to online.

## Implementation and validation handoff

Model: Codex. The existing `bulkEdit` path now accepts a period-only selection and optional Venue, Group and Class values. Blank fields and empty class selection leave values untouched. Existing lesson tiles are selected by their start period; recess, other periods and empty cells are unchanged. Class IDs are validated and custom classes use the existing class creation helper. The existing class-row Subject/Venue/Group path is unchanged.

Both editable grids use the shared header button and one dialog with the existing class picker. The whole action uses one existing local command-history entry. Changed and already-matching counts are reported; a fully matching apply changes neither plan nor Undo history. No network save happens until Save to online. The owner's latest-action ruling supersedes the duplicate-coverage stop condition above; this may intentionally leave multiple lesson tiles with the same class coverage. Undo is local session history and the existing Save flow clears it.

Evidence: the new model regression fails on the original code with "Choose a class" and passes after the period extension. The new Chromium regression passes for both header locations, Venue/Group application, canonical class replacement, changed/already-matching counts, existing and custom class selection, whole-action Undo/Redo, local-only edits and read-only controls. Full local suite and exact-head CI are required before opening a draft PR; actual final results and SHA are recorded in the PR body.

Deploy files: Roster Pages `roster-stapler-ui.js` and the regenerated `roster-stapler-model.js` and `edge-roster-domain.js`; regenerated Notification and Operations Worker bundles contain the shared model. Canonical generated Google bundles are retained in git, but Google stays frozen; no Google redeploy is performed or claimed. No settings, credentials, data, flags or release branches were changed. Owner decides deployment; this feature is available only after the updated assets are deployed.

The browser regression additionally forces a full server-driven redraw after Save and verifies all period controls remain available. Controls are disabled during busy/blocked access and omitted for read-only plans. Nine targeted Stapler regression programs passed before this final redraw check; the final full suite repeats all selected tests.
