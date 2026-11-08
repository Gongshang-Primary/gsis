# Review: PR #104 — Calendar: require GSIS_SECRET for transport

- Reviewer/model: Muse
- Reviewed head: `fb0ee228d2c713ee99f530986c9d61e72a772e81` (exact head; re-review if the head moves)
- PR: https://github.com/helper-gsps/gsis/pull/104 — draft, open, base main
- Branch: `codex/gsis-secret-consolidation-calendar-rebase`
- Task: `docs/coordination/tasks/gsis-secret-consolidation.md` (Calendar second in the authorised one-PR-per-app series)
- Date: 8 November 2026

## Verdict: APPROVE

## Evidence

- **CI**: run 42475930759 at the exact head — completed success, all 5 jobs (full-suite + Regression shards 1–4). Verified via the check-runs API and `gh run view`. The earlier run 42467969601 at head 79b5c16 failed shards 1/4, 2/4 and 3/4 (one test each: `tests/roster-absence-year-worker.mjs:39`, `tests/roster081-api-roundtrips.mjs:17`, `tests/roster702-calendar-batch.mjs:33`); the fix commit fb0ee22 updates only the five synthetic caller values in those three Roster-to-Calendar integration fixtures to the canonical repeated secret (no assertions disabled), and the full run at the new head is green.
- **Local** (worktree wt104 at the exact head, `TZ=Asia/Singapore NODE_NO_WARNINGS=1`, `GSIS_BROWSER_EXECUTABLE`/`ROSTER_TEST_CHROMIUM` set): all 16 changed/new test programs PASS (exit 0) — the new `tests/calendar-secret-consolidation.mjs`, the extended guard `tests/contacts-secret-consolidation-guard.cjs`, the three corrected Roster integration tests, and the 12 other changed Calendar tests (`calendar0810`, `calendar089-background-gateway`, `calendar089-sync-concurrency`, `calendar093`, `calendar098j`, `calendar098p`, `calendar099-delta`, `calendar099-venue-diagnostics`, `calendar099a`, `calendar606-gateway`, `calendar606`). `tests/calendar/backend_harness.cjs` is a shared fixture helper, exercised through the tests that import it.
- **Guard negative control reproduced by the reviewer**: `node tests/contacts-secret-consolidation-guard.cjs --prove-calendar` — the deliberately reintroduced legacy read was rejected (child exit 1), the source was restored byte-for-byte, and the clean 12-source guard passed.
- **Canonical build**: `TZ=Asia/Singapore npm run build` at the head — PASS, **no diff**.
- **Merge-tree** vs main 27ab05a: **clean** (tree a5a014d01660fc6a671aafc0c54397c7340bf84d). GitHub reports MERGEABLE/CLEAN.
- **Generated parity** at the head (reviewer-checked): `Calendar_Backend_v0.9.9.gs` is byte-identical to `calendar-backend/Code.gs` (same SHA256), and all three job Worker copies (`worker.mjs`, `dashboard-worker.mjs`, `dashboard-worker.txt`) are identical.
- **Secret scan** of the diff: clean. No secret values, tokens, private links or school records. All credential values in the diff are synthetic fixtures (`'synthetic-secret'.repeat(3)`, `'x'.repeat(32)` and the like). No legacy `CALENDAR_PROXY_SECRET`/`CALENDAR_SERVICE_SECRET` reads remain in any of the 12 guarded deployed sources (reviewer grep).

## Findings

- **Scope matches the task and the owner's rulings.** Calendar-only, plus the bounded `scripts/build-release.py` addition the owner approved on 8 Nov ("include"): for Calendar targets only (`calendar-backend/Code.gs`, `calendar-update/public/_worker.js`) the build swaps in Calendar-specific helpers (`backend/CalendarApiSecret.gs`, `shared/calendar-api-secret.js`) and specialises the embedded Venues bridge only in Calendar; the Contacts branch of the same code is untouched and every other app's product/generated outputs have no diff. No other app's product code changed. Roster/Deploy, Venues and LORD remain untouched, as the series requires.
- **The change does what the task says.** All eight deployed Calendar sources now read GSIS_SECRET only and fail closed (503 `GSIS_SECRET_INVALID`) on a missing/invalid value; the legacy fallback is gone from Calendar. The job Worker no longer falls back to `CALENDAR_PROXY_SECRET`. Outbound Contacts birthday and Venues catalogue/source calls sign with the same canonical credential while keeping service/source/timestamp checks. `CALENDAR_SESSION_SECRET` remains the independent Calendar session signer — the new test proves transport keys (raw or purpose-derived) cannot forge Calendar cookies, and session signing is untouched.
- **The fix commit is exactly the five missed fixture values.** fb0ee22 changes two values in `roster081-api-roundtrips.mjs`, two in `roster702-calendar-batch.mjs` and one in `roster-absence-year-worker.mjs`, all to `'synthetic-secret'.repeat(3)`. The surrounding rejection assertions (`proxySecret:'wrong'` → ok false, outside-domain actor → false) are unchanged, and the reviewer confirmed the three tests pass at the exact head. No Roster product migration is involved.
- **One test-expectation change, correctly scoped**: `calendar099-venue-diagnostics.cjs` now expects `GSIS_SECRET_INVALID` (not `VENUES_SECRET_MISSING`) when the secret is absent, because the fail-closed helper throws before the missing-secret path; the test now deletes `GSIS_SECRET` explicitly for that case. No product assertion was disabled.
- **Live safety.** No live configuration or data changes in this PR (stated in the PR body and task record). This code is **not** the live Contacts 401/config fix — that remains a separate owner-side alignment. Deploying it requires the owner steps in the task record: the same GSIS_SECRET value on Calendar Pages, Apps Script and the job Worker, plus each active Contacts/Venues/Roster calling pair's effective credential; keep `CALENDAR_SESSION_SECRET` unchanged and independent; retain legacy configuration until the new code is live on all Calendar ends and verified; deploy the three Calendar components together. Apps awaiting migration retain their current code and configuration; their effective values must agree with Calendar's.
- **Not independently verified by the reviewer**: Codex's full 59-program focused selection and the full local LORD suite; the full Node suite locally. CI green at the exact head covers the full suite.

## Nonblocking notes

- The task file's "Calendar remaining gates" section still says "Branch history resolution remains pending". It was written before the branch move; the later "Calendar branch move" section records the owner's fresh-branch direction and supersedes it. Left as-is because updating it would move the reviewed head. The PR body is authoritative.
- The task file's `Status:` line still reads "implementing Contacts PR only". It is stale now that the Calendar PR is open; left as-is for the same reason.

## Release notes for the owner

Calendar is the second app in the secret-consolidation series. After this merges, the Calendar pair plus job Worker must be deployed together with the same GSIS_SECRET value on all three ends before any legacy configuration names are removed from Calendar settings. The live Contacts 401 still needs its separate configuration alignment. Next in the queue is the edge-queue design note (docs-only), which must not start until this PR is merged.
