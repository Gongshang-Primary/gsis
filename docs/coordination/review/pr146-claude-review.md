# PR #146 review (v1 relief capacity and remaining-week forecast), Claude

Model: Claude. Reviewed 14 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `692ea365522cd90c4961b7e6fb43072848253677` |
| Stacked on | PR #145 at `f1efe8a` (reviewed separately); this review covers only `c11c83a` and `692ea36` |
| Own diff | 14 files, +574 / −255 |
| Verdict | **Approve** (advisory). Merge after #145. One mechanical conflict to resolve first (L1). |

## Evidence I produced

Separate worktree at the exact head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium:

1. `node scripts/v1/test.mjs`: **64/64 product programs pass** (62 from #145 plus the two new capacity tests).
2. `npm run build`: success, no tracked drift.
3. Scope matches the task allowlist: allocator, Roster capacity/snapshot/service/context, capacity UI, build-web, tests, two docs, task record. No schema, dependency, Core/Contacts or production change.

Not verified by me: full Node/LORD CI at this head.

## What is sound

1. **One eligibility rule.** `inspectCapacity` lives in the allocator and reuses its own `eligibility`, `resolveLayer` and `quotaRemaining`. Health, the period chart and the forecast now use the same rule as real allocation. This fixes the two overstatements Codex reproduced (R=1 counted across 17 periods; layer `maxRelief=1` ignored).
2. **Read-only in practice, not just in name.** The allocation snapshot was extracted from the service into `allocation-snapshot.mjs`. It returns the weekly-quota INSERTs as data (`weeklyWrites`); the forecast and health paths take only `snapshot`, `policyValue` and `day`, so no quota is captured and no ledger is written. Real allocation keeps using the writes.
3. **Honest output.** Each day is `projected`, `not-school-day` or `not-verified`; one unverified day makes every later day unverified rather than optimistic. `optimalityProven: false`; "uncovered" is described as "no cover found in this bounded projection", not a minimum external headcount. Bounded to seven dates in one week and 10,000 comparisons per day.
4. **Simulated duties carry forward** within a scratch copy only, so later days in the week see earlier projected use of R. Saved and future duties stay fixed.
5. **Access.** The forecast requires `admin`, `roster.write` or `roster.allocate`. In Core, `roster.write` and `roster.allocate` come only from SMC or Roster Admin, so ordinary teachers cannot see other staff's remaining R.
6. Notification changes are deliberately split into the next claim; nothing here sends or schedules messages.

## Findings

### L1 (low, before merge): task-record conflict with main

The claim for this task was committed to main as `96af8cc` and separately on the branch as `c11c83a`. Merge-tree reports an add/add conflict in `docs/coordination/tasks/v1-relief-capacity-forecast.md`. The PR's version only adds evidence. After #145 merges, Codex merges main into the branch and keeps the PR's text. No code impact.

### N1 (note for the follow-up): baseline "potential" is per-period, not people

`potential` and `remaining` in health sum green choices across periods, so one teacher free for six periods counts six. The UI note says choices are not additive R, which is right; keep that wording visible wherever the percentage is shown, so SMC does not read 60% as "60% of relief staff left".

## Status that does not change

Not deployed. Warning/fingerprint work is the next claim. F5 OPEN. Official T1B-01/T1B-02 and runtime UAT: Not tested.
