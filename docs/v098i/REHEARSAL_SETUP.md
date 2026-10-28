# GSiS 0.9.8i isolated roster rehearsal

This is a separate **simulation-only** Worker named `gsis-roster-rehearsal`. It uses a new D1 database and new private R2 bucket in the same Cloudflare account. Production Google routing stays authoritative. No production deployment or binding is changed by these instructions.

The package is ready for operator provisioning; **it has not been deployed or verified against live Cloudflare storage**. Cloudflare sign-in blocked live resource creation during this release session. Automated checks execute the shipped SQL in real local SQLite and use an explicit R2 mock. Wrangler and Miniflare were unavailable locally. Those checks do not establish Cloudflare account access, bucket privacy, deployment readiness or real school Google sign-in.

The rehearsal supports a fixed synthetic school day, shared production absence/manual/automatic rules, private immutable gzip timetable writes and reads, request retries, stale revision refusal, a bounded synthetic snapshot interchange and simulated notification intents. It does **not** import a school's raw native operational document, migrate production data, activate a production authority, run cron/Queues, send notifications or write Google files. A future production handover requires a separate verified migration, in-flight receipt/job reconciliation and intake buffer; none is shipped here.

## 1. Extract the separate package

Extract `GSiS_v0.9.8i_Rehearsal.zip` into a new empty folder on your computer. It contains `worker.mjs`, `schema.sql`, `wrangler.example.toml`, `setup-rehearsal.py`, this guide, `SNAPSHOT_SCHEMA.md` and `MANIFEST.json`. Do not place it inside any production Worker installation folder. The manifest marks `productionInstallation: false` and records each included file's SHA256.

From the source recovery tree, the equivalent build is:

```sh
python3 scripts/build-rehearsal-worker.py
python3 scripts/build-rehearsal-worker.py --zip /absolute/output/GSiS_v0.9.8i_Rehearsal.zip
```

The build imports only the pure shared `roster-operations.js`, `roster-allocation.js` and `roster-stapler.js` models. Operations also contains a Node-only crypto fallback for native recovery, which this rehearsal does not expose. The rehearsal builder substitutes a fail-closed unsupported-native-recovery module for that fallback; ordinary domain rules are unchanged. The resulting `worker.mjs` is self-contained; production files and Node compatibility flags are unnecessary on the server.

## 2. Dashboard setup: no command line required

Use this path if you are installing from Cloudflare's web dashboard. The optional CLI helper below automates the same isolated setup.

1. Sign in to Cloudflare in your browser and select the intended account. If the sign-in page blocks access, stop: no live setup is complete.
2. Open **Workers & Pages → Create application → Create Worker**. Choose the exact new name `gsis-roster-rehearsal`. Do not open or replace a production Worker. Create the initial Worker, open **Edit code**, replace its sample code with the entire extracted `worker.mjs`, and save/deploy. Until storage and identity configuration is complete, requests deliberately fail closed with configuration errors. Record its exact URL, `https://gsis-roster-rehearsal.YOUR-SUBDOMAIN.workers.dev`.
3. Choose one new lowercase instance ID, 8–64 letters/digits/hyphens, such as `rehearsal-20261027-your-school-01`. Use your own unique label consistently below. Open **Storage & databases → D1 → Create database**. Create a new database named `gsis-roster-rehearsal-ledger-YOUR-UNIQUE-LABEL`. Do not select an existing database. Open the new database's SQL console. Run the complete extracted `schema.sql`, then these two statements after replacing both `INSTANCE-ID` values with your chosen ID:

   ```sql
   INSERT INTO rehearsal_meta VALUES (1,'gsis.rehearsal.ledger',1,'INSTANCE-ID','simulation-only');
   INSERT INTO rehearsal_ledger (singleton,instance_id) VALUES (1,'INSTANCE-ID');
   ```

