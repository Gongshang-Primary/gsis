# v1 Deploy planning pages need a visible Save changes button (`DEP-21-004`)

- Task ID: `v1-deploy-planning-save-controls`
- Model: `Antigravity` (originally logged by `Model: Codex` on 21 November 2026, Asia/Singapore)
- Branch: `antigravity/v1-deploy-planning-save-controls`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-planning-save-controls.md`
- `v1/web/shared/deploy-ui.js`
- `tests/v1-product-deploy-planning-save-controls-browser.mjs`

## DEP-21-004 — Make saving visible on all six highlighted pages

Place a visible **Save changes** (`Save to online`) button in the Deploy workspace toolbar (`#saveQueue`) for authorised editors (`deploy.edit`) on **Dept, Committees, CCAs, PLT, Events and Duty** (as well as their Program Settings twins `Dept Settings`, `Committee Settings`, `CCA Settings`, `PLT Settings`, `Events Settings`). Show it disabled on a clean page and enable it when there are valid staged changes. Keep the existing version-wide draft save, status, discard and original-save recovery. Save stores the draft revision. Publication remains a separate action.

## Acceptance
Use the built browser with a synthetic editable draft. Visit all six pages (`Dept`, `Committees`, `CCAs`, `PLT`, `Events`, `Duty`), verify a visible disabled button on arrival, stage an edit, save, and reload to verify persistence. Verify that the button stays visible after save, read-only users cannot submit changes, and an unconfirmed save still exposes the original recovery controls.
