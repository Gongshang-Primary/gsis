# Deploy Duty weekday alignment

- **Status** Claimed on 23 November 2026, 11:32 SGT
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-duty-recess-parity`
- **Base before claim** `016e03675756520b260e724b7c7e63be0bbc3256`
- **Owner request** Work on the outstanding v1 items, including DEP-23-001.
- **Exact scope** This task record, `v1/web/shared/deploy-duty-ui.js`, `v1/web/shared/deploy-ui.js`, and `tests/v1-product-deploy-duty-recess-browser.mjs`.
- **Evidence** [Duty UAT ledger at its documentation head](https://github.com/Gongshang-Primary/gsis/blob/014b2af6f4a64aa171f30e5b7a32a0b86116d100/docs/v1/DEPLOY_DUTY_UAT_2026-11-23.md)

Align equivalent weekday Recess duties in the Deploy Duty screen and print view. Keep the original duty ID, weekday, timing and assignment for every editable occurrence. Preserve same-day duplicates, visible timing exceptions, unscheduled days, permission checks and normal save and reload behavior.

Prove the duplicated-column symptom with synthetic data, then verify the built browser and Worker/D1 path. Cover six weekly duties, separately stored weekday duties, real exceptions, edit/save/reload, read-only viewing and PDF parity. Run relevant save and duty regressions. Product changes stay in v1. The task excludes hosted records, migrations and deployment.
