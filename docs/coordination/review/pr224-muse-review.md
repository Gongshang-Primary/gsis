# Review: PR #224 — Restore Roster Statistics and cumulative R% reporting

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `cd75381d02ea3b8ef3714d01f23e31ee73b1958d`.
- Branch: `codex/v1-roster-statistics-adapter`. Base: `1abe47d039befd685a02c03ef8116278a12a2711`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

The retained Roster Statistics screen called `statisticsRPercent`, absent from the v1 read classifier, and expected a schema-1 Statistics snapshot while the handler returned the native ledger report shape. A v1-owned adapter (`v1/services/roster/statistics.mjs`) now restores the native report, ranking, and Excel output through Roster's existing settled accounting contracts.

- `statisticsReport` handles `statistics` and `statisticsRPercent` before the generic operations path. Read-only: no authority, allocation, publication, quota capture, or correction is performed.
- Capability gate: `admin`, `roster.admin`, or `roster.read` (403 otherwise). In the v1 capability derivation, `roster.read` is granted only to SMC members and roster.admin holders — the same population the classic Statistics gate ("SMC and Admin only") admits — so setting `c.user.smc = true` for the classic projection is a translation of the already-enforced v1 capability, not a widening.
- Annual R% uses only today's projection for current eligibility/workload (no year of baseline reads). Teaching evidence requires a matching immutable publication (publicationId plus sourceId match); otherwise R is null and teaching is unverified. Estimated workload adds an explicit warning; captured historical quotas and completed work are unchanged.
- Ordinary statistics are bounded to 366 days and a 12 MB report; `knownKey` returns an unchanged shortcut. Owner scopes are snapshotted before and after the load; a mid-load change returns 409 REPORT_CHANGED instead of a stale report.
- `repository.mjs` adds `weeklyScopeRevisions`: one bounded owner query (max 54 weeks, LIMIT 55) for report ranges; sparse callers spanning more than a year keep the original per-week reads. `accountingProjection` accepts the captured revisions instead of re-reading them. Mutation fences untouched.
- One build-web change only: the coordinator-approved single same-line description replacement in `roster-statistics-ui.js` ("R% compares recorded completed and committed relief with captured entitlement"). `client.js` adds `statisticsRPercent` to the read list.
- Closes F07 and its native Statistics report-format prerequisite; only the F07 entry is removed from the operation-probe allowlist. `statisticsCalendar` preset shape remains deferred. No new formula, table, or migration. Rollback is a code revert without data rewrite.

## Scope, merge, secrets

- Diff vs origin/main: exactly 8 files, matching the task record's exact eight-path allowlist. 383 insertions, 31 deletions.
- The allowlist diff removes only the F07 entry. The task record notes the #182 overlap (its sole v1 path is the allowlist line-number entry); this PR does not change that entry.
- `git merge-tree --write-tree --name-only origin/main cd75381d02ea3b8ef3714d01f23e31ee73b1958d` clean (tree 245b6f588d799e3b4878c6455616a81185383cbc).
- Secrets scan of the diff: clean.

## CI at the exact head

- Node/LORD run 44413064188: success at head cd75381 (all four shards + full-suite).
- PR-triggered product run 44416003460: success at head cd75381 (all 134 product programs).
- Dispatched product run 44413073732: failure at the same head, 133/134 — the only failing program was the unchanged `v1-product-stapler-resize.mjs`, exceeding the 45s bound (45.168 s) waiting for the class-row Subject apply button. The PR body is explicit that the cause is not established and it is not called a pass; it also evidences change independence (the Stapler fixture loads assets byte-identical to this branch's base, per-file SHA-256 against frozen duty head cacc043; the only builder change, `roster-statistics-ui.js`, is not loaded by that fixture). The automatic PR product run passing at the same head covers the suite.

## Local checks at the exact head (Singapore time, Playwright chromium-1234)

- `npm ci` root and `v1/`: exit 0.
- New test PASS: `v1-product-roster-statistics-browser` (5/5 groups).
- Regressions PASS: `v1-product-roster-storage`, `v1-product-roster-accounting`, `v1-product-roster-service`, `v1-product-operation-probe` (405 probes with the F07 removal).
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q05 supported by the scoped inventory, the read-only adapter, unchanged mutation/capability paths, and bounded reads. Q06 supported by exact-head CI above plus the local runs. Q07 is this review. Q08 is outside this task.
- Hosted/runtime UAT and official T1B-01/T1B-02: **Not tested**. F5 remains OPEN.
