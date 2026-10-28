# v0.7.07 performance and reliability

## Local work

Check Availability selections/highlights, teacher/class/Pit filters and Stapler tile moves operate on in-memory timetable data. They do not request a server response per interaction. Current mutable availability and save authority remain separate from baseline previews.

The pure model benchmark used 120 teachers and 24 periods. With 2,880 tiles (about 1.71 MB serialized), 100 edits averaged 40.87 ms in local Node. This is model time, not a low-end device or production browser guarantee. Browser tests verify no network call during local moves/selection, atomic rollback on clashes, and rotating progress.

The importer parsed the supplied 100-teacher Odd/Even MSHTML timetable in about 2.62 s and a reconstructed .xlsx in about 1.81 s under jsdom. Import is a one-time CPU operation; it is not a measure of server save latency.

## Storage and server boundaries

The single operational Drive document remains the atomic commit unit. Stapler plans use native gzip and lazy decoding. An approximately 971 KB synthetic plan stored at approximately 31 KB; identical draft/published content shares one stored payload. Unrelated reads and writes do not inflate archived plan content. The 12 MB operational-store guard remains and historical pruning is explicit.

Duty roster reads and exact retries avoid timetable/register reads. Version-backed quota/source metadata is cached by current in-force source and Singapore day; authority and recipient eligibility remain fresh. Calendar reads remain batched for multi-date planning.

## Reliability checks

Separate reviews cover baseline tampering, teacher double-booking, class/recess atomic moves, field/date/account races, exact write receipts, draft/live isolation, first-publication audit collection, source-matched R, notification fingerprint updates, duty windows and recipient revocation. Source tests use synthetic or intercepted services.

No production latency or WhatsApp delivery measurement was made. Saving still requires authenticated backend confirmation; the UI never substitutes a local optimistic result for a confirmed write.
