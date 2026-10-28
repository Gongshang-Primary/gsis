# GSiS v0.5.07

Authorized by the 8 October 2026 18:55 Singapore time commit instruction. Baseline: v0.5.06, commit `01413e7836fd6ae716bb2b7afc2ab88bd4268f82`. Scope: Q174 to Q178. Write protocol remains 500.

1. Q174: Deploy Info Layout supplies MCL1 at physical C4-17 and MCL2 at physical C4-18 even when an older version has no venue registry or short name. Explicit version names win. Renamed units follow their physical geometry mapping. Existing form classes, TG labels and allocations remain intact. No extra backend request is introduced.
2. Q175: Individual R always uses actual assigned teaching for both teaching and SIUE deductions. Expected remains an Admin planning comparison and cannot replace authoritative R. Existing Expected-mode versions adopt this distinction on read without rewriting their stored settings. Actual FTT, PD and duties, the existing outer combined retained fraction, zero floor and unavailable values remain.
3. Q176: The authenticated relief API returns R before Blocks under schema version 2. The future receiving webapp owns operational Block periods and deducts them once. Deploy no longer offers Block entry in Relief Settings. Stored legacy Block allowances remain preserved with Admin compatibility detail. No receiving app has been connected or deployed.
4. Q177: Only current Admin authority can read or change relief rules. KP retains calculated R access. Rules and breakdowns are filtered from non-Admin snapshots, deltas, API output, audit access, receipts and conflict notices. Mixed saves and retries enforce Admin authority. The relief calculation engine and private defaults are removed from the public app bundle; the backend supplies calculated results.
5. Q178: Admin can set a direct weekly period budget for each version. Schema-1 daily periods times days becomes the equivalent schema-2 weekly budget when saved or copied. Reads do not mutate storage. Days still multiply the daily lunch allowance. Defaults remain 60 weekly periods, 2 lunch periods per day over 5 days, and SIUE 150%. Lunch may be set to zero and SIUE reduced by Admin; no such policy change is applied automatically.

R is an estimate of weekly relief capacity, not proof that a teacher is available at a timetable slot. The existing retained-fraction placement is unchanged. Whether the chosen weekly budget represents pupil timetable time or a broader staff allowance remains a policy question. This release does not introduce an alternative fairness formula or redistribute teaching targets.

Ledger and Stats use saved server results. Pending workload or rule edits show unavailable R until Save and refresh return confirmed calculations. A relevant delta requests a coherent snapshot; unrelated notes and reporting edits keep the narrow delta path. Stats keeps its existing category mean and incomplete-category behavior.

Install both complete backends and all three matching frontends. The schema-2 relief contract is documented in API_CONTRACTS_v0.5.07.md. VALIDATION.md records release checks. No live Apps Script or Cloudflare installation is included in this commit.

If a confirmed save or changed-input poll requires a reload and that reload fails, R stays unavailable with a Refresh to update message. The confirmed write remains saved and is not resubmitted.
