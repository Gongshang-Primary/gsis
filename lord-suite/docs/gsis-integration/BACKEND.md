# LORD local reference bridge

The bridge is optional. With `LORD_GSIS_ENABLED` absent or not `true`, the existing LORD Sheets reference and Contacts readers retain their behavior. It has not been enabled or deployed by this implementation.

## Configuration and activation

Set these **LORD Apps Script** properties privately:

| Property | Meaning |
| --- | --- |
| `LORD_CONTACTS_APPS_SCRIPT_URL` | Deployed GSiS Contacts `/exec` URL. |
| `LORD_DEPLOY_APPS_SCRIPT_URL` | Deployed GSiS Deploy `/exec` URL. |
| `LORD_BRIDGE_SECRET` | Dedicated random secret of at least 32 characters, also configured as `LORD_BRIDGE_SECRET` in both source Apps Script projects. Do not reuse the broader application bridge secret. |
| `LORD_GSIS_SNAPSHOT_FOLDER_ID` | Private Drive folder owned or writable by the LORD executing account. Store only LORD reference snapshots here. |
| `LORD_GSIS_LOCAL_ACTIVITIES` | Optional JSON array used only when creating the first snapshot, after reviewing unmatched old form labels. Usually unnecessary for the verified current installation. |

After deploying both source endpoints and updating LORD code, run `enableLORDGSiSBridge` once in the LORD editor. It performs a complete successful initial sync, installs a one-minute `syncLORDGSiSReferences` trigger if absent, and only then enables local snapshot reads. If authorization, source validation or trigger creation fails, do not manually set the enabled flag as a substitute. Trigger frequency is approximate; Google does not promise exact wall-clock execution.

`syncLORDGSiSReferences` is the editor/trigger handler. OVERLORD's existing administrator refresh command (`suiterefresh`) also performs a source check, outside the booking transaction lock, then returns refreshed reference data. The existing administrators sheet and verified Google-subject checks still authorize this action; GSiS roles do not grant LORD administration.

Runtime properties are `LORD_GSIS_ENABLED`, `LORD_GSIS_SNAPSHOT`, `LORD_GSIS_CHECK`, and `LORD_GSIS_SYNC_LEASE`. Do not fabricate or clear pointer/check records to force a successful status. Disabling the feature returns to the legacy local Sheets lists; review their currency before doing so.

## Read and synchronization behavior

Each source uses a dedicated signed `lordService` request with service `gsis-lord-v1`, source identity, timestamp and nonce. The initial request omits `knownKey`. Later manifest checks send the saved component key and accept an unchanged response only for that exact component. Contacts hashes the actual allowed directory projection, including direct phone edits; Deploy identifies the frozen published entry. Unpublished draft changes do not replace LORD's current catalogue.

One successful changed sync creates an immutable JSON file containing separate Contacts and Deploy components, stable source IDs, and LORD's retained activity list. A small Script Property pointer names that file and its digest. New files are created before pointer publication. The pointer switches under the existing ScriptLock only if the starting pointer and the two-minute sync lease still belong to this attempt. Overlapping attempts return busy; expired or superseded attempts cannot replace data or status. Source requests and Drive file creation occur outside this lock.

Unchanged checks update only small check metadata, without rewriting the snapshot file. The cache is an optional acceleration: bad cached content is discarded and reread from the validated immutable file. A corrupt durable file fails closed. Each ordinary execution pins one snapshot, and booking, identity, reference and recipient readers do not fetch upstream. Legacy trolley/resource and period-grid data remain local LORD references.

Reference output retains compatible string arrays and adds public ID/name catalogues. It does not expose phone numbers, email addresses or the private source snapshot. `referenceSource` reports the local key, check status, sync time, published version identity/name/revision, published date range and stored last-update time. Being outside that published range is warning metadata; this integration never silently chooses an unpublished future draft or blocks every future booking date.

## Identity, selections and history

New bookings must carry the current `referenceKey`, a namespaced class/group/activity reference and a subject ID. Self bookings resolve the current active Contacts identity from the verified school email at the backend. Administrators explicitly selecting another teacher send `teacherStaffId`. Cached cookie display names cannot choose the booking recipient.

Deliberate free-text entries remain available as `classRef: {kind: "customActivity", name}` (1–160 characters) or `subjectRef: {kind: "customPurpose", name}` (1–120 characters). Custom entries still bind the current generation and cannot masquerade as an exact listed name. They do not mutate the shared catalogue.

