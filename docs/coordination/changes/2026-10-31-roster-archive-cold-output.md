# Roster cold-output archives

Model: Codex. Queue row A. Google remains the authoritative Roster store.

## Behavior

The Admin Storage page replaces the former pruning controls. It loads the current storage report directly and offers Archive now, monthly totals, paginated record lists and Open archived copy.

Only finished machine output whose date and latest relevant timestamp are strictly more than 30 days old is eligible. The shared rule list covers outbox payloads, request receipts, scheduler receipts, captured optimisation runs, identified system audit events and resolved SMC alerts. Current and future work, queued or uncertain sends, pending retries and human audit actions remain in the main file. Absences, assignments, acknowledgements, relief accounting, baseline timetables, Stapler plans and publication records are not archive candidates.

Request receipt identities stay in the main file because ordinary Google requests have no expiry. A matching replay loads its original result from the verified archive. Scheduler requests already reject timestamps older than two minutes; their old records can leave the main file after verified archival.

Each operation moves at most 2,000,000 source JSON characters. The existing audit maintenance job also attempts archival once per Singapore day after 16:00. Its successful-day marker avoids repeated full reads. Manual runs use the same writer and retain a request identity for safe retries.

## Storage and recovery

Files are named `Roster archive YYYY-MM.json` in the existing Roster data folder. Each entry retains the original JSON string, collection, record ID and SHA-256 digest. Different retained versions of an ID have different digests. The writer retains previous entries, writes the monthly archive, reads it back and checks its digest before committing compact records to the main file.

An interruption before the main-file commit leaves complete records in both places. Retrying reuses identical archived entries. A failed archive read or digest check leaves the main-file bodies intact. Old daily audit exports remain available, and their exporter no longer deletes human audit or run records. Notification overlays retain compact delivery fields without putting large payloads back into the main file.

Monthly archive reads are Admin-only. Existing permitted historical notification views resolve only their requested date. They do not cause ordinary current-day requests to read monthly archives.

D1 import preserves compact records and archive references. This change does not transfer monthly files to D1 or implement D1 archive resolution. References still depend on the retained Google archive files.

## Release and rollback

No deployment, live archival, message send, configuration change or authority cutover is part of this PR. Existing folder permissions, bindings and service settings remain in use. The successful-day Script Property is internal maintenance state, not a new operator setting.

Before deployment, Claude reviews the exact PR head. Staging must confirm Apps Script execution time and Drive behavior with representative data. Local synthetic timings do not establish live throughput.

To stop further automatic archival, remove its maintenance hook while retaining the archive readers. Do not remove monthly files or install a backend that cannot resolve compact receipts. Returning to a fully unarchived format requires verified rehydration before retiring those readers.

## Verification

The task record holds the exact commands and final results. Focused checks cover original JSON recovery, protected data and R/statistics parity, replay identities, scheduler expiry, interrupted writes, corruption, authorization, notification overlays, archive UI and D1 import of compact records. The complete Node and LORD suites must pass before the PR opens.
