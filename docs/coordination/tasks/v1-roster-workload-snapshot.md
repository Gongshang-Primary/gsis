# v1-roster-workload-snapshot: Roster copies must not lock Deploy

- Status: O-2 correction implemented; ten local focused/regression programs and canonical build pass. New exact-head CI and Claude recheck are recorded in PR183. Claude's verdict at `9d6db12edf510a34a19516e901e9fb9531b703e4` is changes requested after the owner's O-2 answer; earlier approval/CI does not cover this correction.
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

### O-2 review correction, 16 November

Refreshed main/all heads: `885df915f1c158b057804fe8092db7151334ef37`. Read `docs/coordination/review/v1-pr183-184-claude-review.md` at that main and the owner responses at `47b2d2c5da3d2cbb551259b44e2aa7536a2f79f9`. O-1 confirms Roster's independent copy and no Deploy pins. O-2 says “no. only published versions”: with a pointer, use its verified immutable publication regardless of saved draft edits; no publication retains #181's estimated path. Missing/corrupt pointed-to publication remains an error.

The same accepted claim and branch own this follow-up. Exact incremental scope is six already-allowed paths: `v1/services/deploy/roster-workload.mjs`, `tests/v1-product-roster-workload-snapshot.mjs`, `tests/v1-product-roster-workload-browser.mjs`, `docs/coordination/OWNER_DIRECTIVES.md`, `docs/v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md`, and this task record. Actual files for open PR182 at `592fac9982b8935b1d14b8bbff500a1af78aa2c7` and PR184 at `720fe385adaabde05fe2908c0fcf2968a3861d90` remain disjoint. Do not change either PR or merge main merely to read the review. Existing instructions are unchanged apart from the unrelated v0.9 hotfix lane entry.

Add the publish → draft save → availability → automatic publication regression and built-browser label check before the product fix. Then run focused actual Worker/D1/browser tests, canonical build without drift, runner discovery and required exact-head product/Node/LORD CI. No merge, deployment, hosted migration, live data or provider send. Final evidence and head will be posted in PR183 for Claude's independent recheck.

Correction evidence before commit: both new regressions fail against the old product code with actual `estimated` versus expected `verified`. After the fix, both pass, including a real committed automatic Roster publication, no browser estimated banner, unchanged publication copy, and corrupt-publication denial. Eight unchanged regressions pass: workload-recovery, estimated, estimated-browser, roster-accounting, roster-service, deploy-storage, admission-batch and migration-packaging. Canonical build passes with byte-identical tracked diff before/after; discovery remains 107 product/1,208 Node programs. Commands, fixture corrections, omissions and evidence paths are in the implementation handoff. The six-path follow-up adds no schema, workflow, build or provider changes. Full new-head CI remains a separate result; no old-head green is transferred.

## Ownership and intended correction

Deploy remains authoritative for saved planning versions and immutable publications. Roster retains a bounded dated projection in its own database and immutable per-run snapshots. A current read refreshes that projection; unchanged content does not advance its revision. A read that loses a local compare-and-swap must not replace a newer observation. Allocation commits guard the Roster copy, current Contacts/Calendar facts and owner revisions, never a remote Deploy lock. A changed copy may invalidate the Roster operation; it cannot block Deploy.

Remove the new planning-save lock. Publication fencing continues for other consumers, but excludes Roster, including stranded pre-upgrade Roster pins. Do not mark unknown operations committed or erase their recovery evidence. Preserve immutable publication verification and explicit errors for missing/corrupt sources. Refresh on the next Roster read/operation, including after restart; no cross-D1 synchronous-commit guarantee. O-2 correction: once a publication exists, use only that verified publication regardless of saved draft edits; Roster's copy changes on publication/republish. Only before the first publication are saved plans estimated. Captured weekly R and completed history are not recalculated. Automatic publication remains blocked for estimated workload.

## Integration evidence

Owner-directed #181 merge: exact head `8b15cb2d3c79717828ab66a8359e30522f82b901`, merge `1754c535738adb1cad8dd328f45dd60ea6580f03`, first parent `281e5f36782cea7706ae19abbc39a65d0286aff1`. Automatic and resulting tree both `41757cc2e03977b740137a6edb0da5bfc0cde1cd`. Green exact-head product 104/104, Node 1205/1205, LORD 40/40 per shard, canonical build without drift and nine Worker dry runs. No published Claude exact-head verdict was found; do not describe this as Claude approval. No deployment occurred.

## Acceptance and verification

Synthetic data only; actual built browser and nine Workers/local D1. Reproduce an indefinitely held Roster pin blocking a Deploy save before the fix. Prove save, publish and republish succeed with stranded Roster pins; unrelated consumers remain protected. Verify fresh saved/verified projections, stable revisions on unchanged reads, lost-response/retry/restart recovery, competing observations and guarded Roster commits, corrupt sources and authority/isolation/revision failures. Preserve historical quotas and estimate labels/automatic-publication denial.

Run canonical build with no tracked drift, focused checks, runner discovery, full required Node/LORD/product regressions and exact-head CI under `TZ=Asia/Singapore`. Record failures, omissions, exact heads, visible changes and rollback. No added dependencies or skill execution is claimed; repository ownership, concurrency, recovery and verification principles apply. Q01 claim/owner scope recorded; Q02-Q06 implementation/evidence pending; Q07 Claude review pending; Q08 deployment not authorised. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested. C-1 Memberships and C-2 immediate pre-deploy Contacts D1 backup remain release gates.

## Handoff

Implementation branch starts from the accepted claim commit. Final evidence will be in `docs/v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md` and the bounded PR. Absence replacement remains a separate follow-up; the provisional v0.9 reference is not treated as reviewed final work.

Accepted claim/base: `511269b778f6d948ecedde8ea63deb4c095a44f4`. [Implementation handoff](../../v1/roster/WORKLOAD_SNAPSHOT_HANDOFF.md) records ownership, visible changes, command list and rollback. All three new behavioural programs and the updated estimated-allocation program pass locally. Unchanged migration packaging, Roster accounting, Roster service, Deploy storage and admission-batch programs pass. Canonical `TZ=Asia/Singapore npm run build` passes without tracked build drift; runner discovery includes all three new files (107 product / 1,208 Node). Scope/whitespace checks pass. Full required suites and CI remain pending until the PR records their actual exact-head result. Q07 awaits Claude; Q08 remains not authorised for deployment.

During verification, main advanced to `7198f193ff6936b8f8b5b84737eb1310a9b429df` solely by adding [Claude's #181 review](../review/v1-pr181-claude-review.md), approving the merged exact head. Its C-1 (ambiguous saved-version date ranges) and C-2 (multi-room baseline rollback) remain release conditions; this PR addresses F-1 using the owner's independent-copy direction. A separate v0.9 draft PR182 appeared at `592fac9982b8935b1d14b8bbff500a1af78aa2c7`; its seventeen actual paths do not overlap this claim. It is not merged by this v1 task. Refresh it for the following absence task.
