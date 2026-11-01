# LORD queued writes, phase 1 (Model: Codex)

Prepared source only. No deployment, D1 schema/configuration change, Google record or provider send is performed by preparing these files. Claude reviews the exact head; the owner merges and decides deployment.

D1 is authoritative for the new queue, durable receipts, status and bounded audit history. Existing Google booking/resource/preference decisions remain Google records. Google receives an immutable readable JSON copy of each current D1 queue version. There is no automatic reverse copy, blank decision store or authority switch.

Only `notificationPreferences` is executable in phase 1. The backend uses its existing staff permission, school agreement and consent rules, and requires the exact Google preference decision revision that the caller observed. A successful direct save records its decision even when the value repeats, fencing an older opposite queued choice. Phase 2 adds other reviewed actions and user UI wiring. No current UI uses `/api/jobs`. No photo bytes, booking, loan, return or message operation can enter this queue.

## Prepared configuration

Use a dedicated D1 binding `LORD_JOBS_DB` with `schema.sql`, and existing `LORD_BACKEND_URL` and first-party `GSIS_SECRET`. The example is deliberately disabled. Set a service binding named `LORD_JOBS` on the LORD Pages project to this Worker. The Pages `LORD_QUEUE_ENABLED` gate and Worker admission gate both default to off. Worker `LORD_QUEUE_DISPATCH` separately defaults off. Reads and backup/recovery remain available when admission is paused. A scheduled invocation performs bounded retention, up to five dispatch/check operations and ten Google backup copies. An early dispatcher/checkpoint failure leaves the durable claim for later recovery. Keep the service private (`workers_dev: false`, no public route).

On the existing LORD Apps Script installation, an operator must select a private Drive folder and set `LORD_QUEUE_BACKUP_FOLDER_ID`. Never reuse a public photo/share folder. The service never creates bindings, folders, triggers or secrets automatically. Deploy the reviewed backend before enabling admission or dispatch. Backup failures retain dirty records and eventually refuse capacity instead of discarding work; inspect `version`, `backup_version`, `state`, `error_json` and backup file counts before enabling admission. Backup lag is available by `SELECT COUNT(*) FROM lord_jobs WHERE backup_version<version`.

## API and identities

Authenticated LORD Pages routes:

- `POST /api/jobs`: `{kind:"enqueue",jobId:"<13-digit issuance milliseconds>-<UUID>",action:"notificationPreferences",payload:{enabled:false,consentConfirmed:false,expectedRevision:"<observed decisionRevision>"}}`.
- `GET /api/jobs?cursor=<nextCursor>`: current actor's latest 100 receipts plus pagination cursor.
- `GET /api/jobs/<jobId>`: current actor's exact receipt, even if admission is paused.
- `POST /api/jobs`: `{kind:"check",jobId:"..."}` explicitly schedules more read-only checks for an UNCERTAIN receipt. This never executes again.

POST requires the current origin and a signed school session. Relief sessions are excluded. The Pages gateway supplies the actor, signs a purpose/time/nonce-bound service envelope, and never falls back to direct Google. The backend separately verifies an HMAC over its complete mode/body; normal transaction routes cannot impersonate the service or another actor. Operation hashes use recursively sorted JSON object keys and SHA-256 over `{action,actor,payload}`. Display names and cached Admin flags do not define actor identity.

A first admission must be within 24 hours of the timestamp embedded in the operation ID. Keep that exact ID across timeouts, reloads and retries. Exact actor/payload replay returns its existing durable receipt; changed actor/action/payload conflicts. An absent/uncertain enqueue response never permits a new ID or direct resubmission. A status query that finds no job during a concurrent/in-flight enqueue is not proof of rejection: retry the SAME identity. After the admission window, reconcile the original identity instead of minting a replacement.

The existing authenticated `notificationPreferences` GET response now includes `decisionRevision` ("NONE" when there is no decision). Pass that observed value as payload `expectedRevision`; it is bound into the operation hash. Admission calls no Google endpoint and does not await a live Google permission check. The executor revalidates current Contacts, school policy and exact decision revision under the Google writer lock; rejected/revoked/stale choices receive a rejection outcome. Client clock timestamps never define preference ordering.

D1 acceptance means QUEUED, not Google application, booking confirmation or delivery. Public receipts explicitly carry `confirmedBooking:false`. Google acceptance is APPLIED only after exact ID/hash-bound evidence from the Google preference decision event. A rejection is REJECTED. Dispatch claims are durable before crossing the Google boundary; expired RUNNING leases and lost responses perform only status reads. After five failed observations the receipt becomes UNCERTAIN and blocks another preference operation by that actor. No automatic execute retry is allowed, even if Google has not yet found an event. Pending/uncertain identities, teacher work and notification evidence are retained. No notification is sent at queue admission or by this executor.

Admission atomically limits total rows to 5,000, unresolved rows to 1,000, and unresolved rows per actor to 20; phase 1 additionally allows one unresolved preference operation per actor. Payload fields are strictly allowlisted preference/consent booleans and a bounded observed decision revision; service envelopes are bounded to 12 KB and browser requests to 8 KB. At most 12 audit transitions are retained per row. Capacity refusal never evicts pending data.

## Backup, retention and reconciled switch-back

The private Google folder contains pretty-printed `LORD-job-<jobId>-v<version>.json` files. Names bind a version to exact content. The backend verifies stored content before acknowledging job/version/digest. Lost acknowledgements reuse that file; content conflicts stop for reconciliation. A backup acknowledgement cannot imply application and cannot overwrite D1. Export current rows with full payload, actor, hashes, timestamps, receipts and audit history for restoration; the files carry these fields.

Nonces expire after 3 minutes and are capped at 10,000 rows even if scheduled maintenance is delayed. Only APPLIED/REJECTED rows older than 30 days whose **current version** has verified backup may expire from D1. Unresolved QUEUED/RUNNING/CHECKING/UNCERTAIN rows never expire. Embedded issuance timestamps prevent old expired submissions from being admitted again. Google copies have a 365-day minimum retention, with manual archive/deletion of completed old generations only after verified restoration evidence; unresolved copies are never age-deleted. No automated Google deletion is implemented.

For switch-back, pause admission and dispatch; retain status/backup access. Wait out active Google calls, export D1 and verify exact current Google backup versions, row counts, payload hashes and outcomes. Reconcile every RUNNING/CHECKING/UNCERTAIN command against its exact Google `LQ-<SHA256(jobId)>` consent event under the writer lock. A missing event is not proof a delayed request cannot still arrive. Carry unresolved original identities forward and block affected actor/action. Prepare an owner-reviewed reconciliation manifest and a complete Google queue import, compare counts/digests/outcomes, then change routing once. Do not start a blank queue or replay uncertain decisions. Keep paused D1 intact; restore routing if verification/import fails. These are operator gates, not an automatic activation API. Disabling this optional API leaves current direct UI paths available, but never authorises directly replaying a command already queued.

## Offline verification

`TZ=Asia/Singapore node tests/lord-queued-writes.mjs`, `node tests/lord-queue-gateway.mjs`, `node tests/lord-queue-integration.mjs` and `node lord-suite/tests/queued-writes.cjs` exercise real SQLite admission/state transitions, signed session gateway and the real Apps Script preference handler with synthetic Google dependencies. The backend program is included in the LORD runner; top-level Node tests are auto-discovered. Build before the full suite: `npm run build`, then `TZ=Asia/Singapore npm test`. Local browser/history availability and actual full-suite results are recorded in the task; unavailable checks are never counted as passed.
