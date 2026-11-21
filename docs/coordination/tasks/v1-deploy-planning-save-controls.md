# v1 Deploy planning pages need a visible Save changes button

Model: Codex. Recorded 21 November 2026, Asia/Singapore.

- Status: **Queued for implementation**. This changelog entry is the only file in scope for this update.
- Owner/model: Codex. v1 coordinator: ChatGPT. Reviewer for implementation: Muse at the exact head.
- Evidence baseline: v1.09 `e107b5ed62db6cfa2c59f61367902bb2f8957f9e`. Refresh main and active claims before claiming implementation files.

## DEP-21-004 — Make saving visible on all six highlighted pages

Place a visible **Save changes** button in the Deploy workspace toolbar for authorised editors on **Dept, Committees, CCAs, PLT, Events and Duty**. Show it disabled on a clean page and enable it when there are valid staged changes. Keep the existing version-wide draft save, status, discard and original-save recovery. Save stores the draft revision. Publication remains a separate action.

The screenshot shows the clean Dept page without a save control, even though the refresh banner tells the user to save changes. The shared toolbar omits all six views from its editable-page list. With nothing queued, it hides the whole toolbar. The same source logic shows the existing **Save to online** control after an edit is staged. A direct evaluation of that predicate confirmed both states for each page. [Toolbar visibility](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/app.js#L1128-L1137)

The five group pages stage `setOrganisation`. Duty stages `setDuties`. Both use the shared draft queue and the v1 save and receipt flow. The visibility change should use that existing flow, preserving validation, capability checks and failed-save recovery. [Group draft](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/planning-ui.js#L2-L5) · [Duty draft](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/planning-ui.js#L89) · [v1 save](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/scripts/v1/build-web.mjs#L679-L695)

Acceptance: use the built browser with a synthetic editable draft. Visit all six pages, verify a visible disabled button on arrival, stage an edit, save, and reload to verify persistence. Verify that the button stays visible after save, read-only users cannot submit changes, and an unconfirmed save still exposes the original recovery controls.

Verification for this entry was source inspection and a direct predicate check. Browser UAT and product CI are pending implementation.
