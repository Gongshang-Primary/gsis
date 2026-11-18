# Muse review — PR #205: select Duplicate source and stabilise Versions note saves

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #205, branch `codex/v1-deploy-duplicate-selection`, OPEN, MERGEABLE, draft for review.
- Exact head reviewed: `456f264796ea24ed03a51df9fe3eb96f9edf1cd5`.
- Base (diagnostic-scope clarification): `d487700f12f98c2ca0c28401f08f4c2e26f238e0` (merge-base of the head against current origin/main `22c41922`, which is the #207 merge on top of `beb6cce7`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Versions now has an explicit radio selection for the source to Duplicate, independent of the loaded planning version, and three Versions note-save races are corrected: (1) an enabled Save during a held background read was a guarded no-op; (2) an automatic read started at Save pointer-down disabled the button before the click dispatched, so no save ran; (3) textarea blur triggered legacy compact refitting that shrank the five filters from 174px to 68px and moved Save under the pointer, so the click landed elsewhere.

## Scope verified

- Diff is exactly the three paths in the task record `docs/coordination/tasks/v1-deploy-duplicate-selection.md`: the task record, `tests/v1-product-deploy-duplicate-selection-browser.mjs`, `v1/web/shared/deploy-publication.js`. 1,035 insertions, 1 deletion.
- The save-recovery test `tests/v1-product-deploy-save-recovery-browser.mjs` was in the authorised four-file scope for diagnostics only; it is byte-for-byte unchanged in the final tree — verified by an empty diff between `9ef19ad` and the PR head.
- `git merge-tree --write-tree --name-only origin/main 456f264` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No backend, builder, migration, dependency or configuration change. No deployment. No live data change.

## Design read

- Duplicate source selection (all in the existing v1 publication module, wrapping native rendering/creation; no build-web text patch): one accessible radio per version keyed by stable version ID, with `aria-label` carrying name and ID so equal display names stay distinct. The choice is in-memory presentation state, defaulting once to the loaded version when it is in the list, retained through redraw, sorting and filtering (the selection is resolved against `state.versions`, not the visible rows), and cleared — with Duplicate disabled and no silent substitute — when the selected version is removed or invalid. The loaded version is never swapped to trick the native action into copying a different source.
- Creation: the wrapper seeds the existing native creation attempt only after the ordinary draft/edit guards pass (unresolved notes, cell queue, queue flight, busy, editing, acquiring, unsaved draft, exclusion edits); it prompts with the selected source's name, then allocates the attempt with that source and a fresh UUID. The native creation request, response handling, New planning version flow, server idempotency and Contacts refresh are unchanged. An existing attempt keeps its source and request UUID, radios stay locked, and the button becomes "Retry the original creation request". Cancel makes no new version or source edit. Protected-state clearing resets the selection.
- Note Save readiness: the wrapper around `updateVersionNoteControls` disables Save while a background read is in progress (including newly rendered rows and input updates) and restores native control state when the read settles; the native guard, draft text, operation IDs, leases and receipt handling are unchanged. Automatic `refresh(false)` defers while `notesUnresolved()` reports dirty text or a retained note attempt, so it cannot disable Save between pointer-down and click; explicit `refresh(true)` still reads current state while retaining the draft. No automatic or queued save is added; a deferred background signal may be consumed, and server revision checks remain authoritative.
- Stationary Save: one idempotent Versions-only style rule (`.gsis-core-filter input { width:100% !important; }` under `#content[data-view="Versions"]`) keeps the five filter widths fixed while legacy refitting measures them, so blur refitting cannot move Save mid-gesture. Existing compact minimum/maximum rules, column resize handlers, filtering, Compact action and horizontal scrolling are preserved.

## CI verified at the exact head

- Node/LORD run 44067958190: head_sha verified `456f264`, completed success, all five jobs green (1,226/1,226 Node programs, 40/40 LORD per shard).
- Product run 44070978964 (checks page): head_sha verified `456f264`, completed success. Product run 44067986589 (linked in the PR body): head_sha verified `456f264`, completed success (125/125 product programs; artifact 14321848811).
- Failure history (disclosed in the PR body, not waived): at `fe641919`, product 44053929262 passed 124/125 with the unchanged recovery test timing out at its historical-note wait; at `173af619`, Node 44059515022 and product 44059656341 failed the same program at the current-note wait; at `9ef19ad`, Node 44062884721 and product 44062905562 failed it at line 480. Each failure drove one of the three corrections above, and the final head is green on both CI sides.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-duplicate-selection-browser.mjs` — PASS (10/10 groups: A loaded/B selected, equal names, sort/filter/redraw, invalid/deleted sources, cancel/no write, ordinary permission denial, native pending-intent locking, identical UUID retry after a committed lost response, one resulting duplicate, unchanged sources, New planning version compatibility, protected-state reset, and the held-read/pointer-down/blur-refit regressions).
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS (15/15 groups, unchanged file, including current/historical note recovery, exact retries, lost responses, withdrawal and protected contexts).
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS.
- `node tests/v1-product-deploy-memberships-browser.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative controls, builder-stated and consistent with the recorded failure history): the new browser test failed with 0 radio controls where 2 were required before the selection change; the held-read regression failed before the readiness correction; the pointer case failed with `false !== true` for click delivery before the automatic-read deferral; the layout case failed at the geometry assertion before the width rule. The passing states are re-verified locally above, and the unchanged recovery test passes here in 15/15 groups.
- N2 (open separate bug, disclosed in the PR body and task record, not fixed here): with A loaded, save B's note, Refresh, then save B's note again — the second save can still send B's old revision and receive `409 REVISION_CONFLICT`. The draft remains protected. This PR does not fix consecutive note saves on a nonloaded version, and its tests do not claim otherwise.
- N3 (overlap, not blocking): #207 merged as `22c41922` while this review was in progress. #205's diff touches only `deploy-publication.js` (plus its test and task record); #207 touched Deploy eligibility/model/direct-fields/ttb-name/deploy-ui. No shared product-file overlap, and the merge-tree against current main is clean. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner request recorded (radio selection for Duplicate source); coordinator-authorised adjacent corrections with deterministic reproductions; exact scope in the task record.
- Q02: Pass. Existing native creation attempt and recovery boundaries unchanged; no new persistence or reload-recovery contract.
- Q03: Pass. Capability, revision, lease and receipt checks retained; ordinary-user denial exercised.
- Q04: Pass. Pending-intent locking, identical-UUID retry, one resulting duplicate, and the unchanged recovery test's exact retries/lost responses exercised locally and in CI.
- Q05: Pass. Bounded Deploy web-asset route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is the bounded UI/test commit, with no schema or data rollback.
