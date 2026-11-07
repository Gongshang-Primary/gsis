# Review: PR #102 — Contacts: require GSIS_SECRET for transport and sessions

- Reviewer/model: Muse
- Reviewed head: `b9d9f8c003a63475ad6882b7e22f156b04748989` (exact head; re-review if the head moves)
- PR: https://github.com/helper-gsps/gsis/pull/102 — draft, open, base main
- Branch: `codex/gsis-secret-consolidation`
- Task: `docs/coordination/tasks/gsis-secret-consolidation.md` (Contacts first in the authorised one-PR-per-app series)
- Date: 7 November 2026

## Verdict: APPROVE

## Evidence

- **CI**: run 42354853026 at the exact head — completed success, all 5 jobs (full-suite + Regression shards 1–4). Verified via the check-runs API and `gh run view`. The earlier run 42354141699 at head 7f13689 failed all 5 jobs at `tests/run_gsis_contract_checks.cjs` ("The GSiS contacts service did not supply an authoritative reference"); the fix commit b9d9f8c aligns the synthetic Contacts providers' configuration with GSIS_SECRET (no assertions disabled) and the full run at the new head is green.
- **Local** (worktree at the exact head, `TZ=Asia/Singapore NODE_NO_WARNINGS=1`, `ROSTER_TEST_CHROMIUM` set): all 19 changed/new test programs PASS (exit 0) — the two new programs (`tests/contacts-secret-consolidation-guard.cjs`, `tests/contacts-secret-consolidation.mjs`), the 16 changed Contacts/gateway/session tests, and `lord-suite/tests/run_gsis_contract_checks.cjs`. `tests/contacts502-fixture.js` is a shared fixture helper, exercised through the tests that import it.
- **Guard negative control reproduced by the reviewer**: `node tests/contacts-secret-consolidation-guard.cjs --prove` — the deliberately reintroduced legacy read was rejected (child exit 1), the source was restored byte-for-byte, the tree stayed clean, and the guard passed ("4 deployed sources").
- **Canonical build**: `TZ=Asia/Singapore npm run build` at the head — PASS (18 production components, productionDeployed false), **no diff**.
- **Merge-tree** vs main f7fc2de: **conflict in CHANGELOG.md only** (tree 135b6f88c6c090e6c72c9f06f3c6bdb591df9b1b). The branch's new entry ("Contacts transport requires GSIS_SECRET") collides with main's new entry ("D1 parity inventory"). GitHub shows CONFLICTING. Per the handover merge procedure this is a merge-time resolution (keep both entries); it is not a code conflict. The owner merge must use the local-merge procedure, not the GitHub button.
- **Secret scan** of the diff: clean. No secret values, tokens, private links or school records. The only long URL is a synthetic test fixture (`https://script.google.com/macros/s/synthetic/exec`).

## Findings

- **Scope matches the task and the owner's rulings.** Contacts-only, plus the bounded `scripts/build-release.py` addition the owner approved on 7 Nov ("include"): for Contacts targets only (`Contacts_Code.gs`, `contacts-update/public/_worker.js`) the build swaps in Contacts-specific helpers (`backend/ContactsApiSecret.gs`, `shared/contacts-api-secret.js`); every other target keeps its existing helper. No other app's generated files changed; no other app's product code changed. Calendar, Roster/Deploy, Venues and LORD remain untouched, as the series requires.
- **The change does what the task says.** All four deployed Contacts sources now read GSIS_SECRET only and fail closed (503 `GSIS_SECRET_INVALID`) on a missing/invalid value; the legacy fallback is gone from Contacts. The setup validator no longer generates or rotates a legacy BRIDGE_SECRET. Sessions derive from GSIS_SECRET with the existing `|gsis-browser-session-v1|` purpose/origin separator. The LORD/Venues bridge blocks embedded in Contacts use the same canonical credential while keeping service/source/timestamp checks. The Deploy outbound signs with GSIS_SECRET (Deploy still accepts it via its GSIS_SECRET-first fallback).
- **One tightening, correctly scoped**: a directory-service envelope that names a school-user action is now rejected (403). Service requests cannot reuse that envelope shape to write Contacts data.
- **Live safety.** No live configuration or data changes in this PR (stated in the PR body and task record). This code is **not** the live Contacts 401/config fix — that remains a separate owner-side alignment. Deploying it requires the owner steps in the task record: the same GSIS_SECRET value on both Contacts ends, aligned active peers, deploy the Contacts pair together, keep legacy configuration until both ends are live and verified. Contacts users may need to sign in again if the previous session-key value differs (recorded in the PR body and task record).
- **Not independently verified by the reviewer**: Codex's full 60-program focused selection and the full local LORD suite (Codex reports 40/40); the full Node suite locally. CI green at the exact head covers the full suite.

## Nonblocking notes

- The task file's `Status:` line still reads "implementing Contacts PR only". It is stale now that the PR is open; left as-is because updating it would move the reviewed head. The PR body is authoritative.
- The CHANGELOG conflict (above) must be resolved at merge time by keeping both entries.

## Release notes for the owner

Contacts is the first app in the secret-consolidation series. After this merges, the live Contacts 401 still needs its separate configuration alignment, and the Contacts pair (Worker + Apps Script backend) must be deployed together with the same GSIS_SECRET value on both ends before any legacy configuration names are removed. Calendar is next in the series and must not start until this PR is merged.