4. Open **R2 object storage → Create bucket**. Create a new bucket named `gsis-roster-rehearsal-timetables-YOUR-UNIQUE-LABEL`. Keep its Public Development URL disabled and attach no custom domain or event notification. Create a local `marker.json` containing the following, replace `INSTANCE-ID`, and upload it under the object key `rehearsal/INSTANCE-ID/marker.json` in this new bucket. If the upload dialog has a folder/prefix field, set `rehearsal/INSTANCE-ID/` and upload `marker.json` there:

   ```json
   {"schema":"gsis.rehearsal.bucket","version":1,"instanceId":"INSTANCE-ID","mode":"simulation-only"}
   ```

5. Open **the new rehearsal Worker → Settings → Bindings**. Add one D1 binding named `REHEARSAL_LEDGER` pointing only to the new database and one R2 binding named `REHEARSAL_TIMETABLES` pointing only to the new private bucket. Add no services, Queues, cron triggers, production routes or other bindings.
6. Use the existing public Roster Google web client ID if your school Google administrator permits it, or create a separate web client. In that client's Google Cloud Console **Authorized JavaScript origins**, add the exact rehearsal HTTPS origin. A public client ID is not a secret and provides no Google write capability. Do not copy backend secrets, service-account keys, production API URLs or provider credentials. Select 1–20 explicitly permitted school administrator emails.
7. In **the new rehearsal Worker → Settings → Variables and secrets**, add the six plain-text variables from the configuration table in section 5: `REHEARSAL_MODE`, `REHEARSAL_INSTANCE_ID`, `REHEARSAL_ORIGIN`, `REHEARSAL_GOOGLE_CLIENT_ID`, `REHEARSAL_SCHOOL_DOMAIN`, `REHEARSAL_ADMIN_EMAILS`. Values must match the chosen instance and school client/domain. Do not copy any production environment variables; extra variables/bindings are refused. Save/deploy this new Worker.
8. Follow section 7's entire synthetic persistence exercise. Sign-in, marker presence or an initial successful page load alone does not prove writes. Require the final verified readback of an actual receipt, simulated outbox and gzip timetable. Do not mark the instance live-verified until that exercise passes.

Cloudflare dashboard labels can vary. The required resources, exact binding names, marker objects and SQL above are the configuration contract. If an account feature is unavailable, use the official CLI path below after resolving sign-in; never bind an existing production resource as a substitute.

## 3. Optional CLI: sign in to the intended Cloudflare account

Install current official Node.js, Python 3 and the official Cloudflare Wrangler CLI using Cloudflare's installation instructions. This package does not install tools automatically. Run:

```sh
wrangler login
wrangler whoami
```

Check the account shown is the intended account. If sign-in is blocked, stop here. Nothing has been provisioned or deployed by this package. A browser sign-in wall is not evidence that resources exist.

Find your account's Workers subdomain in Cloudflare **Workers & Pages**. Reserve this exact Worker origin:

```text
https://gsis-roster-rehearsal.YOUR-SUBDOMAIN.workers.dev
```

Use the existing public Roster web Google OAuth client ID if permitted by your school administrator, or use a dedicated rehearsal web client. In Google Cloud Console, enable the school organization's permitted Google Identity Services sign-in and add that exact HTTPS origin to the web client's **Authorized JavaScript origins**. Do not add production API endpoints, service-account keys, Google write scopes or provider credentials. The client ID is public configuration; this Worker requires no client secret. Decide which school administrators, at most 20, may operate this rehearsal.

## 4. Optional CLI: review and create the offline resource plan

In the extracted package folder, run:

```sh
python3 setup-rehearsal.py
```

This only prints a plan. It does not create files or contact Cloudflare. The plan uses fresh random rehearsal resource names; a later invocation creates a different fresh instance. The Worker name remains `gsis-roster-rehearsal`.

### Create exactly two new storage resources

Replace the example identity settings and run:

```sh
python3 setup-rehearsal.py --create \
  --output-dir rehearsal-deployment \
  --origin https://gsis-roster-rehearsal.YOUR-SUBDOMAIN.workers.dev \
  --client-id YOUR-WEB-CLIENT.apps.googleusercontent.com \
  --school-domain YOUR-SCHOOL-DOMAIN \
  --admin-emails FIRST-ADMIN@YOUR-SCHOOL-DOMAIN,SECOND-ADMIN@YOUR-SCHOOL-DOMAIN
```

