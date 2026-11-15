# Calendar owner

`service.mjs` owns Calendar years, events, metadata, publication snapshots (verified R2 fallback above 1 MiB), external sync intentions and receipts in its D1 database. `defaults.mjs` carries the non-personal existing Calendar column/tag/formatting defaults. `external.mjs` makes bounded read-only Google observations; provider writes use the shared adapter and `SEND_OWNER=v1` gate.

The existing ten-tab client uses the action adapter. Mutations require a current Core decision, read-only impersonation is denied, and every mutation commits its operation receipt with the owner writes. Status polling reads the original operation. Parent publishers can change only parent fields. External Calendar IDs cannot be retargeted while existing links remain.

`/internal/dates` returns dated school-day/term/week/parity evidence and year-scoped revision dependencies. Destination commits pin those Calendar revisions. Calendar changes queue source updates, request durable cancellation of dependent writers, and commit only after held pins resolve. An elapsed pin lifetime alone never proves the dependent operation failed. This is an owner-side protocol, not a transaction across D1 databases.

Google sync has independent staff/parent intentions, stable provider IDs, conditional ETags, tombstones and durable per-event dispatch locks. A later delete waits for an in-flight upsert. Unknown outcomes retain their locks and require reconciliation; they are never blindly resent. Full-year sync and external wipe expand into bounded batches. Wipe re-reads an exact provider preview and uses the observed ETag for each deletion; it preserves local events. Archive writes and verifies a private native JSON continuity artifact before marking years archived; historical owner records remain retained and a separate Drive export is queued.

Contacts birthday signals arrive only through the named entrypoint, are checked against an actual committed Contacts event and pull a complete purpose-limited projection. Automatic changes update hidden working years and stage changes for released years, preserving teacher-visible records. Explicit Calendar-authorised review applies current birthdays. Neither birthday path emits Google sync or notification jobs.

Bounds include 5,000 events per year, eight open years for automatic birthday reconciliation, 512 birthday staff records, 50 jobs per expansion step and a 4 MiB archive/PDF export and 16 MiB immutable publication. A bound failure is explicit and does not partially publish. Provider HTTP tests use synthetic responses; live provider access and runtime UAT are not demonstrated by those tests.

Focused verification: `tests/v1-product-calendar.mjs`, `tests/v1-product-calendar-provider.mjs`, `tests/v1-product-calendar-birthdays.mjs`, `tests/v1-product-calendar-external.mjs`, and `tests/v1-product-calendar-pins.mjs`, and `tests/v1-product-calendar-publication.mjs`, all with `TZ=Asia/Singapore`.
