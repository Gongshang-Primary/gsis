# R5 advisory review of cutover hotfixes

Model: Codex. 2 November 2026. Owner decides merge and release. Shared GitHub identity means these comments are advisory, not independent GitHub approvals. Neither implementer's branch was edited.

| PR | Exact reviewed head | Verdict |
| --- | --- | --- |
| #49 | b7644e9ea586c3b574d8fe0d5f74a70006a94fc2 | No blocking finding |
| #50 | 0891ee91b223f7c6aef195d02e42eed9eb171953 | Changes needed: raw error text leaks into logs |

## #49

Read the full diff, snapshot/part-fingerprint code, Admin dispatch, freeze guard, locking and activation proof consumers. Sorting property keys makes an unchanged set of leases deterministic. Tolerance is restricted to a nonempty changed-part set containing only edgeStaplerLeases. The stored snapshot digest must match, missing fingerprints refuse, and any changed or added non-lease part refuses before the fence. Activation still holds the script and notification locks and returns the imported digest expected by both D1 heads. The read-only drift exemption still reaches the current Admin check.

All six changed source/generated/test blobs were reproduced and hash-matched to the exact PR head. Focused tests pass: roster-stapler-lease-digest-order.cjs, roster-cutover-diagnostics-backend.cjs, roster-cutover-freeze-backend.cjs and roster-cutover-freeze-activation.mjs. Additional scratch probes pass for non-Admin refusal, lease removal, an added non-lease domain and malformed retained leases. Full exact-head CI is green: https://github.com/helper-gsps/gsis/actions/runs/41330641228.

## #50

P1, confidence 10/10: roster-update/public/_worker.js lines 341 and 356 serialize value.result.error into console.error. A 400-character limit retains private text; it does not remove staff facts, plan contents or upstream secrets. This affects both the operations and profile/read failure paths. It duplicates the existing safe diagnostic record and changes the log contract.

The exact-head CI reproduces it. roster717-failure-diagnostics.mjs:26 observes private plan/staff text in the log. roster702-transport-reliability.mjs observes private upstream text. roster605-gateway.mjs:11 also fails because extra raw log records replace the expected three safe records with five. CI is red: https://github.com/helper-gsps/gsis/actions/runs/41350321199.

Requested fix: remove both raw-text log statements, retain rosterFailure/rosterBackendFailure's allowlisted version, stage, code and diagnostic reference, rebuild both Worker bundles, and rerun all three regressions plus full CI. Do not weaken the privacy or log-count assertions.

The reference-refresh portion is sound in the integration exercised here: the minute hook awaits dispatchReferencesRefresh before dependent work, skips Google-authoritative recovery, reuses the existing short freshness check and keeps the current signed Contacts/Calendar path. R4's actual-gateway fixture reproduces stale authority without the hook at t+20, then passes profile, Assign Relief, own finite R calculation, statistics, saveAbsence and persisted automatic cover after the actual cron hook. Deploy stays on Google. Removing only the unsafe raw logs in the test integration makes the three privacy/gateway regressions pass while preserving that t+20 result. This is integration evidence, not a green verdict for #50's original head.

## Coverage limits

No live activation, production data, provider delivery or deployment was exercised. The connected gstack package lacks its required checklist resource and native helpers, so no gstack completion or extra reviewer certification is claimed. This review uses the full GitHub diffs, exact blob checks, caller tracing, local regressions and exact-head CI records.
