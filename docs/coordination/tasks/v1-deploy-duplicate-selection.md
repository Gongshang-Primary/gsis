# v1 Versions: explicit radio selection for Duplicate

- Status: implemented and locally verified; exact-head CI and independent Muse review pending. No PR, merge or deployment yet.
- Owner/model: Codex; coordinator: ChatGPT; reviewer: Muse at the exact head.
- Updated: 17 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-duplicate-selection`. Base: main `8e72c47809a61c0229bef3ae99b35e26f6736c04`.
- Owner request: “should have radio button selections so that user can select which version to duplicate”. The current authorised Subject Load fix continues separately; the coordinator permits these two disjoint bounded tasks in parallel. No backend, builder or source path overlaps.
- Exact owned files: this task; `v1/web/shared/deploy-publication.js`; `tests/v1-product-deploy-duplicate-selection-browser.mjs`.
- Out of scope: v0.9 source; creation/publication policy; Contacts-refresh semantics; identity/capability/revision/lease/recovery contracts; source-version mutation; deployment/migration/live data/providers. No merge or deployment is authorised by this coding task.

## Contract

Add one accessible radio selection keyed by stable version ID to the existing v1 Versions table, separate from the loaded version. Default once to the loaded version when it is in the list; retain an explicit selection through redraw, sorting and filtering. A removed or invalid selected version clears the selection and disables Duplicate; do not silently substitute another source. Keep the existing Duplicate button name and show its selected source in adjacent guidance/title and the confirmation/name prompt, avoiding unrelated locator or UI changes. New planning version creation remains unchanged.

Use the existing v1 module to wrap Versions rendering and duplicate creation; do not add build-web text patches. Never temporarily change the loaded current version. Reuse the native creation attempt and its stable request ID/source binding for uncertain/lost-response recovery. Existing pending creation is retained and radios locked; changing selection must not alter an already-issued operation's intent. Reset selection on protected-state clearing. Server continues to refresh existing teacher facts/Memberships from current Contacts as already implemented.

## Acceptance and handoff

Exercise actual built browser, native owner request and local Worker/D1: load A/select B/duplicate B; selected ID survives sort/filter/redraw; cancel makes no new version or source edit; invalid/deleted source cannot be silently replaced; ordinary users denied; lost response retries use the same source/request and create one result; source A/B documents stay unchanged; current Contacts refresh remains covered by the existing duplicate regression. All identities and data are synthetic.

Run TZ=Asia/Singapore canonical build/no drift, targeted browser/duplicate regression and required exact-head Node/LORD/product CI before draft PR; disclose unrun checks. Model: Codex on all commits and PR. Muse independently reviews the exact functional head; release-packaging review waiver does not apply. No live UAT, provider action, hosted write or deployment. F5 OPEN; T1B-01/T1B-02 and hosted runtime UAT remain Not tested.

Publish this task-record-only claim with an expected-head, non-force update under WORKFLOW Start session4, then implement from the accepted claim. Preserve the separate load-fix and eligibility queues; no unclaimed shared file edit. Q01 scope recorded; Q02-Q05 preserve native identities/recovery; Q06/Q07 pending; Q08 no release authority.

## Implementation and local evidence

Accepted claim: `9dc353d26d75496b2caaf8d450bb017c20715f77`. The implementation adds a radio column and source guidance through the existing v1 module. The Version name column retains native name sorting. The selected ID is in-memory presentation state; the loaded version remains unchanged until the existing native creation succeeds. Equal display names remain separate identities. Filtering a row does not remove the source; removing it from the authorised catalogue clears the choice without selecting a substitute.

The wrapper seeds the existing native creation attempt only after its ordinary draft/edit guards and the source/name choice pass. An existing attempt always keeps its source and request UUID; radios remain locked until the native flow resolves it. The native creation request, response handling, New planning version flow, server idempotency and current Contacts refresh are unchanged. This adds no persistence or reload-recovery contract. Protected-state clearing removes the choice, and a prior async completion cannot repaint its guidance in a later protected epoch. Native toolbar relocation and incremental DOM refresh are handled without editing the shared builder or v0.9 source.

Commands ran with `TZ=Asia/Singapore`, private `XDG_CONFIG_HOME=/tmp/gsis-duplicate-selection-xdg` and Chromium `/usr/bin/chromium` for browser cases:

- `npm run build`: PASS, no tracked generated drift.
- `node tests/v1-product-deploy-duplicate-selection-browser.mjs`: meaningful pre-change failure, 0 radio controls where 2 were required; final PASS, six browser/Worker/D1 groups. Covers A loaded/B selected, equal names, sort/filter/full and incremental redraw, navigation, cancel/no write, invalid/deleted choice/no fallback, existing unsaved-input guard, lost committed response, locked source and identical retry wire/UUID, one resulting copy, source documents unchanged, native New planning version compatibility, protected-state reset and actual Core permission denial.
- `node tests/v1-product-deploy-duplicate-contacts.mjs`: PASS unchanged. All eleven refreshed typed tags, inactive/partial staff, exact clears, assignments/notes/stable IDs, unchanged Contacts/source records, authority/isolation and restart receipt recovery.
- `node tests/v1-product-deploy-memberships-browser.mjs`: PASS unchanged. Real native edits, canonical import and publish-to-Contacts receipts, including lost-acknowledgement recovery; no provider sends.
- Both changed JavaScript files pass `node --check`; `git diff --check` passes. The existing `scripts/v1/test.mjs` filename discovery includes the new browser test without runner changes.

Skill entry: inspected the available catalog and repository skill policy; applied bounded red/green verification, owner-boundary analysis and reuse of the existing creation mechanism manually. No skill package was executed, installed or copied. No dependency changes.

Q01–Q05: locally satisfied by the accepted three-path claim, separate stable UI identity, unchanged owner authority/commit/retry boundaries and bounded existing-catalogue rendering. Q06: the listed local checks pass; full exact-head Node/LORD/product CI is still pending. Q07: coordinator diff review and independent Muse review at the eventual exact head are pending. Q08: no release authority exercised; hosted UAT remains Not tested and F5 remains OPEN. Rollback is the bounded UI/test commit; no schema, resource or data migration is involved.

## Follow-up: note Save readiness during refresh

At implementation head `fe641919c4c1cad053967ea28e96edada0e44a41`, Node CI passed 1226/1226. [Product run 44053929262](https://github.com/helper-gsps/gsis/actions/runs/44053929262) passed 124/125 programs; only the unchanged save-recovery browser test timed out at line 527 while waiting for the second, historical version-note attempt. The unchanged test reproduced that timeout locally. A parent-source archive of claim `9dc353d26d75496b2caaf8d450bb017c20715f77` passed the unchanged test; its builder used read-only candidate Git metadata, so this was a source baseline comparison, not a clean-parent manifest verification.

A deterministic local Worker probe held the background read response on both parent and candidate. Both showed an enabled Save note button while `refreshing` was true: the native save guard returned without a write or attempt. Releasing the read allowed the same retained note to save. This proves a pre-existing control-readiness mismatch. The original CI did not record click-time guard values, so the controlled reproduction does not establish which internal branch caused that exact timeout.

The coordinator authorised this adjacent Versions correction within the same three files. The v1 module now disables note Save while the existing refresh guard refuses saving, including newly rendered rows and input updates, then restores the native control state when the read settles. The native guard, draft text, operation IDs, leases and receipt handling remain unchanged. Protected-epoch checks prevent a prior read from repainting a later context. No timeout increase, assertion relaxation, builder edit or new recovery mechanism is included.

Follow-up evidence, with `TZ=Asia/Singapore`, Chromium `/usr/bin/chromium` and separate private XDG directories:

- New deterministic regression failed before the correction because Save note remained enabled during the held read. After the correction, `node tests/v1-product-deploy-duplicate-selection-browser.mjs` passed all seven groups: no save while held, original draft retained, release followed by one native owner save, and unchanged Duplicate selection.
- The **unchanged** `node tests/v1-product-deploy-save-recovery-browser.mjs` passed all fifteen groups, including historical note recovery, exact retries, lost responses, withdrawal and protected-context boundaries.
- Private local logs: `/tmp/gsis-duplicate-note-ready-red.log`, `/tmp/gsis-duplicate-note-ready-green.log`, `/tmp/gsis-duplicate-recovery-corrected.log`. Baseline/candidate investigation: `/tmp/gsis-duplicate-note-readiness-findings.md` and the linked local probe logs.

The previous failed CI remains recorded; it was not blindly rerun or waived. Follow-up exact-head CI and independent Muse review remain pending. The original duplicate/Contacts and memberships regressions above passed before this readiness-only follow-up. No live operation, merge or deployment occurred.

## Follow-up: preserve Save click during an automatic read

[Node CI run 44059515022](https://github.com/helper-gsps/gsis/actions/runs/44059515022) at `173af619d9d5bff257e73ae5d2b2d40a12b76c15` failed only the same unchanged recovery browser program, this time at line 480 for the first/current version note. The unchanged local run and a temporary instrumented run both passed all fifteen groups. Those passes do not dismiss the CI failure or establish its cause.

A second deterministic probe starts a real background read at Save pointer-down. The refresh-readiness wrapper disables the button before the browser dispatches click, so no click or native save invocation occurs. The read then completes with the exact draft retained, no attempt, and all save guards clear. This reproduces another real readiness race and the resulting wait failure; neither CI run recorded click-time state, so their exact internal causes remain unproven.

The coordinator authorised a narrow correction in the same three files: automatic `refresh(false)` or default refresh now defers while the existing `notesUnresolved()` contract reports dirty text or a retained note attempt. Explicit `refresh(true)` remains available and preserves the draft. Existing original receipt/retry paths, UUIDs, revision/lease/capability checks and native save guards are unchanged. No read retry loop, queued save or automatic save is added. A deferred background signal may be consumed; explicit Refresh remains the way to request current data, and server revision checks still govern writes.

The new browser regression retains both event orderings: a read begun while clean, followed by typing, still disables Save until that read settles; a read requested at pointer-down on an already dirty note is deferred, preserving the original click. It also verifies foreground refresh retains the text without saving, no automatic read is sent, the click sends one native owner save, the resulting D1 note matches, and Duplicate selection is unchanged. The new pointer case failed before the correction with `false !== true` for click delivery (`/tmp/gsis-duplicate-pointer-red.log`). Final local results are recorded below; the original recovery test remains unchanged.

**OPEN follow-up — consecutive nonselected note saves:** in a synthetic local A/B scenario, with A loaded, save B's note from revision 0, explicitly Refresh, then save B's note again. The second native request can still carry cached revision 0 after B has committed revision 1. The owner returns `409 REVISION_CONFLICT`; the draft and original operation remain protected. This is not fixed by the radio/readiness change. The pointer regression uses the currently loaded version, matching the latest CI failure point; neither it nor the existing historical-note checks proves consecutive nonselected note saves. Diagnostic evidence: `/tmp/gsis-duplicate-pointer-save-diag.log`; no real school records or identities were used.

Final local checks: the new browser test passed **8/8 groups** (`/tmp/gsis-duplicate-pointer-final.log`); the unchanged recovery browser passed **15/15 groups** (`/tmp/gsis-duplicate-pointer-recovery.log`). The final current-version pointer case also failed as expected in a temporary probe that removed only the served automatic-read guard (`/tmp/gsis-duplicate-pointer-final-red.log`). Syntax, whitespace, unchanged old-test and exact three-file scope checks pass. The source diff over `173af619` is three added lines, without unrelated formatting changes. Required follow-up exact-head CI and independent Muse review remain pending; no PR, merge, deployment or live UAT is claimed.
