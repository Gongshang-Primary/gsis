# roster-weekly-quota-snapshot: Sunday quota checkpoint

- Status: implemented locally as combined PR #29; exact-head full CI and owner merge remain required.
- Owner/model: Codex.
- Reviewer/model: Claude, exact implementation head after the full suite passes.
- Last updated (Asia/Singapore): 1 November 2026.
- Branch: codex/roster-weekly-quota-snapshot
- Base SHA: rebased #30 (`95a047b` remote, identical to local `86298b7`), on cutover main `84a71b5`. Preserve the completed Cloudflare snapshot and FAJT changes; #30 must merge first after the hold.
- Current head SHA: see PR head.
- PR: this branch's draft PR.
- User-authorised scope: owner resumed implementation of PRs #30 and #29, including the accepted Cloudflare snapshot source.
- Files/domains owned now: see roster-combined-weekly-quota.md for the bounded implementation and current verification gates.
- Implementation domains: Deploy publication, shared Cloudflare quota snapshot, Roster weekly quota ledger and allocation checkpoint, health and focused tests.
- Out of scope: other queue items, production authority cutover, deployment, live records, messages, automatic merge, administrator-selected effective dates.

## Current implementation, 31 October 2026

The combined implementation in `roster-combined-weekly-quota.md` supersedes the earlier preparation-only and Google-only notes below. Owner option B is implemented: immutable published Cloudflare snapshots feed the existing weekly entitlement ledger. Current main v0.9.9e and PR #30 at `f7e0022` are retained. All 18 components rebuild; focused publication, source-authority, checkpoint, health, FAJT and inactive-staff checks pass. Full Node/LORD CI on the eventual remote head remains the readiness gate. The earlier implementation deferment no longer applies. Nothing is deployed or activated.

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



## Combined implementation started 31 October 2026

Owner: "reconcile/combine PR27 and 29 and start on it". This supersedes the prior implementation deferment. PR #29 is the combined branch; the original #27 history is retained as a parent of the integration commit. Current main is retained, including cold archives. The recommended current Google-first route is used; a separate Cloudflare quota store remains with the D1 migration.

Implemented so far: FAJT priority/settings from #27; existing-ledger Sunday capture, frozen weekly R, cumulative horizon, cutoff provenance, safe prior-R fallback, pending retries, and scheduler/Calendar wiring. Local focused tests pass. Full release build and suite pending CI because this runtime has only a selected source checkout. No deployment, authority change or messages.

Remaining gate: complete CI, reconcile generated output, run review and report exact head.

## 1 November rebase and cutover hold

Owner explicitly requests the combined option 3B Cloudflare snapshot and FAJT work rebased on current main, fully verified, reopened ready and held. No product merge before Monday 2 November 2026, 08:00 SGT. Tonight Sunday 19:00 uses the current main product code. Label: `hold until after cutover`. Claude reviews exact head; owner merges. This supersedes older preparation-only, Google-only deferment and one-open-PR notes.

The preserved original remote source tree c692275 is verified byte-for-byte before rebase; all 73 changed paths are retained. Rebase includes the latest #30 fixes and F. Both freeze and R snapshot System Health panels remain. Canonical sources rebuild all generated copies. Original f6aca34 will be archived before the owner-authorised leased feature-branch replacement. Main is not written or merged.

Reproduced the prior nine CI failures. Fixed the read boundary: source-authority probes, quota snapshot reads and health/control status do not initialize operational or quota tables. Missing schema is missing evidence, and an unknown persisted authority fails closed. Existing SELECT-only/no-authority-initialization assertions remain. Idle scheduler fixtures now explicitly start with an already-settled weekly checkpoint; a separate case verifies that an uncaptured checkpoint enters verified processing. The Calendar batch expectation includes the required checkpoint week in the same single request. The inactive follow-up fixture uses a date outside that week, and the diagnostic VM loader ends at the next export. Every prior domain, receipt, quota, concurrency and no-hydration assertion is retained.

Rebase verification checkpoint: all 18 components rebuilt, and all 53 combined focused programs pass, including the nine earlier failures, every weekly/quota/FAJT program, all seven F controls, the latest inactive email/clock/freshness regressions, Contacts and the real large D1/Google backup round-trip. Invalid quota payloads now prove that no schema is created, in addition to no accepted rows. Full exact-head Node/LORD CI and Claude review remain the readiness gates.


### Rebase advisory fixes, 1 November (Model: Codex)

Whole-branch Codex advisory found three reproducible checkpoint issues. An ordinary manual/inactive optimisation cannot freeze a first checkpoint without trusted source-attempt evidence. Scheduler proof now names the selected school date and must match the final Calendar (including every preceding weekday); a mismatch leaves immediate retry pending without freezing fallback. A current Deploy outage retains independent checkpoint fallback/unknown state and one weekly alert in both adapters, while blocking allocation and notification preparation and retaining the ordinary retry receipt. Actual SQLite and Google-context regressions cover these boundaries. This advisory is not Claude approval; Claude must review the final published head. Product merge remains held until Monday 2 November 2026 08:00 SGT.
