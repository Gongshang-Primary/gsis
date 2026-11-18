# Roster Statistics and cumulative R% compatibility

- Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: implemented locally; exact-head CI and independent review pending.
- Updated: 19 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-statistics-adapter`.
- Base: `1abe47d039befd685a02c03ef8116278a12a2711`.
- Authority: continue the owner-approved frontend UAT queue. Coordinator explicitly assigns the native Statistics report-format prerequisite and F07 cumulative relief ranking as one bounded task, after freezing the separate duty-save fix. No merge, deployment, hosted read/write, provider send, migration or v0.9 edit.

## Scope and overlap

Refreshed main, open PR files and active claims. The duty-save task is frozen at `cacc043bd641a840ffc11c50f5cccba2b8232961`; the same implementer owns both disjoint Roster service hunks. No duty fix is copied into this branch. Main differs from the duty base only by Calendar/Venues task records.

The only open PR at this checkpoint is v0.9 #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90`. Its sole v1 path is the operation probe allowlist, changing the dynamic call-site line 988 to 997; the coordinator verified and authorises the disjoint removal of only the F07 entry here, after real probe evidence. Do not change its line-number entry or other unresolved allowances.

Exact eight-path allowlist:

1. `docs/coordination/tasks/v1-roster-statistics-adapter.md`
2. `v1/services/roster/service.mjs`
3. `v1/services/roster/statistics.mjs` (new)
4. `v1/web/shared/client.js`
5. `tests/v1-product-roster-statistics-browser.mjs` (new)
6. `tests/v1-product/operation-probe-allowlist.json` (F07 entry only)
7. `v1/services/roster/repository.mjs` (bounded read batching only; preserve all mutation fences)
8. `scripts/v1/build-web.mjs` (one same-line Roster Statistics explanatory-text replacement only)

## Evidence and bounded design

The retained native Statistics page still calls `statisticsRPercent`, absent from the v1 read classifier/dispatch. It also expects a schema-1 encoded Statistics snapshot (`absenceRows`, `activityRows`, `coverage`), while the current handler returns the native ledger report shape. Prove both through the actual built browser and local Workers/D1 before product edits; if the static trace is disproved, record and skip it.

Reuse the existing Statistics projection and allocator accounting/ranking contracts through a v1-owned adapter. Roster owns durable relief duties, settled ledger/corrections, opening balances, retained commitments and frozen weekly entitlements. Contacts owns current identities/eligibility; Deploy owns current verified or explicitly estimated workload. Do not treat a current-week ledger read as annual history, infer missing historic quotas, rewrite captured R or invent teaching evidence. Preserve settled annual rules, SRE daily/weekly distinctions, unknown-history warnings and estimated labels on affected screen/export. Read-only reporting cannot publish, allocate or create authority records.

Use bounded owner reads and current projection contracts; avoid annual baseline/Calendar fanout just to recover past settled totals. Preserve school/current-capability checks, response and row bounds, source observations and honest cache/revision identity. A missing or corrupt published source remains an error; a saved estimate never claims verified history. No new formula, database table or schema migration. The later approved explanatory-text exception is recorded below.

## Approved read-batching amendment

Before product edits, inspection showed that existing `loadState` plus `accountingProjection` performs about 106 per-week scope reads for an annual report. The coordinator explicitly authorises the seventh repository path for bounded batching only, retaining every mutation fence and an equivalently consistent read. Annual reporting reuses the existing owner accounting projection, without annual Calendar/baseline fanout or a competing formula. This amendment is published before any product change. Honest quota coverage and unavailable-history warnings remain required.

## Approved explanatory-text amendment

The preserved Statistics description calls R% the allocator's selection value, but v1's layered allocator uses its own weekly-capacity/rotation order. The coordinator explicitly authorises one same-line v1-only builder replacement to describe the unchanged report as recorded completed and committed relief against captured entitlement, keeping its weekly SRE basis and current allocation rules separate. No v0.9 source or allocation policy changes. This exception is smaller than adding a UI module solely for one sentence and is published before the builder edit.

## Acceptance and handoff

Synthetic actual built-browser/gateway/Workers/D1 tests must prove report rendering and ranking, historic completed work/corrections/opening cutoff plus commitments/frozen quota, filtering and Excel export, ordinary-user denial, unknown/estimated evidence, bounded input and read-only behavior. Remove the F07 allowance only when the real operation probe passes; retain all other entries.

Run canonical build/no drift, focused and relevant unchanged regressions, runner discovery, exact-head full Node/LORD and isolated-product CI. Record failures and omissions. Claim is published before code; draft PR follows green required Node/LORD CI. Muse independently reviews the exact head. Visible changes: the existing Statistics report and cumulative R% table load; appearance and allocation policy stay unchanged. Any necessary broader ownership/accounting dependency stops only dependent work and is reported before expansion.

## Implemented evidence