From the source tree, use `python3 scripts/setup-rehearsal.py` with the same arguments after building. An alternative installed Wrangler executable can be supplied with `--wrangler /absolute/path/to/wrangler`.

The helper refuses an existing output folder. It creates one new D1 database and one new R2 bucket with randomly suffixed `gsis-roster-rehearsal-…` names. Every Wrangler call uses the new dedicated config. It refuses schema writes unless the just-created D1 database has no application tables. It initializes only the `rehearsal_*` schema, writes a matching instance marker to each store and records resource identities in `provisioning.json`. It never edits a production config, chooses existing resource IDs, deletes resources, installs secrets or deploys a Worker.

If any step fails, retain `provisioning.json` and the local error file. Some new empty rehearsal resources may already exist. The helper deliberately does not reuse or delete them automatically. Inspect those specifically named resources in Cloudflare; a fresh attempt must use another new output folder. Do not substitute an existing production database or bucket to get past an error.

## 5. Check privacy and the generated bindings

In Cloudflare R2, open the newly named bucket. Confirm **Public Development URL is disabled**, no public custom domain is attached, and no event notifications, lifecycle deletion or production integration is configured. Keep it private.

Open `rehearsal-deployment/wrangler.toml`. It must name only:

| Binding/config | Expected value |
| --- | --- |
| Worker | `gsis-roster-rehearsal` |
| `REHEARSAL_LEDGER` | The newly created rehearsal D1 UUID |
| `REHEARSAL_TIMETABLES` | The newly created private rehearsal R2 bucket |
| `REHEARSAL_MODE` | `simulation-only` |
| `REHEARSAL_INSTANCE_ID` | The new instance recorded in `provisioning.json` |
| `REHEARSAL_ORIGIN` | The exact dedicated HTTPS workers.dev origin |
| `REHEARSAL_GOOGLE_CLIENT_ID` | The rehearsal web client's Google client ID |
| `REHEARSAL_SCHOOL_DOMAIN` | The school hosted domain verified in the ID token |
| `REHEARSAL_ADMIN_EMAILS` | Explicit comma-separated school operator emails |

There are no cron triggers, Queue bindings, service bindings, production URLs or provider credentials. The Worker rejects **every extra environment variable/binding**, missing configuration, mismatched instance/schema markers and unauthenticated private reads. Never copy the production environment into it. Bucket markers establish instance identity; the operator must separately confirm the actual Cloudflare privacy settings above.

## 6. Deploy only the separate Worker

```sh
wrangler deploy --config rehearsal-deployment/wrangler.toml
```

Do not deploy from a production folder. Do not add a production route or custom domain. Deploy only this new named Worker. If a Worker already exists with this exact name, inspect it and its config before intentionally updating it; the provisioning helper does not deploy or overwrite it.

Open the configured rehearsal URL. The public page is a sign-in shell. Server-side authentication verifies Google's RS256 signature, issuer, client audience, token expiry, verified school email and hosted domain, then checks the explicit operator allowlist. The browser supplies no role flag. The Google ID token stays in browser memory; a page reload requires sign-in again. Tokens expire normally; sign in again when a token is refused.

## 7. Run the synthetic persistence exercise

1. Sign in with an allowlisted school administrator. Verify an unlisted school account is refused.
2. Click **Create sample day**. This writes an actual isolated D1 revision/receipt/outbox transaction and a gzip R2 timetable. The four teachers are synthetic Alice, Bob, Charlie and Dora. The baseline has eight periods, EL/MA lessons and adjacent FORM P5/P6. FORM=2 is explicitly configured in the synthetic seed; PAL=3 remains configured too. Synthetic annual accounting is pre-verified; it is not school history.
3. Report Alice absent for `2,3,4,5,6`. Select P2 only and manually assign Bob. Click **Run shared automatic allocator**. Check all five demands are covered, the manual decision remains, and the complete FORM block shares one reliever under the configured rule.
4. Click **Read timetable from R2**. Change a synthetic room value, click **Save immutable gzip version**, then read again. The new object is stored before the D1 pointer commits; the SHA256 of bounded decompressed content is verified on read.
5. Click **Retry exact last write**. The original durable receipt returns with `replayed: true`, without another revision or simulated outbox row. If a response is lost, retry this exact identity, body and expected revision. A changed body with a reused ID is refused.
6. Click **Demonstrate stale revision refusal**. The server must return `STALE_REVISION` without modifying D1. Refresh the ledger before another normal write.
7. Click **Record simulated notification intent**. Read the state: every intent is `simulated`, with delivery `never-sent`. There is no delivery implementation.
8. Export the supported snapshot. Import it back using the UI's current revision, then export again. The supported dataset and journal should match exactly. Read the versioned schema guide before editing an export; unknown fields and raw native state are refused.
9. Click **Verify storage readback**. Require `persistenceProof.verified: true`. The check rereads the committed D1 revision, matching receipt, simulated outbox and timetable-version pointer, fetches the private R2 object, bounds gzip decompression and verifies its SHA256/schema. Before the first write it deliberately reports persistence as unproved.

