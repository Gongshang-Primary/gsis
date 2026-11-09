# Review: PR #107 — Consolidate Roster/Deploy transport secrets

Model: Muse. Reviewer: Muse. Verdict: **APPROVE** at exact head `2247f729d0f5f33d0165cbb63684c46effed64ab`.

## What this PR is

Roster/Deploy transport now reads `GSIS_SECRET` only. Branch `codex/gsis-secret-consolidation-roster-deploy`, from main `8194dd3`. 158 files, +1139/−903 — mostly test fixture bindings (121 test files); product changes are the Roster/Deploy backends, Workers, edge adapters, shared service/fence modules, the bounded `build-release.py` addition, and two new strict helpers. It targets the next release, not p; nothing is deployed by this PR.

## Evidence

- **CI**: run 42553742978 at the exact head `2247f72` — completed, success, all 5 jobs (verified via the check-runs API and the run API).
- **Local worktree** (wt107, detached at the exact head): `TZ=Asia/Singapore npm run build` PASS, 18 production components, `git status` empty — **no diff** at the final head. `git diff --check` clean. Merge-tree vs main `bfbf306` clean (tree `bbb50268…`).
- **New test** `tests/roster-deploy-secret-consolidation.mjs`: PASS locally (canonical-only backend/Worker/private transport, invalid and legacy-only rejection before I/O, service/action/source boundaries, canonical outgoing signing, purpose/origin-bound sessions, optional peer gates, generated parity).
- **Guard** `tests/contacts-secret-consolidation-guard.cjs`: clean pass on **45 sources** locally; `--prove-roster-deploy` negative control reproduced by the reviewer (deliberately reintroduced legacy read rejected, child exit 1, source restored byte-for-byte).
- **Parity test** `tests/roster-d1-parity.mjs`: PASS locally — 272 probes match, totals unchanged (85 successful, 15 internal, 172 errors, 57 missing), zero remote calls.
- **Focused changed tests** (15, all PASS locally): `roster0811-range-gateway` (the program that failed CI at the earlier head `04f66f5`), `roster081-api-roundtrips`, `roster702-calendar-batch`, `roster-absence-year-worker`, `deploy094-edge`, `gateway`, `gsis098g-secret-edge`, `roster702-transport-reliability`, `first-load-deploy`, `lord-source-bridges`, `venues-sources`, `roster-venues-gateway`, `roster-d1-parity-guard`, `paid097-backend`, `paid097-bundles`.
- **Scope**: no other app's product or generated files changed — Contacts/Calendar/Venues/LORD generated outputs are byte-identical to the base; the only lord-suite change is the contract-test fixture binding. `LordBridge.gs`/`VenuesBridge.gs` changes are the Roster/Deploy caller side only, as the prompt allowed. The `build-release.py` helper swap applies only to the listed Roster/Deploy targets. Both new helpers contain zero legacy secret names. The Roster session derivation now uses `gsisApiSecret(env)+'|gsis-browser-session-v1|'+origin` — GSIS_SECRET with the separator intact. No legacy secret reads were added in product code; no secret values appear in the diff.
- **Parity inventory refresh**: the owner explicitly approved "Include the two generated parity files" (recorded in the task file, 9 Nov). The diff is exactly the approved three rows — `operation:manifest` 503→403, plus the `/api/session` source references (line 280 out, line 452 in). No new operation or port; totals unchanged.
- **p bundle frozen**: remote `deploy/2026-11-08-v0.9.9p` still at `21bef884145592cf39f98280e7df3072b7c08207`.

## The benchmark failure — verified pre-existing, not a regression

`npm run test:roster-import-runtime` (`tests/performance/roster-chunked-import.mjs`) **fails on this head** with 409 `ROSTER_IMPORT_CLEANUP_PENDING` at the restart-cleanup assertion (reviewer-observed, exit 1). The reviewer reproduced the **identical failure on untouched base `8194dd3`** in a separate worktree (same assertion, same code, exit 1). It is a pre-existing failure in the chunked-import benchmark, outside the required default `npm test` suite and outside this PR's scope; the PR does not claim it, and no cleanup code or assertion was changed. Nonblocking for this review, but it is a real open issue: the restart-cleanup path in the import benchmark fails on main too, and it should be tracked separately rather than forgotten.

## Findings

No blocking findings. Notes:

- The earlier CI failure at `04f66f5` (only `roster0811-range-gateway` in shard 1) is fixed at this head by renaming the fixture binding to GSIS_SECRET with the value and all assertions preserved; the program passes locally and CI is green at the final head.
- Not independently verified by the reviewer: the full local suite (Codex reports 1042/1042 Node + 40/40 LORD at the head; CI green at the exact head is the gate) and the full local LORD suite. The reviewer ran the new test, the guard with its negative control, the parity test, and 15 focused changed tests — all pass.
- `CALENDAR_SESSION_SECRET`, `EXTERNAL_LINK_SECRET` / `EXTERNAL_LINK_PREVIOUS_SECRET` and `WHATSAPP_APP_SECRET` remain independent and unchanged.

## Release notes for the owner

- Merging puts Roster/Deploy on GSIS_SECRET-only transport. The deploy steps are in the task file: align the same GSIS_SECRET privately across each Roster/Deploy Worker/backend pair, the notification/private operations service, and active peer pairs; keep legacy configuration until the new code is live on both ends and verified; update existing Apps Script deployments to a new version; roll back paired Worker/backend versions together if verification fails.
- This goes into the **next** release, not p. The p bundle is untouched.
- Live Contacts 401 is not fixed or verified by this PR.
