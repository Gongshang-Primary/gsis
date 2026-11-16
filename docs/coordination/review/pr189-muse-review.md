# Review: PR #189 — Preserve separate classes in v1 venue projections

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `143eec686e337ad3b1c7d5d2d606a46c9153faed`.
- Base / accepted claim: `963ea2dcbd0388286ad4240b58bb6142e761c02f`.
- CI run: [43804512778](https://github.com/helper-gsps/gsis/actions/runs/43804512778), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43805518875](https://github.com/helper-gsps/gsis/actions/runs/43805518875) also green at the exact head (108 product programs, canonical build, nine Worker dry-runs, local migration verification, artifact packaging).
- PR: https://github.com/helper-gsps/gsis/pull/189 (Codex, branch `codex/v1-roster-venue-demands`).
- Task record: `docs/coordination/tasks/v1-roster-venue-demands.md` (in the PR; reviewer line already names Muse).

## What it does

Fixes a real data loss: a built Roster import returned success while collapsing two different classes in one physical venue/period into one Venues demand. Roster now derives a deterministic `lesson:` SHA-256 source ID from physical venue, interval, class/TG, group and subject. Identical identified lesson cells repeated across co-teachers count once; raw source labels and Staff IDs stay in the digest-bound Roster R2 chunk. Rows with no class/TG or group keep separate teacher-row identities and are marked `unresolved` instead of merging. Multi-room mappings keep a demand in each physical room. The non-staged Venues projector also preserves distinct source IDs; the physical fence/scope contract is unchanged (fence comparison still uses physical intervals only). No new control, booking policy change, displacement, migration or v0.9 edit.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-roster-venue-demands.mjs`: exit 0. "PASS built Roster browser / nine Workers / D1-R2: split aliases preserve class demand, co-teacher identity, unresolved evidence, multi-room mapping, receipt/restart recovery and unchanged authorization guards".
- Named regressions, all exit 0: `v1-product-roster-baseline-mapping`, `v1-product-roster-venues`, `v1-product-venues`, `v1-product-venues-source-fence-budget`, `v1-product-venues-staged`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the five claimed paths. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the code diff in full: Roster `occupancyRows` keys on the canonical lesson tuple (plus teacher-row identity when unidentified), collects source labels and Staff IDs, and assigns the digest-bound source ID; Venues `scopeRows` gains a `preserveDemands` option used only by the non-staged adoption path, with `physicalScopes` keeping the fence comparison on physical intervals; both callers updated. `canonical` and `digest` are existing imports in the Roster service. No guard is weakened: revision, authorization, foreign-room and stale-revision checks are covered by the new test.
- Read the handoff doc: it states the limits plainly — the imported cell format has no independent aSc activity UUID, so identical class/group/subject tuples cannot prove separate split activities, and this package does not claim a row count is sufficient to admit a one-slot booking.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner work order 16 Nov item 3(e), first claim only; five-path allowlist held; no displacement authorised or introduced.
- Q02 Design and ownership: pass. Roster owns the immutable evidence; Venues keeps its narrower SQL projection; fence ownership unchanged.
- Q03 Security and privacy: pass. No auth change; source labels and Staff IDs stay in the digest-bound chunk, not copied into new Venues columns.
- Q04 Concurrency and recovery: pass. Physical fence intent digest and scope contract preserved (the budget regression that caught an intermediate change passes unchanged); exact retry and restart recovery covered by the new test.
- Q05 Resources and maintainability: pass. No dependency, migration or new inference; deterministic IDs are stable across reordered input.
- Q06 Verification: pass. New test plus all five named regressions pass locally; exact-head Node/LORD CI and product CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, provider operation or live data; F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested. Historical immutable projections are not rewritten.

## Release notes

Existing source data retains both class demands instead of losing one. No UI change. Still separate work: capacity units and one-slot/whole-venue choices, the full retained-booking conflict workflow, the uncovered-date notice, and Layout's timed baseline view.