The original Booking/Session strings, owner fields, edit peppers and historical rows are preserved. Existing booking edits may retain unchanged historical labels. Changing a listed selection requires its current ID and key; changing an owner requires an explicit current staff selection. Historical teacher names are never a fallback recipient lookup once a stored owner identity exists. New atomic `GSIS_REFERENCE_BOUND` events retain source key, staff/class/subject references and an original normalized command digest alongside the booking commit. Partial edits preserve the earlier staff binding.

If the booking committed but its optional property receipt was not stored, deterministic batch IDs and the original atomic event recover an exact retry before checking a newer catalogue. The digest binds command fields and verified actor email/subject, excluding mutable cookie names/admin enrichment. A changed command using the same request ID is rejected. Recovery returns the stored booking state without rewriting historical labels or recreating notifications.

At initial import, current published form names (including legacy full-name spelling) and current TG names are subtracted from the old LORD class list. The verified installation has 40 matched forms and 62 retained activities. Later publications replace source classes/TGs but reuse the already retained local activity IDs; retired forms are not silently added as activities. If first activation occurs after a naming change and old form-shaped labels remain unmatched, the maintainer must review the explicit local activity list before activation.

## Notification freshness and limits

Every actual WhatsApp provider call requires a successful Contacts check whose conservative source-read start is no more than five minutes old. Invalid/future timestamps, a known failed check, or a changed snapshot after recipient lookup stop delivery. The next queue execution can retry after a successful sync. Source mobiles are normalized with the existing country-code helper before links or sends. Consent and local administrator revocation checks remain in place.

The freshness bound is not instant upstream revocation: a change can occur between scheduled checks. The provider call cannot be atomic with Contacts or with local receipt storage; existing uncertain-delivery recovery limits remain. A failed Deploy check conservatively prevents a new joint snapshot and marks the overall check unsuccessful, so phone delivery waits for a healthy complete sync.

Snapshots retain directory data in LORD's private folder. Superseded files and abandoned files from fenced/failed pointer writes are retained for recovery, with no automatic deletion introduced. Folder access and a deliberate retention process remain administrator responsibilities. There is no transaction spanning two source projects, Drive and Script Properties; checks are separately authoritative component observations, not a claim of a global simultaneous snapshot. Subject identifiers are published subject codes, so a code rename is a replacement identity. Existing imported history without a stable staff binding uses its stored verified owner email; it never guesses ownership from an old display name.

## Verification

Offline real-source checks passed at backend freeze:

- 22 bridge checks: signed contract shape, changed/unchanged generations, local-only ordinary reads, source failures, snapshot/cache tampering, sync leases, timestamp boundaries, pointer/check lost acknowledgements, phone normalization, activities, custom entries, per-execution lookup indexes and live provider-boundary checks.
- 12 independent identity/history checks: rename and name reuse, inactive owner, phone-only refresh, class/TG namespace collisions, partial edits, stale form choices, accepted-request recovery after source changes and retained/archive identity bindings.
- 8 cross-application checks exercising the actual signed LORD consumer and both GSiS source entry points, including all 40 published forms, the 62 retained activities, direct Contacts phone edits and unpublished/published future versions.
- Existing disabled-mode suites run during development: backend v1.4 (28), v1.8 (31), administrator WhatsApp (26).

These are local VM/service-adapter checks, not measured production latency, real Apps Script quotas, trigger delivery timing or live WhatsApp sends. The parent release verification reruns the complete existing suite after source/template synchronization.

### Work-count follow-up

Actual OVERLORD movement/overdue adapters were exercised with 30 and 100 session rows and 100 directory people. Once the immutable snapshot was pinned, the movement path previously made 31/101 Script Properties reads and 6,100/20,100 email accesses. It now makes one properties read and 200 email accesses in either case. The full overdue path fell from 34/104 properties reads to four. For 100 bookings and 100 binding events, repeated binding-row visits fell from 5,050 to 100. Exact counts and source hash are in `backend-work-counts.json`.

Feature mode and active email/ID maps are memoized only within one execution. Booking identity indexes track the existing event-array identity; a surgical commit invalidates that array and forces the derived binding map to rebuild, preserving later ownership changes and partial edits. Each provider send still reads live mode, snapshot pointer and check metadata (three properties reads), and rejects either feature-mode transition after a recipient was resolved. The optimization does not cache away the recipient freshness fence.
