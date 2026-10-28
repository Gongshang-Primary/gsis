# GSiS v0.9.1c verification

25 October 2026, Singapore time. Source baseline: f8cbb01d85d50de18939ddcb4f12eb560e5b6942, tag v0.9.1b.

The final integrated run passed all **363 Roster-related test programs**, with zero failures. It includes the three new full-year domain/adapter, Worker and Chromium suites, existing absence/instruction/concurrency regressions, notification guards, prepared timetable/cache tests and component-package fixtures. The syntax gate parsed **141 Apps Script sources**. Independent code review found no remaining material issue.

Focused local checks save a full leap year for two teachers as 732 absence records in one operations-document commit. The fixture uses 1,726,591 record characters and 1,750,802 document characters; retaining 6,000 historical records grows it to 2,871,692 characters with one commit. The production context-building path, exercised with Google service fakes, loads two distinct timetable models once each, reads one subject catalogue and performs no quota calculation calls. It reads the source index at preparation and at the locked source check. Calendar transport uses six batches of 62/62/62/62/62/56 dates, six bounded year checks, and one signed Roster backend command.

Instruction concurrency checks preserve edits to different cells, retain the latest saved value on a same-cell conflict, reject stale instructions after absence coverage changes, and replay an exact request without another durable write. The existing 12,000,000-character operations-document guard remains authoritative. These are local call counts and correctness tests, not production latency measurements.

The Chromium year fixture starts on Saturday 1 January 2028, previews and submits two teachers in one request, keeps a lazy date selector, and preserves dated notes and period timings through readback and amendment. Bulk No relief instructions updates 259 eligible records and explicitly reports 107 unchanged entries; pending dates and existing text are preserved. Future absences create no immediate alert burst, and the existing current-workday delivery gate remains intact. Past-date and staff eligibility checks remain unchanged.

Worker checks cover unavailable years, malformed or spoofed Calendar replies, the viewed date versus the mutation range, and existing short cross-year requests. The 262,144-byte request-body limit remains intact; an over-limit body is rejected before service calls. A representative 160,136-byte instruction request yields a 259,468-character signed envelope, below the existing 600,000-character limit.

Checks use local Google/provider simulations and Chromium. No live deployment, setting change, timetable publication or provider send is performed. School production contention, Apps Script cold starts and network timing are not measured by local tests.

The component archive is checked for exact deployment scope, canonical source parity, hashes, tag/bundle provenance and tampering. The final download is rebuilt from the clean tagged commit, recorded in PATCH.json. No LORD runtime changed, so the LORD test suite was not repeated for this patch.
