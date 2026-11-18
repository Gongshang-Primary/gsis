# Roster Statistics and cumulative R% compatibility

- Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: claimed before implementation.
- Updated: 19 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-statistics-adapter`.
- Base: `1abe47d039befd685a02c03ef8116278a12a2711`.
- Authority: continue the owner-approved frontend UAT queue. Coordinator explicitly assigns the native Statistics report-format prerequisite and F07 cumulative relief ranking as one bounded task, after freezing the separate duty-save fix. No merge, deployment, hosted read/write, provider send, migration or v0.9 edit.

## Scope and overlap

Refreshed main, open PR files and active claims. The duty-save task is frozen at `cacc043bd641a840ffc11c50f5cccba2b8232961`; the same implementer owns both disjoint Roster service hunks. No duty fix is copied into this branch. Main differs from the duty base only by Calendar/Venues task records.

The only open PR at this checkpoint is v0.9 #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90`. Its sole v1 path is the operation probe allowlist, changing the dynamic call-site line 988 to 997; the coordinator verified and authorises the disjoint removal of only the F07 entry here, after real probe evidence. Do not change its line-number entry or other unresolved allowances.

Exact seven-path allowlist:

1. `docs/coordination/tasks/v1-roster-statistics-adapter.md`
2. `v1/services/roster/service.mjs`
3. `v1/services/roster/statistics.mjs` (new)
4. `v1/web/shared/client.js`
5. `tests/v1-product-roster-statistics-browser.mjs` (new)
6. `tests/v1-product/operation-probe-allowlist.json` (F07 entry only)
7. `v1/services/roster/repository.mjs` (bounded read batching only; preserve all mutation fences)

## Evidence and bounded design

The retained native Statistics page still calls `statisticsRPercent`, absent from the v1 read classifier/dispatch. It also expects a schema-1 encoded Statistics snapshot (`absenceRows`, `activityRows`, `coverage`), while the current handler returns the native ledger report shape. Prove both through the actual built browser and local Workers/D1 before product edits; if the static trace is disproved, record and skip it.

Reuse the existing Statistics projection and allocator accounting/ranking contracts through a v1-owned adapter. Roster owns durable relief duties, settled ledger/corrections, opening balances, retained commitments and frozen weekly entitlements. Contacts owns current identities/eligibility; Deploy owns current verified or explicitly estimated workload. Do not treat a current-week ledger read as annual history, infer missing historic quotas, rewrite captured R or invent teaching evidence. Preserve settled annual rules, SRE daily/weekly distinctions, unknown-history warnings and estimated labels on affected screen/export. Read-only reporting cannot publish, allocate or create authority records.

Use bounded owner reads and current projection contracts; avoid annual baseline/Calendar fanout just to recover past settled totals. Preserve school/current-capability checks, response and row bounds, source observations and honest cache/revision identity. A missing or corrupt published source remains an error; a saved estimate never claims verified history. No new formula, database table, build-web text patch or schema migration.

## Approved read-batching amendment

Before product edits, inspection showed that existing `loadState` plus `accountingProjection` performs about 106 per-week scope reads for an annual report. The coordinator explicitly authorises the seventh repository path for bounded batching only, retaining every mutation fence and an equivalently consistent read. Annual reporting reuses the existing owner accounting projection, without annual Calendar/baseline fanout or a competing formula. This amendment is published before any product change. Honest quota coverage and unavailable-history warnings remain required.

## Acceptance and handoff

Synthetic actual built-browser/gateway/Workers/D1 tests must prove report rendering and ranking, historic completed work/corrections/opening cutoff plus commitments/frozen quota, filtering and Excel export, ordinary-user denial, unknown/estimated evidence, bounded input and read-only behavior. Remove the F07 allowance only when the real operation probe passes; retain all other entries.

Run canonical build/no drift, focused and relevant unchanged regressions, runner discovery, exact-head full Node/LORD and isolated-product CI. Record failures and omissions. Claim is published before code; draft PR follows green required Node/LORD CI. Muse independently reviews the exact head. Visible changes: the existing Statistics report and cumulative R% table load; appearance and allocation policy stay unchanged. Any necessary broader ownership/accounting dependency stops only dependent work and is reported before expansion.

Q01 scope is established; Q02–Q07 implementation/evidence/review are pending. Q08 release is not authorised. Ownership, systematic reproduction and verification principles are applied; no optional skill package execution is claimed. F5 remains OPEN. Official T1B-01/T1B-02 and hosted/runtime UAT remain **Not tested**.
