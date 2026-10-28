# GSiS 0.9.8o changes

Revision O adds an administrator-only native timetable export and a separate Cloudflare preparation build. Google remains production authority; the relief-assignment ledger stays on hold. N's intake repair is inherited.

- Roster: System Health links administrators to **Prepare timetable migration**. Export reads Singapore today through +30 inclusive, with native baseline models and proven confirmed intended Stapler plans. It excludes newer drafts, private contacts/reasons, attendance, relief and notification queues. Per-part hashes, source bracketing and a final source observation reject changed exports. Confirmed plans remain independent of current baselines, including standalone plans.
- Isolated preparation: reuse the tested I rehearsal Worker, D1 and private R2. Separate preparation tables and object keys store native sources and individually compressed dated copies. Independent model/plan reconstruction checks, bounded gzip/SHA readback, exact request retries and atomic D1 revision checks protect the imported snapshot. No production source writes, activation, delivery, cron or destructive cleanup are added.
- Google sign-in: the preparation Worker's server-side JWKS request uses the Workers-supported manual redirect mode and rejects redirects. Browser requests retain their existing redirect protection. The historical I bundle is preserved.
- Calendar, optional matched repair: validate required source headers before claiming sync work; isolate unresolved event saves to their own events while retaining year-publication fences; distinguish a finished partial pass from full sync. Old errors remain recorded and need a later explicit Sync action to retry. Unknown save receipts are retained.

The live Calendar `Events!AE1` missing `VenueID` header was added and verified without changing event values. Two earlier uncertain save outcomes remain unresolved. The O code has not been deployed here, and a full live Calendar sync or school-scale preparation import is not claimed.

Production components packaged: Roster backend/frontend O; optional Calendar backend/frontend O. Notification and Operations Workers stay N, Deploy stays L, and other products retain their existing versions. The separate `GSiS_v0.9.8o_Timetable_Preparation.zip` is not a production migration.
