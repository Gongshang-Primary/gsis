# Deploy Stats UAT ledger, 23 November 2026

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
