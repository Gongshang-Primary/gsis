# FAJT annual relief levelling

Model: Codex
Status: prepared branch, pending full Linux CI and Claude exact-head review. No deployment.

An optional FAJT rule now follows existing daily-SRE priority. Each allocation run compares active FAJT mean annual R usage with other eligible active staff (excluding SRE), plus an editable lead in percentage points. Below the threshold, FAJT candidates come first and lower annual usage wins within that group. At or above the threshold, the existing preference order applies. Subsequent runs recompute the switch.

The rule defaults Off in both new and old settings. The retained margin defaults to 20 and accepts finite values from 0 through 100. System Config shows the two persisted annual averages, threshold state and count of FAJT staff without known entitlement.

Hard eligibility, workload/cap restrictions, maximum feasible coverage and protected/manual/peer allocations keep their existing handling. R and employment quota formulas do not change. All routes remain Google-first.

Local verification: eight new ranking/default/margin/status tests, existing preference oracle, allocator, SRE formula, suspended-day rules and settings browser checks; all 18 components rebuilt. Full Linux suite remains the handoff gate.

Rollback: restore the prior component bundle or switch the rule Off. No record migration, live configuration change or messages performed.
