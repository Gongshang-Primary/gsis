# Roster quiet-mode regression: wait for toolbar readiness

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: claimed. Updated: 16 November 2026 (Asia/Singapore). Branch: `codex/v1-roster-quiet-test-readiness`. Base: main `a14132856f5dacc4132118ed441c9f4c619ec15e`.

## Scope and authorization

This test-only correction supports the owner's authorized v1.01 release and fixes the already documented PR185 F1 test race. ChatGPT authorizes this independent two-file task alongside PR191 (release label) and PR192 (Memberships); all three scopes are disjoint. No additional product implementation or stacking on an unreviewed branch. Open PR182 is v0.9 and disjoint. Main, remote heads and all open PR file lists were refreshed before claiming.

Exact allowlist:

1. `docs/coordination/tasks/v1-roster-quiet-test-readiness.md`
2. `tests/v1-product-roster-native-quiet.mjs`

## Evidence and intended correction

`docs/coordination/review/pr185-muse-review.md` F1 identifies an immediate `count()` assertion after waiting only for the workload banner. The client emits the workload event before returning data to the Roster renderer; the toolbar appears later. The same unchanged test failed at line 24 in PR191 run `43811771561` and a local reproduction, although run `43811117828` passed 114/114 at the identical head. The test and involved Roster/client modules are byte-identical to current main.

Wait for the exact publish/send toolbar controls to become visible before counting them. Retain exact-count assertions, absence of quiet-mode UI/network calls, real allocation/receipt/D1/reload checks and unauthenticated denial. Do not add sleeps, retries, skipped assertions, relaxed counts, product changes or increased timeouts.

## Checks and boundaries

Run the real browser/Workers/D1 test, canonical build/no drift, runner discovery and required exact-head Node/LORD and product CI. Record the failed evidence and final outcomes in the PR. No visible product change, schema/configuration change, hosted access or provider send. No skill package invoked; the repository's systematic-debugging and verification principles apply directly. F5 OPEN; T1B-01/T1B-02 and hosted runtime UAT Not tested. Deployment remains subject to review, final candidate checks, fresh backups and the existing GitHub approval gate.
