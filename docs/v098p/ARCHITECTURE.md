# GSiS 0.9.8p current architecture

This map describes the retained production boundaries. A Cloudflare gateway does not by itself make Cloudflare the authoritative data owner.

| Path | Transport and processing | Durable authority |
| --- | --- | --- |
| Roster absence | Browser → authenticated Pages Worker → durable intake where configured → Google processing | Existing Google Roster records; transport receipts retain their separate state |
| Assign Relief / Stapler | Browser → Pages Worker → existing backend operation and conflict checks | Existing Google Roster operations/plans |
| Roster notifications | Existing scheduled Worker → retained jobs/provider adapters → delivery reconciliation | Existing jobs, Google records and provider evidence according to the configured recovery path |
| Calendar event edit | Pages Worker → Apps Script, or optional command Worker/D1 → Apps Script | Calendar Google workbook |
| Calendar provider sync | Saved session → bounded Apps Script batch → Google Calendar API v3 | Google workbook source, saved checkpoint and provider IDs; Google Calendar is the target |
| Timetable preparation | Administrator export → strict O preparation importer → private R2 gzip + D1 pointers | Isolated snapshot only; no production ownership |
| Contacts | Authenticated Pages Worker → Contacts backend | Existing Contacts workbook and stable identity catalogue |
| Deploy / Layout | Existing gateway and configured backend route | Preserve existing Deploy authority; P does not change its migration flags |
| LORD / OVERLORD / STARLORD | Separate Pages gateways → one LORD backend | Existing LORD workbooks, Drive evidence and task/receipt stores |
| Venues | Venue gateway → Venues backend and permitted source bridges | Existing venue policies, booking records, receipts and notification evidence |

## Authority fences

Roster Pages and its notification entry points apply the recovery profile. Historical full-Roster migration endpoints remain disabled. The private Operations Worker is supplied for existing instances, not activated as a timetable shortcut. Deploy retains its own configured routing.

Preparation accepts only explicitly allowed school administrators. Teacher and venue consumers cannot be pointed at that admin interface. Production integration needs verified dated parity, current identity mapping, role-limited projections, source-change refresh, all-writer handover, date rollover, protected retention and rollback.

The same request identity protects uncertain retries. A queued or received request is not labelled saved until the authoritative result is known. Notification submission, provider acceptance and confirmed delivery remain different facts.

## Release boundaries

P changes export serialization, diagnostic version consistency and Calendar bulk-sync reliability. It harmonises the eighteen production component labels. The compatible O preparation module and schema remain unchanged.

No production deployment, new infrastructure, authority cutover, scheduled live sync or provider message is performed by building this release. The review bundle contains current source and evidence; school data and secret configuration remain outside it.
