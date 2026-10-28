# Timetable preparation and production handover status

28 October 2026. The separate 0.9.9 preparation package harmonises labels while preserving the O-compatible native import protocol and existing isolated D1/R2 ownership. It remains an administrator-only preparation service. Roster production remains Google-first.

## Evidence available

The earlier O operator report established a live isolated import/readback after removing transport-only diagnostic fields. The P report subsequently established the actual fix: an unedited production export imported successfully to the unchanged O Worker, revision 2, six native parts, 15 projection hashes and 31 date mappings. Existing synthetic rehearsal records were a separate dataset. These are operator-reported live results, not fresh executions during 0.9.9 packaging.

The 0.9.9 preparation validation describes its current local checks. Preserve the importer/schema strictness, native bytes and hashes, immutable private objects, bounded decompression/readback and atomic pointer/receipt commit. An unchanged import or exact retry must not create an extra logical revision. A losing concurrent import must not publish a new head.

## Boundaries that remain

Preparation exposes only authenticated `/api/prep/*` routes. Its head remains `shadow-only`; responses retain `productionAuthority: "google"` and `sourceFreshness: "not-independently-verified"`. It has no production Google write credential, notification provider, scheduler, delete operation or activation endpoint. A stored dated candidate is not a verified Calendar school-day/odd-even selection.

Current Contacts/Name Bridge teacher identity mapping, Calendar dated decisions, source freshness and ordinary-consumer permissions are not established by imported hashes. The next implementation is an administrator-only trusted comparison adapter returning both source revisions and differences, leaving production answers unchanged. Use [ROSTER_WORKER_ROADMAP.md](ROSTER_WORKER_ROADMAP.md) for the bounded sequence.

| Gate | Required before production use |
| --- | --- |
| Date and identity | Current Calendar school-day/parity plus Contacts identity evidence, revision-bound; missing/duplicate/changed identities fail without broader access. |
| Confirmed intent | Independent Stapler confirmation remains valid across baseline changes/missing baseline. Draft changes do not overwrite confirmed content. Null baseline mappings stay null. |
| Read permissions | Authenticated teacher, SMC and admin projections with their own current permissions. Preparation allowlist auth is not a production teacher session. |
| Venue projection | Independently tested restricted occupancy including needed display name, excluding drafts, private absence details, contacts and instructions. Existing Roster venue export remains paused. |
| Freshness and rollover | Every baseline/Stapler lifecycle writer invalidates affected projections; Singapore 31-date window advances; failed refresh is visibly pending/failed, not certified current. |
| Atomic operation ownership | Expected source revision and one authority epoch; exhaustive writers fenced at final commit; idempotent receipts/outbox; no two accepted writers. |
| Overnight reports | Durable intake across the ownership change and exact replay under the effective timetable revision. Existing recovery pause rejects before capture and is not this buffer. |
| Recovery | Native pointer/object integrity, bounded retention, asynchronous timestamped backup and reconciled return of ownership after new writes. No silent stale-Google fallback after cutover. |
| Live acceptance | Ordinary/suspended/odd-even/missing/non-school/rollover comparisons, two-tab race, permission revocation, interruption/storage failures and representative load/latency. |

Keep the current absence transport and Google processing operational throughout preparation. The historical Operations Worker expects verified active heads for Roster, register and references; setting its D1 flag is not a timetable-only shortcut. Deploy has a separate authority boundary and is not changed by this programme.

Delivery pruning removes duplicate historical source artifacts only. It never authorises pruning live plans, cumulative accounting, receipts, provider outcomes or R2 recovery objects. See [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md) for precise remaining operator work and [HANDOVER.md](HANDOVER.md) for the source map.
