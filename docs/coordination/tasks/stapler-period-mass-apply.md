# stapler-period-mass-apply: One down arrow at each period header writes the same venue, group and/or class down the whole period (mass assembly)

- Status: proposed (URGENT, cuts the queue — owner, 11 Nov ~17:49, "cut queue inject"; wanted by tonight in the next release)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~17:49
- Branch: codex/stapler-period-mass-apply
- Base SHA: re-check main's head before branching (lane R serial; this jumps ahead of `roster-relief-instructions-info-only`, which follows after this PR merges)
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
