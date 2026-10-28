# GSiS 0.9.9

28 October 2026. Full-suite consolidation on Calendar Q (`50c977d79c9756dfdbee91f2922f0cd89ab6e903`) and the P suite. The eighteen production component labels and the separate compatible timetable-preparation package are harmonised at 0.9.9. Roster remains Google-first; preparation is isolated and no authority handover is activated.

## Calendar

- Compact work status and stable event-table updates preserve the visible date anchor, unaffected rows, editing state and local drafts while refreshed data arrives. Saving to Google and syncing to Google Calendar remain distinct states; error detail and recovery remain available.
- Venue lookup retains the permitted directory, canonical VenueID and custom free-text contract. Diagnostic responses distinguish unavailable/configuration outcomes without exposing credentials or treating lookup as free/busy.
- Optional Calendar change awareness uses a durable D1 journal and the `CalendarChangeHub` Durable Object in the existing jobs service. Supported Pages writes and accepted job state changes produce replayable hints; the browser fetches authorised changed data and patches affected dates. Cursor gaps require a fresh scoped snapshot. When enabled, bounded reconnect and permission renewal replace the fixed browser data/status polling loop. Generic invalidation and uncertain reconciliation hints are distinct from exact committed-job evidence.
- Push requires additive schema/DO setup and explicit `CALENDAR_CHANGE_PUSH=true` on Calendar Pages and the existing jobs service. It stays disabled until configured; without that setup the existing 15-second queue checks and focus behavior remain. Direct spreadsheet edits, uninstrumented Apps Script helpers and older routes require manual Refresh and do not promise immediate hints. Push does not discover every out-of-band writer.
- Existing Q exact-run timeout recovery, native Sheet I/O, provider identities, source fences, bounded checkpoints and genuine cooldowns remain. `CALENDAR_SYNC_CONTINUE=false` is preserved; push awareness does not itself authorise background Sync Staff continuation.

Final exact feature scope and executed checks are recorded in the release validation. A build or a push hint is not proof of live source freshness, production throughput or provider completion.

## Roster and parallel Worker preparation

- Preserve independent confirmed Stapler intent; enabled suspended-day allocation rules and cumulative R; anytime manual actions limited to unstarted eligible work; visibility/notification independence; exact request receipts and provider uncertainty.
- Retain existing receipt-first absence intake where configured. Transport acceptance is explicitly different from an applied absence or authoritative Google save. Other Roster operation families are not silently migrated into D1.
- Harmonise the separate native preparation Worker/UI/package labels without changing the O-compatible import protocol or making it a production reader. Current Calendar parity, Contacts identity mapping, freshness and role-scoped projections remain required integration work.
- Add a bounded Worker route roadmap covering measurement, administrator comparison, operation receipts, verified projections/caches, isolated simulation, all-writer fencing, overnight intake, ownership transfer and reconciled rollback. Google stays authoritative throughout the early stages.

## Handover and history

The [requirement register](docs/v099/REQUIREMENTS_STATUS.md) resolves old H–Q proposals against delivered code/evidence and separates new implementation, operator acceptance and future migration. The stale top-level pending/next notes now link to this current status. [HANDOVER.md](docs/v099/HANDOVER.md), [RECOVERY_HISTORY.md](docs/v099/RECOVERY_HISTORY.md) and [TIMETABLE_HANDOVER_STATUS.md](docs/v099/TIMETABLE_HANDOVER_STATUS.md) provide the starting point for another developer or LLM.

Delivery retains current source, build scripts, tests, pivotal contracts and selected verification/review evidence. History pruning concerns delivery copies only; it does not delete school records, receipts, plans, provider evidence or live D1/R2 objects, and does not rewrite Git history. Secrets and raw school snapshots do not belong in the source review package.

## Live evidence and remaining work

The operator's P rollout report confirms the earlier full P installation, five saved Calendar queue jobs and unedited native timetable import/readback at revision 2 across 31 dates. It does not prove 0.9.9 deployment, live full-year sync, current parity/identity or an authority handover.

The separately authorised deletion of the earlier blocked Calendar event completed at 15:22:50 Singapore time on 28 October using a direct Sheets atomic field/audit batch, outside the Apps Script lock. The replacement committed receipt and superseded old receipt preserve the original unknown outcome; audit evidence was verified twice. Another orphan `DISPATCHED` receipt remains untouched. Do not generalise this one recovery action into “all source receipts cleared” or a new runtime retry policy.

Open operator checks include live current-run/incremental/full-year sync results, `saveParentSide` queue use, retained queue/receipt health, the preparation two-tab stale race, OAuth origin review and an all-app version/data-load sweep. Worker authority cutover remains future work. Exact status is in [REQUIREMENTS_STATUS.md](docs/v099/REQUIREMENTS_STATUS.md).

## Verification and deployment boundary

Use the final 0.9.9 validation and package manifest for executed commands, outcomes, hashes and installation instructions. Q's inherited 13 unpassed programs remain explicitly classified in [its failure register](docs/v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md); they must not be relabelled as a wholly green 0.9.9 full-suite run. Later cases blocked by earlier assertions are not counted as covered.

Install matched backend/frontend versions using the existing URLs, credentials and resource ownership. Preserve Deploy's separately configured route and existing scheduled sender ownership. Building or downloading this release does not deploy it, send a message, publish a timetable, enable Calendar continuation or switch Roster authority.
