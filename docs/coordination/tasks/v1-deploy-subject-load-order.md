# v1 Deploy Subject Load column order

Model: Codex. Claimed on 18 November 2026, 05:12 SGT. Reviewer: Muse.

- Branch: `codex/v1-deploy-subject-load-order`.
- Base before claim: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Status: implementation verified locally and committed on the task branch. Owner requested the exact sequence below and instructed Codex to commit the logged changes.
- File scope: this task, `v1/web/shared/deploy-loads-ui.js`, and `tests/v1-product-deploy-loads-browser.mjs`.
- Open draft #205 changes Versions, its test and its task only. Draft #182 is v0.9 Roster work. Neither owns these files. #203 reviewed and shipped the earlier load behavior in v1.05.

## Required behavior

Render Level → Assembly → FTGP → FTT → FORM, followed by EL → LSP → FEL → RRP → SDR → Math → LSM → FMA → CL → ML → TL → CCE → HCL → HML → HTL → MTSP → FCL → FML → FTL → Science → FSC → SS → PHE → Art → Music → PAL → CCE EL → E2K → PD.

Order the subject rows the renderer already receives. Preserve editable codes, existing calculated FORM, read-only PD and retained Legacy FORM. Custom subjects retain their relative order before PD. Existing Sci and PE data keep their codes and take the Science and PHE positions. The workbook import/export contract, Worker validation and D1 data model are outside this presentation change.

## Verification

Use the existing built browser with synthetic Workers/D1. Seed the full order in deliberately scrambled input, check actual headings and preserve the existing save, import and calculation assertions. Run the canonical build, diff checks and v1 verification. Record the tested head and CI separately from hosted UAT.

- `TZ=Asia/Singapore node tests/v1-product-deploy-loads-browser.mjs` with Chromium 151.0.7922.34: the new heading assertion failed against the original renderer, then passed with the fix. The program also passed real Worker/D1 saves, calculated FORM, read-only PD, legacy data retention, Excel import and Fortnight coverage.
- `TZ=Asia/Singapore node tests/v1-product-deploy-loads.mjs`: passed the existing native save and workbook regression.
- `TZ=Asia/Singapore npm run build`: passed, with no generated-file drift. `node scripts/v1/build.mjs` built nine services and 373 artifacts. `node scripts/v1/verify-build.mjs` passed nine dry runs and the local migration-upgrade check.
- Syntax and `git diff --check` passed. Hosted UAT: Not tested.

## Release

The claim is recorded on the task branch. Automatic approval review rejected publishing that claim directly to default `main` and directed use of the PR workflow. Submit the branch for review after required CI. No merge or deployment is authorised by this task.
