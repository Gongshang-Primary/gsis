# roster-weekly-quota-snapshot: Sunday quota checkpoint

- Status: proposed; documentation-only draft PR. Implementation explicitly deferred by owner until model switch.
- Owner/model: Codex, future implementation; no active product-code claim.
- Reviewer/model: Claude, exact implementation head after the full suite passes.
- Last updated (Asia/Singapore): 31 October 2026.
- Branch: codex/roster-weekly-quota-snapshot
- Base SHA: branch created from current main on 31 October 2026; rebase/reconcile before implementation.
- Current head SHA: see PR head.
- PR: this branch's draft PR.
- User-authorised scope: open this PR and record requirements only; do not implement yet.
- Files/domains owned now: this task document only.
- Future implementation domains: Deploy publication, shared Cloudflare quota snapshot, Roster weekly quota ledger and allocation checkpoint; exact canonical/generated files must be claimed after overlap review.
- Out of scope: other queue items, production authority cutover, deployment, live records, messages, automatic merge, administrator-selected effective dates.

## Owner decisions

Deploy owns calculated weekly R. On publication it writes a versioned quota snapshot to Cloudflare storage, for Roster to read. Include stable teacher IDs and publication/calculation provenance. Roster owns relief duties completed and cumulative relief quota.

Every Sunday at 16:00 Asia/Singapore, before the first Monday allocation check, Roster reads the latest published R snapshot for the coming school week. It records that week's per-teacher quota and credits cumulative quota at the same checkpoint. Later Deploy publications apply at the following Sunday checkpoint. No administrator effective-date chooser.

Weekly credit must be idempotent across retries, concurrent cron runs and restarts. Retain historical weekly records; never recalculate past entitlement using today's R. Updating quota must preserve manual assignments, SMC work, peer arrangements and completed-duty history.

## Implementation questions to resolve from source

Inspect the actual Google-first production route and existing annual accounting before choosing storage/adapter changes. Earlier chat inspected the parallel D1 route; that is not evidence that production Roster already uses D1 authority. This task does not authorise switching authority.

Proposed defaults from discussion, to validate against existing Calendar/accounting rules: exclude school holiday weeks; if the latest snapshot cannot be read, retain the last verified R and expose failure/provenance. Define retry/catch-up and initial no-snapshot behaviour without silently crediting zero or applying a post-checkpoint publication to an earlier week. Keep partial-school-week policy consistent with current approved rules; do not invent proration.

## Acceptance checks for later implementation

1. Deploy publication stores calculated R and its provenance; unpublished settings do not change Roster quota.
2. Sunday 16:00 Singapore boundary selects the coming week's snapshot before allocation.
3. Weekly credit occurs once under duplicate/concurrent runs and recovery.
4. Midweek publication does not change a locked week's quota or past cumulative quota.
5. Calendar exclusions, missing snapshot and read failure have explicit tested outcomes.
6. Roster retains completed relief, protected assignments and existing allocation safety constraints.
7. Full build and suite pass with TZ=Asia/Singapore; regenerated canonical outputs accompany implementation.
8. Claude reviews the exact final head; owner decides merge and deployment.

## Verification

No product code changed. Build and tests not run: owner requested PR preparation only. No green-suite, implementation, staging or live-verification claim.

## Handoff

Wait for owner to switch model and explicitly resume. Then read current main, coordination claims and open PRs; reconcile this proposal with annual accounting and active Roster work. Claim bounded implementation scope before changing product code. Owner's explicit request permits this documentation-only draft despite the queue's default two-open-PR limit; it does not claim a concurrent Roster implementation slot.

## Deployment

Not deployed. No configuration or production authority changes.


## 31 October source review after Claude's plan comments

Model: Codex. Read-only source review; no product implementation started. Owner request: "check PR see what you can work on".

### Confirmed existing behaviour

- `shared/roster-allocation.js:captureWeek` already stores one `entitlements` row per staffId/week/year, with Deploy provenance. Reuse this ledger; do not create a second cumulative ledger.
- `captureWeek` currently permits only the current week. It cannot record next Monday on Sunday without an explicit checkpoint path. Preserve the ordinary no-backfill restriction.
- `weekQuota` deliberately reads current Deploy R for current/future planning even if an observed entitlement exists. Freezing the denominator alone therefore does not freeze allocation R. The implementation must use the checkpoint quota consistently for weekly planning while retaining live employment/cap and absence safety checks.
- `annual` and `balances` currently include entitlements only through `monday(ctx.today)`. On Sunday they exclude the coming week's row. Update the defined accounting horizon at the checkpoint so the Sunday's first Monday allocation sees the credited denominator. Do not change historical totals.
- `backend/RosterOperations.gs:rosterOperationsQuota_` and `backend/Relief.gs:reliefRosterQuota_` use the published Deploy document with guarded, versioned calculation caches. Production Google-first Roster does not require a second HTTP hop through the Deploy webpage.
- `roster-update/public/_worker.js:scheduledRoster` already chooses tomorrow after 16:00 and sends Calendar context to the authenticated backend. Extend the existing scheduled route rather than add an unrelated scheduler.

### Concrete regression cases to add during implementation

1. Publish policy R=5 before Sunday 16:00, capture the coming week, then publish R=3 on Wednesday: that week's entitlement AND allocation R remain 5; next week's checkpoint uses 3.
2. On Sunday immediately before/after 16:00, next week's denominator is excluded/included as specified; the first Monday allocation uses the post-checkpoint total.
3. Repeat or race checkpoint requests: exactly one credit per teacher/week/year through the existing transaction/lock.
4. Monday is a holiday but Tuesday is a verified school day: capture the school week using verified eligible context; a fully non-school week earns no quota.
5. Preserve whole-week extended leave, service-date, daily-roster SRE and FAJT/SRE classification rules.
6. Verify missed checkpoint/retry semantics against a publication arriving after the cutoff. Never silently substitute a later publication as though it existed at Sunday 16:00.
7. Keep current employment caps, inactive-staff exclusions, absence constraints, manual/peer assignments and completed duties intact.

### Architecture decision still open

The owner requested shared Cloudflare R storage. Claude recommends first scheduling the existing Google-authoritative ledger and deferring the independent Cloudflare snapshot to the D1 migration. These are different delivery scopes; this review does not silently choose between them.

For the Cloudflare option, publish-time snapshots need durable delivery/retry and historical publication selection at the Sunday cutoff. A "latest R" row alone cannot guarantee the rule after a missed checkpoint. For the smaller current-route option, reuse the existing published source and ledger, and explicitly document the remaining snapshot/catch-up limitation.

### Next action and coordination

Resolve the storage route before product implementation. Recheck active Roster claims, especially PR #27, which edits the same allocation/accounting domain. Existing implementation deferment is unchanged. No tests run for this documentation-only revision; source review is not a runtime pass.
