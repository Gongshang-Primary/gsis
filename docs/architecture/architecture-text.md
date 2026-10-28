# GSiS v0.9.2 architecture — text alternative

This is the text alternative to `GSiS_v0.9.2_Architecture.html` and the three editable pages in `GSiS_v0.9.2_Architecture.drawio`. [The main README](../../README.md) is the deployment and maintenance guide. This companion describes the source architecture; it is not a live configuration inventory.

Staff use nine browser applications. Their same-origin Pages gateways serve assets, apply app-specific access checks and forward API operations to six Apps Script owner projects. Private staff apps verify school identity; STARLORD is a read-only display whose outer access policy is a separate deployment responsibility. The backend checks current authority and owns its writes. Local browser caches improve navigation and repeated reads; they never authorize a mutation.

| Application | Staff interaction | Authoritative owner |
| --- | --- | --- |
| Contacts | Maintain staff identities, contacts and application access | Contacts Apps Script and workbook |
| Calendar | Review school dates, parity and events; manage authorised calendar data | Calendar Apps Script and its bound workbook |
| Deploy | Plan staff/class/subject allocations and publish a reviewed version | Deploy Apps Script and workbook |
| Layout | Review and maintain the physical room catalogue and campus descriptions | The same Deploy owner, with Layout repositories |
| Roster | Report absences, plan relief, confirm suspended timetables, publish and acknowledge duties | Separate Roster Apps Script and private Drive state |
| Venues | Find available space, book periods, manage requests, transfer ownership and administer room policy | Separate Venues Apps Script, workbook and immutable Drive snapshots |
| LORD | Book shared devices and track booking responsibilities | LORD Apps Script, shared with OVERLORD and STARLORD |
| OVERLORD | Administer the device/booking workflow | The same LORD owner |
| STARLORD | View the read-only device booking board | The same LORD owner |

The HTML groups Contacts, Calendar and Deploy as **Reference backends**, and Roster, Venues and LORD as **Operational backends**. These are visual groupings, not additional services or shared write owners. The Draw.io ownership page expands all six owners and their stores.

| Caller → source | Exchange and boundary |
| --- | --- |
| Browser → Pages gateway | Same-origin requests; app-specific identity and access rules; client-supplied roles are never authoritative |
| Venues browser → Venues Pages | POST `/api/read` for reads and POST `/api/command` for commands; `/b/<id>` and `/r/<id>` request scoped `bookings` reads using `id` or `transferId` after sign-in |
| Pages gateway → assigned Apps Script | Server-side authenticated proxy request; app-specific request/envelope contracts remain distinct |
| Deploy → Contacts | Signed staff and current access projection |
| Roster → Contacts | Signed staff and SMC authority read |
| Roster → Deploy workbook | Read-only published quota/catalogue via `book_()`, `index_()` and `publishedEntry_()`; no HTTP proxy is implied |
| Roster gateway → Calendar | Authorised bounded date/parity context |
| LORD → Contacts / Deploy | Signed `lordService` manifests and minimal changed snapshots; private validated reference copies |
| Venues → Contacts / Deploy / Calendar / Roster | Signed `venuesSource` reads: active staff, physical rooms, covered dates/parity, effective timetable occupancy |
| Roster → Venues | Signed durable source `begin` and `complete`; a pending source fence blocks booking admission |
| Roster notification Worker → Roster | Separate service credentials; claim, prepare and settle durable notification intents |
| Delivery runtimes → providers | Roster Worker, LORD and Venues send through their own supported routes; provider acceptance and actual delivery are different states |

Venues has separate facilities grants: a room owner and a facilities administrator are not inferred from Roster SMC or another app's admin role. Every write rechecks the actor, current grant, record revision and applicable room policy. Venues accepts a verified school Google token or its origin-bound HttpOnly session. An optional configured Cloudflare Access deployment verifies the JWT signature, issuer and audience; an email header alone is never trusted. The exact settings remain in the main README and gateway source.

The Venues source and booking flow is:

1. Roster durably begins a unique source token before an occupancy-changing timetable write. Unrelated absence, audit and delivery updates can continue while the fence is pending. Missing or ambiguous acknowledgement blocks the source write. The source fence remains pending until the matching operation completes or explicit recovery verifies the writer state.
2. Completion marks the Venues projection stale. A background sync reads authoritative sources outside the Venues writer lock, verifies their revisions, resolves stable room identities and builds immutable occupancy pieces.
3. Activation reacquires the writer lock and checks the captured fence, token, source revisions and policy revision. A changed source or unresolved date/room cannot be treated as empty availability.
4. A booking command carries a stable request ID and observed revisions. The backend validates covered dates, selected intervals, opening hours, room policy, timetable occupancy, pending/confirmed holds, closures, buffers and overlap groups. Per-record revision conflicts remain authoritative.
5. Accepted effects, audit attribution, retry receipt and notification intent commit together in the Venues workbook. This is not atomicity across Google services. A timetable refresh can displace an incompatible booking; an accepted timetable transfer uses a generation-scoped waiver and beneficiary occurrence.
6. The Venues backend reads and verifies immutable Drive pieces, and serves whitelisted responses through the authenticated Pages API. The browser checks every immutable piece's digest and uncompressed byte length before switching generation. Date, filter and Now navigation can then remain local. Booking revisions do not invalidate unchanged timetable pieces.
7. Background delivery processes bounded durable outbox work. Missing provider setup remains visible. Ambiguous acceptance is retained for review rather than automatically resending a possible duplicate.

The optional Roster R2, D1 and Queue services serve documented media/snapshot, webhook/read-claim and wake functions. They do not replace Roster's business records or delivery authority. The core suite does not acquire a new D1, R2 or Queue dependency merely because these options are shown.

Each Apps Script owner has its own execution, authorization and writer-lock boundary. Sharing an account or a spreadsheet identifier does not make cross-project writes safe. The release must retain each record's existing single writer, durable receipts, source identities and unresolved delivery state.

`architecture-source.json` records the inspected source ranges, and `architecture-evidence.json` records the pinned local Git revision and file/range hashes. The repository was recovered from a local bundle; no hosted upstream is asserted. Archify's repository gate accepts HTTP(S)/SSH origins only, so its artifact/browser results are distinct from the separate local Git evidence check. Draw.io structural and semantic validation does not claim a native editor render.
