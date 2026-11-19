# Review: PR #224 — Restore Roster Statistics and cumulative R% reporting (re-review at de8864f)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `de8864ffc273fa7c8722d7f4905e813677dfe864`.
- Branch: `codex/v1-roster-statistics-adapter`. Base: main `79cde0fc`. PR status: open, MERGEABLE. GPT to merge.
- This is a re-review. The original head `cd75381` was approved (record 189ed4d8). GPT merged #213–#223 and #225–#227 in the meantime; the branch was rebased onto main 79cde0fc and gained one test-only commit. This record covers the new head only; the original review's findings (none) and design analysis still stand.
- No deployment authorised.

## What changed since cd75381

One commit, `de8864ff` ("Enroll the synthetic SRE in the Statistics version fixture"), plus the mechanical rebase sync `48c76cce`:

- The Statistics browser test fixture now enrolls the daily SRE through the existing Deploy `acceptContacts` operation (fresh lease, then reload) before publishing, and publishes with the reloaded revision instead of hardcoded 0. Cause: merged #226 now requires explicit saved Deploy version membership, so the test saw verified workload instead of the unavailable daily SRE row it was meant to exercise.
- No product file changed beyond the rebase. The task record's new section states the cause, the fix, and the local evidence; it also records an initial `REVISION_CONFLICT` from reusing the membership edit lease, corrected by following normal owner revision checks.

## Scope, merge, secrets

- Diff vs origin/main: exactly the same 8 files as the original approval (task record, build-web.mjs one line, Statistics browser test, operation-probe allowlist, roster repository.mjs, roster service.mjs, new statistics.mjs, client.js). 399 insertions, 31 deletions (was 383; the +16 are the fixture change).
- `git merge-tree --write-tree --name-only origin/main de8864f` clean (tree 908ccb31).
- `git diff --check`: clean. Secrets scan of the diff: clean.
- The F07 allowlist entry is the only one removed; `statisticsCalendar` remains deferred. F5 remains OPEN.

## CI at the exact head

- Node/LORD run 44434907282: **success at head de8864f** (all four shards + full-suite).
- Product run 44434914943: **success at head de8864f**.
- Both run head_shas verified via the API as de8864f.

## Local checks at the exact head

Worktree `wt224r-review` at de8864f, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-statistics-browser.mjs`: exit 0, 5/5 groups pass.
- `tests/v1-product-roster-storage.mjs`: exit 0.
- `tests/v1-product-roster-accounting.mjs`: exit 0.
- `tests/v1-product-roster-service.mjs`: exit 0.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 operations, 24 retained known-missing, 130 parsed scripts (matches the task record's stated figures).
- `npm run build`: exit 0, no diff.
- `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None. The fixture change uses existing owner operations with normal revision checks, asserts the same five groups, and matches the mechanical merge tree.

## Quality gates

- Q01–Q06 pass at the new head (pinned scope unchanged, fixture-only delta, exact-head CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
