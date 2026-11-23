# Deploy Stats and Ledger UAT, 23 November 2026

Model: Codex. Times are Asia/Singapore.

## DEP-23-002 — Stats shows unavailable relief averages alongside planning figures

**Open for hosted diagnosis.** Logged on 23 November 2026 at 11:03 SGT. The owner’s v1.10 screenshot shows a saved draft with numbers for individual benchmark span, actual occupancy summaries and headcounts. Each of the eight `R (average)` cells says `Unavailable`. The comparison uses pinned v0.9.9y source. A matching hosted v0.9 Stats screenshot or calculation for the same planning inputs was unavailable for this log. [v1.10 release source](https://github.com/Gongshang-Primary/gsis/commit/d726896ce933b139721e3c0acc990b1f8f837f3e)

### v0.9.9y and v1.10 comparison

| Measure | v0.9.9y | v1.10 |
| --- | --- | --- |
| Occupancy, benchmark span and headcount | The Stats screen analyses the selected version with the legacy teacher classification. | The browser uses the selected version’s planning staff eligibility, assignments and settings. #259 adds the planning-estimate notice. |
| Individual weekly relief quota `R` | The backend derives the result from its version-owned teacher records, membership mapping, draft fields and workload settings. | The Deploy Worker uses the version’s workload and settings with accepted Contacts profiles and teaching eligibility. It clears draft teacher overrides from this calculation. |
| Category `R (average)` | Averages the backend’s individual quotas when all members have a finite value. | Uses the same averaging and unavailable-state rule. A populated planning category can contain a teacher whose individual quota is unavailable. |

The v0.9.9y source and built v1.10 asset have identical `workloadReference`, `reliefResultData` and `renderWorkloadStats` functions. An empty category or a single missing quota makes that category’s average unavailable. The UI also withholds quotas while the relief projection is pending or stale. These rules can explain the display pattern. The screenshot alone leaves the actual hosted reason open. [v0.9 workload renderer](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/workload-ui.js#L36) · [v0.9 relief calculation](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/backend/Code.gs#L2164) · [v1 planning adapter](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/v1/web/shared/deploy-ui.js#L260) · [v1 accepted relief calculation](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/v1/services/deploy/model.mjs#L618)

### Verification and follow-up

A local Node VM probe ran the extracted functions from both versions with synthetic teachers. Quotas of 2 and 4 produced an average of 3. Quotas of 0 and 4 produced 2. A null quota, an omitted quota row, an empty category, and a pending or stale projection each produced `Unavailable` in their respective cases. The #259 browser test already covers restored planning pools with a server-sourced quota still unavailable. [#259 review](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/docs/coordination/review/pr259-muse-review.md)

For hosted diagnosis, match the selected version and revision, workload/settings and eligible teacher IDs. Check each group’s coverage against the returned quota rows and reasons in the Deploy relief calculation. Compare complete groups on the same inputs and verify that any unavailable group has an explainable reason. Preserve server-sourced quotas and the accepted Contacts basis for Roster. Record any display correction separately from a quota or data correction.

The check used the supplied screenshot, source and a synthetic renderer probe. Hosted records and matched-version numeric parity were outside this investigation.

## DEP-23-003 — Calculate individual R when the required inputs are present

**Open.** Logged on 23 November 2026 at 11:10 SGT. Owner requirement: “R should be able to calculate already with enough data.” The v1.10 Ledger screenshot shows `Unavailable` for the visible individual R cells alongside a schoolwide planning benchmark, assignment and specialist workload values. This adds evidence at the individual quota level to the Stats group-average report in DEP-23-002.

Ledger reads the per-teacher result from Deploy’s relief calculation. The schoolwide demand benchmark shown on Ledger and the relief calculator’s schoolwide teaching average use different inputs. R needs eligible active staff with accepted Contacts evidence, recognised employment, valid relief settings and offload or cap inputs where applicable, complete countable workload and a valid schoolwide teaching average. The quota engine returns a reason when an input blocks the calculation. The Ledger cell displays the value or `Unavailable`. Relief Settings → Relief calculations → Details shows the reason where the result is available for inspection. The screenshot leaves the actual blocker open. [Ledger R column](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/public/workload-ui.js#L24) · [Relief calculation and reasons](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/shared/relief.js#L62) · [Relief Settings detail](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/public/relief-ui.js#L45)

A local probe of the deployed source’s shared calculator returned R = 20 for complete synthetic inputs and R = 0 for a valid zero cap. Incomplete individual workload, incomplete schoolwide teaching demand and ineligible staff each returned a null quota with its specific reason. The probe supplied workload rows directly to the calculator.

### Acceptance for a repair

- An eligible teacher with all required evidence and inputs gets a numeric R after save or refresh. A calculated zero displays as 0. Ledger and Relief Settings agree, and Stats averages complete groups.
- Trace the returned reason for a matching affected teacher and revision. If a genuinely required individual or schoolwide input is missing, identify it. A pending or stale projection should identify the save or refresh needed. Inspect optional inputs to see whether they block a calculation that already has all required data.
- Restore a missing prerequisite in a synthetic fixture and verify that R recalculates. Keep the accepted Contacts basis and the Roster publication rules.
