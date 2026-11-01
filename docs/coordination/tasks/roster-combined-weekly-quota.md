# Combined FAJT levelling and Sunday quota checkpoint

- Status: implementation and generated rebuild complete; publishing to the existing draft PR for exact-head full Node/LORD CI.
- Owner/model: Codex.
- Reviewer/model: Claude, exact final head after full suite.
- Branch: codex/roster-weekly-quota-snapshot (PR #29); PR #27 will be superseded after its source is preserved in #29.
- Base: PR #30 at `f7e002236cb1a0b1cec91cbd7741eebebde9c1a0`, including main `8df5a92626beac50e5e92c90dbf98b8c50079c4e` and v0.9.9e labels. Preserve the existing #29/#27 remote ancestry when publishing this branch.
- Scope: owner option B supersedes the earlier Google-only proposal. Published Deploy R is copied into immutable Cloudflare snapshots; Sunday 16:00 captures the coming week's R in the existing entitlement ledger and cumulative denominator. Google and D1 Roster use the same snapshot format. FAJT priority remains Off by default with a 20 percentage-point lead.
- Owned files: Deploy publication and signed read-only source, shared snapshot store/job, existing Roster allocation/operations and scheduler/context/settings, System Health, focused tests and canonical generated copies.
- No production activation, deploy, live data or messages. No separate quota ledger. Preserve active employment, UT caps, absences and manual/peer work.

## Plan
1. Bring #27 canonical changes and tests onto current main; preserve all unrelated current changes.
2. Add failing Sunday boundary, stable-week R, cumulative horizon and FAJT integration tests.
3. Implement a checkpoint through the existing authenticated scheduler and ledger, including verified-school-week handling, idempotency and safe source-cutoff behaviour.
4. Regenerate canonical copies, run focused checks and the full suite, and resolve failures.
5. Update PR #29 with exact head and evidence for Claude; close #27 as superseded only after integration exists.

## Review focus
Missing/midweek publication must not silently rewrite current or past R. Monday holiday must not suppress a school week. Retries must not double-credit. Sunday denominator must feed the FAJT comparison. Dynamic safety restrictions stay live.

## Verification
New domain, SQLite, publication, authentication, retry, health and D1 integration regressions run locally. All 18 components rebuild. Final counts, full-suite omissions and exact local heads are recorded in the local handoff before publication. Browser checks require the existing repository CI runtime; they are never inferred from Node/JSDOM checks.

GitHub upload was rejected by automatic approval review, which said the owner had not explicitly authorised the payload and destination. A transparent-text retry after comparing the files against this repository was also rejected. No alternative write path or ref update was used. Local implementation and verification continue; the owner must authorise publishing these exact changes to helper-gsps/gsis before remote CI can test the new heads.

## Final implementation and rulings

1. Deploy publication records its immutable quota intent inside the existing Google field journal or D1 commit. A background job transfers the snapshot; a network failure cannot fail the saved publication. Google history uses its own append-only sheet, keeping the index cell bounded.
2. The source service uses the existing HMAC, nonce, freshness and backend-role checks. Its identity exception permits only the signed read-only quota operation. Draft state is never a source.
3. Snapshot identity includes the publication version, revision, commit, calculation model, publication time, effective dates, stable staff IDs and R. Stored digests, immutable conflicts and producer order protect retries and same-millisecond publications.
4. The checkpoint consumes verified snapshot evidence, not a live R calculation. Captured weeks never change. A previously verified R is frozen as fallback for that week; successful transfer recovery cannot replace that recorded fallback. A teacher with no verified prior R remains unknown, never zero. This prioritises the owner's immutable-history requirement; a recovered new quota takes effect at the following checkpoint.
5. Missing source evidence raises one retained weekly alert. Retries run hourly, including one final Monday 05:30 attempt. Successful verification resolves the alert without deleting it. Trusted Calendar dates select the first actual school day, including a Tuesday start after a Monday holiday.
6. Current Contacts activity, employment limits, teaching evidence, absences and protected assignments remain live safety checks. FAJT levelling uses recorded annual balances. Inactive-teacher rules from #30 remain in force.
7. Persisted Deploy authority determines source reads: an active D1 head works without a UI-routing flag; paused heads never fall back to Google; imported heads stay inert. No authority flag is enabled by this work.

## Configuration, operational cost and rollback

Use the existing shared `GSIS_JOBS` binding. Roster/notification Workers need the existing Deploy Apps Script endpoint under `DEPLOY_APPS_SCRIPT_URL` when their `APPS_SCRIPT_URL` points to Roster. The signed producer uses explicit `GSIS_SECRET`, otherwise `DEPLOY_BRIDGE_SECRET`, otherwise `BRIDGE_SECRET`; an invalid explicit shared secret never falls back. No credentials are stored in source.

The minute job checks bounded publication metadata and transfers a body only when needed. Weekly proof caches avoid repeated Google calls between hourly retries. System Health shows snapshot revision, written time and lag without staff data. There is no administrator effective-date field or new deployment destination.

Deploy the matched source/backend/Worker changes before relying on this checkpoint. Rollback must retain the immutable publication history, D1 snapshots and captured entitlement records. Reverting code does not authorise recalculating historical quota or clearing authority fences. No deployment, activation, live record change or notification occurred in this task.

## Owner-authorised publication

The owner explicitly authorised the previously blocked upload to helper-gsps/gsis. Both branches now retain main `8df5a9` and its v0.9.9e labels. The PR records each exact remote head and CI run; full Node/LORD success remains required before readiness.

## Completed-work sweep, 31 October 2026

The owner requested a sweep of all earlier GSiS work and publication of completed changes. PR #30 is pushed at `f7e0022`; this branch is stacked on it. The 18-component rebuild passed without generated drift.

A fresh run passed 30 of 32 changed non-browser programs. Both failures were idle fixtures that activated an empty Deploy D1 head but expected Google quota reads. Active persisted D1 authority correctly prevents that fallback. The fixtures now retain an inert imported Deploy head and explicitly select legacy routing. Both idle programs and the existing active/paused/imported authority regressions pass. Production authority code and idle performance assertions remain unchanged. Full CI must still verify the final remote tree before readiness.

See `docs/coordination/review/2026-10-31-completed-work-push-audit.md` for the workspace sweep. No old generated bundles or partial checkouts are restored over current main.

## 1 November owner hold

Rebase is sequenced after #30 on the current cutover baseline. Full exact-head Node and LORD must pass before readiness. Product merge is held until Monday 2 November, 08:00 SGT; the owner merges after Claude review. The CI-only change is a separate task and exception. See roster-weekly-quota-snapshot.md for rebase verification and corrections. No live authority, records, provider sends or deployment are changed.

Rebase verification checkpoint: all 18 components rebuilt, and all 53 combined focused programs pass, including the nine earlier failures, every weekly/quota/FAJT program, all seven F controls, the latest inactive email/clock/freshness regressions, Contacts and the real large D1/Google backup round-trip. Invalid quota payloads now prove that no schema is created, in addition to no accepted rows. Full exact-head Node/LORD CI and Claude review remain the readiness gates.


### Rebase advisory fixes, 1 November (Model: Codex)

Whole-branch Codex advisory found three reproducible checkpoint issues. An ordinary manual/inactive optimisation cannot freeze a first checkpoint without trusted source-attempt evidence. Scheduler proof now names the selected school date and must match the final Calendar (including every preceding weekday); a mismatch leaves immediate retry pending without freezing fallback. A current Deploy outage retains independent checkpoint fallback/unknown state and one weekly alert in both adapters, while blocking allocation and notification preparation and retaining the ordinary retry receipt. Actual SQLite and Google-context regressions cover these boundaries. This advisory is not Claude approval; Claude must review the final published head. Product merge remains held until Monday 2 November 2026 08:00 SGT.

Full CI at05e187d passed942/944Node programs and exposed the shared missing-proof scheduler-replay bug in the existing signed-service and custom SMC-summary tests. A signed missing-proof attempt now persists only bounded pending metadata (no R capture), so its accepted ordinary receipt replays and the checkpoint retries hourly through the final cutoff. Ordinary callers cannot record a checkpoint. Existing assertions remain intact; dedicated missing-proof/cutoff/domain regression added. The final rerun uses CI-only PR39's separately green parallel workflow.