Claim commits `9d03f83`, `7c50cf8` and `3530af2` were published on this branch before their corresponding edits. Latest main observed at final handoff preparation is `184b8d0a52fe215c7d122a247e89e9b0289a44a8`; base stays the recorded `1abe47d` without silently taking concurrent work. The refreshed overlapping open PRs are #182 (only its separate probe call-site line), #215 (the same implementer's frozen duty-save service hunk), and #216 (the coordinator-approved separate builder hunk). The eight-path claim remains exact.

The real built screen reproduced `statistics` HTTP 200 with `schemaVersion: 1` instead of the required encoded `schema: 1`, plus `statisticsRPercent` HTTP 404. The v1-owned adapter now returns the native encoded snapshot and annual cumulative ranking using the existing settled accounting functions. Annual reads include prior weeks, openings, correction sums, retained commitments and frozen quotas. Historical ordinary reports use owner records without adding current Contacts/Calendar dependencies. Annual ranking still validates current eligibility and workload.

Per-person teaching evidence requires a matching immutable publication identity plus that person's verified, finite, nonnegative teaching row. An unrelated row with unavailable weekly quota cannot hide another verified SRE's teaching basis. Aggregate workload quality stays unchanged; missing/estimated evidence never becomes verified or zero. The existing source currently reports daily SRE rows as unavailable for weekly quota, so those cannot be claimed to contain verified teaching solely from a numeric zero. No source contract is changed here.

Read batching retains the same weekly mutation fences, loads annual fences in one bounded query, and keeps the old behavior for sparse callers spanning over 54 weeks. Report reads compare bounded owner scope revisions before and after projection and reject an observed concurrent owner change. No cross-database atomic snapshot is claimed. The source workload copy uses its existing observation/revision guards; the report does not write duties, openings, captured quotas, operation receipts or outbox rows.

## Verification at implementation handoff

All commands use `TZ=Asia/Singapore`; local browser commands explicitly use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`.

- Baseline actual browser/Workers/D1: **expected failure**, missing native wire contract and HTTP 404 ranking recorded before product edits.
- `node tests/v1-product-roster-statistics-browser.mjs`: **5/5 groups pass**, 15.850 seconds on final source. Real built browser, gateway, nine Workers and D1: older completed work/corrections, opening cutoff, commitment and captured entitlement; estimated/unknown-history labels; local partial filter and native downloaded Excel; current capability denial, date bounds, school isolation, reload and no business writes; verified weekly SRE alongside unavailable daily SRE; historical report availability during synthetic Contacts/Calendar table outage while current ranking returns 503.
- `node tests/v1-product-operation-probe.mjs`: **pass**, 405 probes, 25 retained known-missing operations and 127 parsed scripts; the 15 dynamic call-sites are unchanged. Only F07 is removed; all other unresolved allowances remain.
- `node tests/roster087-statistics.cjs`, `node tests/roster-statistics-r-percent.cjs`, `node tests/roster-statistics-r-percent-ui.cjs`: **pass**, unchanged canonical projection/math and UI checks.
- `npm run build`: **pass**, all 18 canonical components; no generated drift. `node --check` for changed modules and `git diff --check`: **pass**.
- `node scripts/v1/test.mjs --list`: new product fixture discovered; this branch contains 134 product programs. Required full Node/LORD and isolated product CI are **pending** until exact-head results appear in the PR.

Retained failed local iterations: an ambiguous Excel button locator matched both native and common-table controls (fixed by targeting the native export attribute); an initial fixture incorrectly assumed a daily SRE's unavailable weekly quota meant verified aggregate workload; the added fixture's blank subject tag initially represented missing evidence rather than an accepted empty list. These failures led to precise fixture/source-evidence assertions, not weaker validators. No test pass is claimed for those iterations. A missing `/usr/bin/time` stopped one shell wrapper before Node; the successful timing uses the shell's timer.

Visible changes: existing Statistics tables, cumulative R% and Excel output load with their retained appearance. One explanation now says recorded completed and committed relief are compared against captured entitlement, rather than claiming the separate layered allocator selects by that report. Missing-history/estimated warnings remain visible and exported.

Deferred: the independent `statisticsCalendar` preset response still lacks the native term/semester shape; this task does not close that backlog. No hosted UAT, large-school maximum-data performance or new process-restart test ran. Current-source outages intentionally keep annual ranking unavailable. Review the eight paths at the exact PR head; rollback is a code revert without migration or data rewrite.

Q01–Q05 **Pass** for the bounded implementation and local evidence, with the stated cross-source consistency limit. Q06 **Pending** required exact-head full suites; Q07 **Pending** Muse exact-head review. Q08 release **Not applicable — not authorised**. Ownership, systematic reproduction and verification principles are applied; no optional skill package execution is claimed. F5 remains OPEN. Official T1B-01/T1B-02 and hosted/runtime UAT remain **Not tested**.
