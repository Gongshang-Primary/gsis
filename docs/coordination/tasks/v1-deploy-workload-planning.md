# v1 Deploy planning Workload headcount and specialist pools

- Status: claimed on 21 November 2026 SGT.
- Model: Codex. Coordinator: ChatGPT. Exact-head reviewer: Muse.
- Branch: `codex/v1-deploy-workload-planning`.
- Base: `0c98b728284878c4869548e01f99f078d2e41050`.
- Exact scope: this task record, `scripts/v1/build-web.mjs`, `v1/web/shared/deploy-ui.js`, `v1/web/shared/core-table.js`, and `tests/v1-product-deploy-workload-planning-browser.mjs`. #254 owns distinct Contacts/Deploy service, model and eligibility-helper paths. The Layout race work uses disjoint paths.

The owner reports v1.09 Workload showing zero full-time teachers and empty specialist pools alongside nonzero assigned periods. The v0.9.9y screenshot shows a different planning version. Compare causality with matched synthetic inputs. The legacy calculator uses the selected version's activity and planning classification. In v1 the embedded calculator's closed-over eligibility instead requires accepted Contacts teaching evidence. Changing the selector predicate in #204 did not change the calculator. With 129 synthetic active PE-assigned staff lacking accepted EO evidence, the pinned v0.9 engine produced 129 full-time teachers, 129 specialists and 516 assigned periods. The current v1 browser calculator kept 516 assigned periods but showed zero teachers in both pools and 131 setup warnings. This reproduces the pattern with synthetic data.

Compute the Workload, Stats and Ledger planning benchmarks from the selected version's existing planning eligibility and settings. Preserve unknown activity and excluded staff rules, historical assignment totals, FAJT and part-time treatment, unavailable values for missing data, and existing formulas. Label the planning basis on screen and in applicable visible report exports. Displayed server-sourced R, immutable publication calculations, accepted Contacts facts and Roster permissions and capacity are outside this change.

The existing builder adaptation supplies an explicit eligibility input to the legacy calculator because its eligibility predicate is private inside the embedded closure. The v1 adapter selects it only for planning reports. The default eligibility stays accepted-evidence based. No v0.9 or Worker source change, migration, provider interaction, deployment or live read/write. Pstack Fix Root Causes guides matched-input reproduction and read-path verification.
