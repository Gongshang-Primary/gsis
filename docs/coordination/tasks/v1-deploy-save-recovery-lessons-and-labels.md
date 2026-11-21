# v1 Deploy: save-recovery lessons & readable review labels (from #245 / #247)

- Task ID: `v1-deploy-save-recovery-lessons-and-labels`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-save-recovery-lessons-and-labels`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `15fb5ee` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-save-recovery-lessons-and-labels.md`
- `v1/web/shared/deploy-ui.js`
- `tests/v1-product-deploy-save-recovery-browser.mjs`

## Scope
1. **Readable assignment-review labels in v1 (`v1/web/shared/deploy-ui.js`)**:
   - Port `#247`'s `draftReviewTitle()` / `draftReviewValue()` wording (teacher name, class/TG label, subject, and `Assigned` / `Not assigned` instead of raw assignment keys and booleans) into `v1/web/shared/deploy-ui.js` without modifying v0.9 `public/` files, deferring cleanly if native `draftReviewTitle` is already present after `#247` merges.
2. **Regression handoff from `#245` (`tests/v1-product-deploy-save-recovery-browser.mjs`)**:
   - Add explicit browser regression for Scenario 1 (unrelated retained pending operation + fresh Deploy edits encountering a pre-dispatch refusal keeps all new edits editable, clears `queueFlight`, creates no phantom pending entry, and sends zero `/lease` or `/change` requests).
   - Add explicit browser regression for Scenario 6 (Review of queued `addTeacher` / `removeTeacher` edits shows escaped human-readable teacher, class/TG, subject labels and `Assigned` / `Not assigned` wording rather than raw opaque IDs or `true`/`false`).
