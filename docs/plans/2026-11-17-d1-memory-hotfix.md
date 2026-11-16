# D1 background memory hotfix on v0.9.9y

Model: Codex. Extends PR #182 at the owner's request after notification minute-cron memory exhaustion on 16 and 17 November. Claude review is waived by the owner for v0.9 hotfixes. The owner merges and deploys. Codex has not deployed or changed live configuration/data.

## Changes

Verified-D1 notification scheduled and queue invocations now admit one materialized Roster mutation per isolate. Up to sixteen callbacks can wait for at most thirty seconds without loading another state. An active mutation's permit never expires while its result is unresolved. Timed-out/overflow admission leaves commands unstarted and retained; it releases the scheduled allocation-cycle lease. Provider sends stay outside the permit. Foreground requests retain independent cancellation and D1 revision fencing.

Plan hydration and packing replace only changed plan fields, preserving the original CAS snapshot without extra full copies of retained history. System Health displays busy/backoff/memory codes and lease counters. All existing absence-clash, received-report recovery and public-menu changes in PR #182 are included.

## Owner deployment

Save the current versions of both Workers and Roster Pages for rollback. The label remains v0.9.9y; use COMMIT.txt and SHA256SUMS.txt to identify this package.

1. Replace `gsis-roster-notifications` with `gsis-roster-notifications_worker.js`.
2. Replace `gsis-operations` with `gsis-operations_worker.js`.
3. Publish `Roster_Frontend.zip` to the existing Roster Pages project, with its files at the ZIP root. Refresh the browser.

Preserve existing cron schedules, authority flags, pause/send flags, D1/R2 bindings, URLs, secrets and Meta settings. No Apps Script upload, schema migration, data deletion or live SQL repair is required. This package does not change v1.

## Checks

- Confirm the new notification Worker version is running. Check minute-cron outcomes for recurring `exceededMemory` across successive invocations, including an actual due-work interval. A completed idle tick does not prove an allocation was produced.
- An existing allocation-cycle lease from an interrupted invocation can remain until its original nine-minute expiry. The hotfix does not clear it. Read lease counters together with their event timestamps.
- Refresh System Health. Busy/backoff reasons and lease counters must be visible instead of UNKNOWN_ERROR. A full or timed-out local admission is retryable; it must not leave a fresh nine-minute allocation lease.
- Check received reports progress to confirmed saved receipts and appear under Absent Teachers. Preserve request identities and review uncertain outcomes; do not resubmit unknown results as new reports.
- Check the current date's allocation run and saved assignments. The hotfix does not replay missed automatic time slots or change cutoff/allocation policy. If the automatic window has passed, the owner may need the existing manual workflow after reviewing pending reports.
- Confirm notification processing resumes through existing claims. Provider acceptance is not confirmed delivery; check existing delivery records. No live duplicate-send test is needed.

The mutation gate addresses demonstrated concurrent state amplification. Large read-only exports, model-cache retention, full backups and unrelated provider failures remain outside this repair. Local synthetic memory measurements are not live capacity verification.

## Rollback and evidence

Restore the saved matching versions of both Workers and Roster Pages. Keep D1/R2 records, receipts, claims and configuration. Rollback does not undo confirmed work.

Task and local evidence: `docs/coordination/tasks/roster-d1-worker-memory-hotfix.md`. The package verification record and PR body must name the exact head, actual full local results, all-five-job CI run and checksums. No earlier approval covers the new head.
