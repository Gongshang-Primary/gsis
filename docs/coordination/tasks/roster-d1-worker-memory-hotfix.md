# D1 Worker memory hotfix

- Model: Codex
- Status: implementing
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

Implementation and final verification pending. Historical baseline results do not approve this new head. Live execution recovery, provider delivery and production memory limits are not tested locally.
