# v1-roster-workload-snapshot: Roster copies must not lock Deploy

- Status: claimed; implementation and verification pending.
- Owner/model: Codex. Coordinator: ChatGPT v1. Reviewer: Claude, independent exact head.
- Updated: 16 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-workload-snapshot`.
- Refreshed main/base: `1754c535738adb1cad8dd328f45dd60ea6580f03`.
- Owner authority: “merge all available first”; next PR removes Roster's blocking Deploy save/publication pins, gives Roster its own temporary workload version, and refreshes its in-force reference from Deploy saves/publications/republish. Absence confirmation follows separately. No deployment, hosted migrations/data, provider sends or v0.9 changes.
- Overlap: all remote heads and actual open PRs refreshed; no open PR remains after #181. Same implementer's absence task remains unimplemented and follows this correction. No other implementer's scope is taken.

## Exact file allowlist

1. `v1/services/deploy/service.mjs`
2. `v1/services/deploy/roster-workload.mjs`
3. `v1/services/roster/context.mjs`
4. `v1/services/roster/workload-snapshot.mjs`
5. `v1/services/roster/allocation-snapshot.mjs`
6. `v1/migrations/roster/0005_workload_snapshot.sql`
7. `tests/v1-product-roster-workload-snapshot.mjs`
8. `tests/v1-product-roster-workload-browser.mjs`
9. `tests/v1-product-roster-workload-recovery.mjs`
10. `tests/v1-product-roster-estimated.mjs`
11. `docs/v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md`
12. `docs/coordination/tasks/v1-roster-workload-snapshot.md`
13. `docs/coordination/tasks/v1-roster-unblock.md`
14. `docs/coordination/tasks/v1-merge-records-20261115.md`
15. `docs/coordination/OWNER_DIRECTIVES.md`
16. `docs/coordination/tasks/v1-roster-absence-clash-confirm.md`

Only needed paths change. No wildcard scope; no build/workflow/shared v0.9 edits. A local additive Roster schema file is authorised implementation, not permission to run a hosted migration.

## Ownership and intended correction

Deploy remains authoritative for saved planning versions and immutable publications. Roster retains a bounded dated projection in its own database and immutable per-run snapshots. A current read refreshes that projection; unchanged content does not advance its revision. A read that loses a local compare-and-swap must not replace a newer observation. Allocation commits guard the Roster copy, current Contacts/Calendar facts and owner revisions, never a remote Deploy lock. A changed copy may invalidate the Roster operation; it cannot block Deploy.

Remove the new planning-save lock. Publication fencing continues for other consumers, but excludes Roster, including stranded pre-upgrade Roster pins. Do not mark unknown operations committed or erase their recovery evidence. Preserve immutable publication verification and explicit errors for missing/corrupt sources. Refresh on the next Roster read/operation, including after restart; no cross-D1 synchronous-commit guarantee. Saved edits to the selected in-force version are estimated until published; an unrelated future draft does not replace the selected published version. Captured weekly R and completed history are not recalculated. Automatic publication remains blocked for estimated workload.

## Integration evidence

Owner-directed #181 merge: exact head `8b15cb2d3c79717828ab66a8359e30522f82b901`, merge `1754c535738adb1cad8dd328f45dd60ea6580f03`, first parent `281e5f36782cea7706ae19abbc39a65d0286aff1`. Automatic and resulting tree both `41757cc2e03977b740137a6edb0da5bfc0cde1cd`. Green exact-head product 104/104, Node 1205/1205, LORD 40/40 per shard, canonical build without drift and nine Worker dry runs. No published Claude exact-head verdict was found; do not describe this as Claude approval. No deployment occurred.

## Acceptance and verification

Synthetic data only; actual built browser and nine Workers/local D1. Reproduce an indefinitely held Roster pin blocking a Deploy save before the fix. Prove save, publish and republish succeed with stranded Roster pins; unrelated consumers remain protected. Verify fresh saved/verified projections, stable revisions on unchanged reads, lost-response/retry/restart recovery, competing observations and guarded Roster commits, corrupt sources and authority/isolation/revision failures. Preserve historical quotas and estimate labels/automatic-publication denial.

Run canonical build with no tracked drift, focused checks, runner discovery, full required Node/LORD/product regressions and exact-head CI under `TZ=Asia/Singapore`. Record failures, omissions, exact heads, visible changes and rollback. No added dependencies or skill execution is claimed; repository ownership, concurrency, recovery and verification principles apply. Q01 claim/owner scope recorded; Q02-Q06 implementation/evidence pending; Q07 Claude review pending; Q08 deployment not authorised. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested. C-1 Memberships and C-2 immediate pre-deploy Contacts D1 backup remain release gates.

## Handoff

Implementation branch starts from the accepted claim commit. Final evidence will be in `docs/v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md` and the bounded PR. Absence replacement remains a separate follow-up; the provisional v0.9 reference is not treated as reviewed final work.