Only after these live actions succeed may you record this **rehearsal instance** as live-storage verified. They establish neither production migration readiness nor production activation authority. For independent evidence, retain the health JSON and compare `revision`/`requestId` against the named rehearsal D1 tables in Cloudflare.

## Bounds, retries and retention

Requests and stored ledger documents are limited to 512 KiB. A timetable, compressed or decompressed, is limited to 64 KiB. A supported journal contains at most 100 commands, with four fixed synthetic identities and eight periods. An instance retains at most 1,000 command receipts and 500 simulated intents; the smaller applicable bound stops further writes. State reads show the latest 100 intents and say so. There is no scheduled work or automatic deletion.

D1 `batch` commits the guarded revision update, receipt, simulated outbox and timetable version together. Concurrent writes at one revision have one winner. An R2 object created by a losing write or a failed D1 transaction may remain as an unreferenced immutable object. It cannot become the visible timetable without a successful matching D1 commit. Such objects are intentionally retained; no aggressive cleanup is shipped. Export your supported journal and provision a fresh isolated instance when a bound is reached.

## Manual provisioning fallback

Prefer the bounded helper. If Wrangler output formats prevent it from completing, use only the new resource names recorded in `provisioning.json`. In a fresh separate config, create **new** resources with `wrangler d1 create NEW-REHEARSAL-NAME --update-config=false` and `wrangler r2 bucket create NEW-REHEARSAL-BUCKET`, then copy their new IDs into the example config. Verify the D1 database has no application tables before importing `schema.sql`; do not use `IF NOT EXISTS` to merge schemas. Insert exactly one `rehearsal_meta` row and one `rehearsal_ledger` row with the same newly chosen lowercase `REHEARSAL_INSTANCE_ID`. The marker object key is `rehearsal/INSTANCE-ID/marker.json`, with this JSON:

```json
{"schema":"gsis.rehearsal.bucket","version":1,"instanceId":"INSTANCE-ID","mode":"simulation-only"}
```

The SQL initialization rows are:

```sql
INSERT INTO rehearsal_meta VALUES (1,'gsis.rehearsal.ledger',1,'INSTANCE-ID','simulation-only');
INSERT INTO rehearsal_ledger (singleton,instance_id) VALUES (1,'INSTANCE-ID');
```

Upload that JSON only to the new private bucket using `wrangler r2 object put NEW-REHEARSAL-BUCKET/rehearsal/INSTANCE-ID/marker.json --remote --file marker.json --content-type application/json --config NEW-CONFIG`. Follow privacy checks, deploy and the full exercise above. Matching markers are required; a missing marker fails closed without initializing an arbitrary bound store.

## Verification scope and source references

Run `node --test tests/roster098i-rehearsal.mjs` from the source tree. It uses signed synthetic Google JWTs and a stub of Google's key endpoint, real Node SQLite executing the shipped SQL, and a mocked R2 API. It exercises command behavior, gzip/version checks, atomic rollback, races, exact retries, stale revisions, snapshot replay, authentication and binding refusal. It is not a real Cloudflare D1/R2 emulator or a live Google sign-in test. See `.superpowers/098i-rehearsal-report.md` for the recorded release-session results.

Official references: [Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 Wrangler commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/), [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), and [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
