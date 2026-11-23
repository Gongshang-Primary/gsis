# D1 Worker memory hotfix

- Model: Codex
- Status: implemented; final-head full-suite and CI verification pending
- Updated (Asia/Singapore): 2026-11-17
- Branch: codex/roster-absence-clash-confirm; existing owner hotfix PR #182
- Base: 7bf22b5fe7811ae415224b49f5dd477160bee44f
- Owner request: "create fix asap" after recurring notification Worker `exceededMemory` evidence. Claude review is waived by the owner's standing v0.9 hotfix instruction. The owner merges and deploys; v1 is separate.
- Scope: Roster D1 state materialization/hydration/packing, bounded isolate-local mutation admission, allocation-cycle handling of a refused-before-start admission, truthful System Health diagnostics, associated synthetic tests, generated Worker/Pages bundles and parity catalog references, deployment handoff. No allocation policy changes, Apps Script changes, live data/settings/provider calls, migrations, row deletion or v1 work.
- Coordination: main observed at d5c8899aeb867448ad7399f9925f46ac11371380; PR #182 is the only open PR. Continue its unmerged v0.9 hotfix contents without importing unrelated v1 work. The user's no-push-to-main instruction overrides the workflow's claim-on-main default.

## Evidence

Owner-supplied Cloudflare logs record notification minute-cron memory exhaustion on 16 Nov at 07:56 SGT and a different Worker version on 17 Nov at 06:22 SGT. The logs do not identify the individual failing job. A 17 Nov health snapshot records an occupied allocation-cycle lease and no fresh completed allocation outcome; the frontend incorrectly masks SKIPPED_BUSY and lease counters.

Actual D1 code with SQLite and synthetic 6.07 MiB audit history retains 40.32 MiB Node heap during one mutation's commit and 104.66 MiB for three overlapping mutations (118.80 MiB sampled before collection). These measurements demonstrate amplification, not production heap size. Full-state cloning, packing and simultaneous before/after serialization multiply memory. No live school records are used.

## Repair and acceptance

- Admit a bounded number of waiting Roster mutations per isolate; only one materializes a working state at a time. Keep provider sends outside this permit. Never expire an active permit while its work is unresolved. Refused-before-start work retains its durable intent and does not retain the scheduled allocator's nine-minute lease.
- Remove unnecessary whole-state copies during hydration/packing while protecting the original CAS snapshot, packed audit evidence, object digests and all preserved history.
- Preserve receipt replay, revision conflicts, uncertain-send handling, permission checks, allocation policy and pending-attendance gates.
- Regression tests must fail on the old code for overlapping materialization/copy budgets; cover permit release on rejection, bounded waiting, replay/conflict safety and snapshot isolation. Repeat the identical synthetic memory workload after the fix.
- Canonical build, relevant tests, full local v0.9 Node/LORD suite, then exact-head all-five-job CI. Regenerate references/bundles; the final canonical build must leave no tracked diff.
- Hand off both Worker scripts and the Roster frontend ZIP, exact head, checksums, deployment order, checks and rollback. No deployment is performed by Codex.

## Verification

- Canonical build regenerated all 18 components. Seventeen targeted programs passed, including 7 state-memory/isolation groups, 9 admission groups, 5 health-diagnostic cases and the existing 21 allocation single-flight groups.
- Old code fails the copy-budget regression and the actual D1 admission regression (three snapshot loads instead of one). The health regression fails old code because SKIPPED_BUSY becomes UNKNOWN_ERROR.
- Identical three-request benchmark (`TZ=Asia/Singapore NODE_NO_WARNINGS=1 node --expose-gc tests/performance/roster-d1-mutation-memory.mjs [checkout]`): old 7bf22b5 retained peak 65.45 MiB; fixed 34.15 MiB. Sampled heap 71.98 to 41.21 MiB; concurrent apply callbacks 3 to 1. Both completed three commands with three receipts and retained all 2,000 synthetic audit and 666 inbox rows. Node/SQLite measurements are not Cloudflare measurements or a proof of production capacity.
- Admission is internal to verified-D1 notification scheduled/queue entrypoints: one materialized mutation, at most 16 waiting callbacks, 30-second waiting deadline. No active-operation expiry. Browser/operations foreground cancellation remains concurrent, and D1 CAS retries preserve its committed cancellation.
- Parity refresh retains all 273 operations and every outcome, behavior, Google-only exception, risk and proposed action; only source references move.
- Exact-head full local-suite and all-five-job CI results belong in PR #182 and the package verification record. Historical approvals do not cover this head. Live execution recovery, provider delivery, Google fallback and production memory limits are not tested. Wide read-only exports and timetable model cache are not bounded by the mutation gate; owner checks must verify the actual live outcome.
