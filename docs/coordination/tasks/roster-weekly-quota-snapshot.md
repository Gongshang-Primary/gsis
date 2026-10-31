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
