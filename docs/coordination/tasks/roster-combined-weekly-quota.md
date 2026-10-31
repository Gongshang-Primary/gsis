# Combined FAJT levelling and Sunday quota checkpoint

- Status: implementing; owner authorised combining PR #27 and #29 on 31 October 2026.
- Owner/model: Codex.
- Reviewer/model: Claude, exact final head after full suite.
- Branch: codex/roster-weekly-quota-snapshot (PR #29); PR #27 will be superseded after its source is preserved in #29.
- Base: 066a026d90585f020715aaa32fdecde43eaf6795.
- Scope: existing FAJT priority and settings from #27; reuse the existing entitlements ledger; Sunday 16:00 Asia/Singapore checkpoint; frozen weekly allocation R and cumulative denominator; current Google-first route. Shared Cloudflare quota storage stays with D1 migration, as recommended and accepted by the owner's instruction to combine and start.
- Owned files: shared/roster-allocation.js, shared/roster-operations.js, backend/RosterOperations.gs, backend/Relief.gs, Roster scheduler/context/settings, related tests, generated copies and branch verification workflow.
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
Implementation started. No test pass or deployment claimed yet. Direct git clone lacks credentials in this runtime; source access and commits use the connected GitHub API. Local source checks and repository CI will be recorded separately.
