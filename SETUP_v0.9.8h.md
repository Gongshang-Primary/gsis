# GSiS revision H setup guide

Version 0.9.8h · 27 October 2026 · Singapore time

## Choose the task

| Task | Result |
|---|---|
| Install revision H | Install all 17 matched components. Stapler plans work independently of a baseline; Roster separates publication and communication; OVERLORD adds Background work management. |
| Set `GSIS_SECRET` | Keep your existing working key, including a 33-character value. A new key is optional; valid keys contain at least 32 printable non-whitespace ASCII characters. |
| Prepare D1 and R2 | Check or create storage for a later timetable cache change. This does not activate that change. |

Revision H leaves Roster's timetable cache behaviour unchanged. Keep existing notification settings, triggers, URLs and data authority. The active relief ledger remains on hold.

Before uploading, check `PATCH.json` for revision 0.9.8h, baseline 0.9.8g, the release source commit and all 17 matched components. Verify the archive contents against `SHA256SUMS.txt`. Use the complete source recovery bundle for maintenance, not as a Pages upload. Preserve the existing Google staff identity authority and storage authority settings.

## 1. Prepare for installation

1. Keep the previous deployment files and record the current Apps Script deployment versions for rollback.
2. Keep all existing Script Properties, Cloudflare variables, secrets, bindings and triggers.
3. Use the component list in `INSTALL.md` or `INSTALL.txt` to select the matched revision H files.
4. Keep a working `GSIS_SECRET` unchanged, including an existing 33-character key. If it is absent, install the code with the existing API secrets; adding a shared key is optional. Do not rotate a working key solely for this upgrade.

For each Apps Script update, use the existing project and existing web app deployment. Save the new code, then select **Deploy > Manage deployments > pencil > New version > Deploy**. This keeps the existing web app URL. [Google deployment instructions](https://developers.google.com/apps-script/concepts/deployments)

Upload each inner frontend ZIP to its existing Cloudflare Pages project. Update the existing notification Worker with its matched Worker file. An outer release ZIP is not a Pages site.

### Check the Roster changes

1. Export a Stapler workbook and check **Teacher Summary**, **Class POV**, and source period start and end times above the period headings.
2. As a teacher, open Stapler's confirmed suspended date list and follow a date link to your own Timetable.

Every period grid export places the timing row within the frozen rows. The teacher date list is read only. The existing planning request feature remains available. These changes do not activate Cloudflare timetable caching.

## 2. Choose your shared key

1. Reuse your existing working key. If choosing a new key, use an unpredictable value of at least 32 printable non-whitespace ASCII characters, within the existing platform storage limits, and keep it in the school's password manager. A 33-character value is accepted.
2. Use letters, numbers or ordinary ASCII punctuation; exclude spaces, line breaks and smart quotes.
3. Use the exact same value, including letter case, in every active GSiS component listed below.
4. Enter the key only in the secret or Script Property field; keep it out of source files, this guide, screenshots and chat.

The setting name is **`GSIS_SECRET`**. A label such as `YOUR_SHARED_KEY` is a placeholder, not a key to paste. Values are not trimmed or truncated: spaces, line breaks, smart quotes and other non-ASCII characters are invalid.

One key reduces setup work. If it is exposed, all internal connections must rotate together. It does not replace the Google, Meta or Cloudflare credentials issued by those services.

## 3. Know where the key belongs

| Platform | Active components that need the same `GSIS_SECRET` value |
|---|---|
| Apps Script | Deploy, Roster, Contacts, Calendar, Venues and LORD backend projects |
| Cloudflare Pages | Deploy, Roster, Contacts, Calendar, Layout, Venues, LORD, OVERLORD and STARLORD projects |
| Cloudflare Worker | The existing `gsis-roster-notifications` Worker |
| Optional existing Worker | `gsis-operations`, only if it is already in use; do not activate it for this setup |

Use the projects that are actually deployed. One Apps Script project needs one property even when several viewports call it. Script Properties are separate for each Apps Script project; setting one does not update the others. [Google Properties Service](https://developers.google.com/apps-script/guides/properties)

Retain these separate credentials and their current values:

| Purpose | Examples to retain |
|---|---|
| Existing browser sessions | `BRIDGE_SECRET`, `CALENDAR_SESSION_SECRET`, `LORD_SESSION_SECRET`, `VENUES_PROXY_SECRET` where the current app uses them for sessions |
| Private relief links and booking links | `EXTERNAL_LINK_SECRET`, `LORD_BOOKING_TOKEN_PEPPER`, `LORD_BOOKING_CODE_PEPPER` and any existing previous key |
| Google and Cloudflare sign in | OAuth client settings, Access settings and service credentials |
| WhatsApp and other providers | Meta access token, app secret, webhook verification token and Telegram credentials |

Do not delete old per connection secrets during this upgrade. They provide the rollback path. `GSIS_SECRET` replaces their internal API role when configured; some old settings also have a separate session or link role.

## 4. Add the key in Apps Script

This key cutover is optional after installation and is unnecessary when your current key already works. Revision H can run with the existing secrets while you prepare. Complete a normal read check of the updated code before starting the cutover.

### Before changing any key

1. Choose a maintenance window when staff can pause changes and manual notification sends.
2. Open **Workers & Pages > gsis-roster-notifications > Settings > Triggers > Cron Triggers**, or **Trigger Events** if shown.
3. Record the exact existing cron expressions, then use the three dot menu to temporarily delete the minute trigger.
4. Record and temporarily remove any other scheduled trigger that is due during the cutover window.
5. In Apps Script, open **Triggers**, record the function and schedule of any running GSiS reference or sync trigger, and temporarily remove only those relevant callers.
6. Allow up to 15 minutes for Cloudflare trigger changes to propagate, then check Worker logs, Apps Script **Executions** and Roster's in progress delivery count.
7. Wait until no affected call or delivery attempt is in progress before changing the key.

Pausing a trigger does not stop a job that has already started. Keep the existing queues and saved work. If you cannot identify the affected scheduled callers, leave `GSIS_SECRET` absent and complete the key cutover later with a walkthrough. [Cloudflare cron controls](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [Google trigger controls](https://developers.google.com/apps-script/guides/triggers/installable)

Now complete these steps for each active backend project in section 3.

1. Open the Apps Script project.
2. Select **Project Settings**, using the gear icon on the left.
3. Find **Script Properties**, then select **Edit script properties** or **Add script property**.
4. Set **Property** to `GSIS_SECRET` and **Value** to your chosen key.
5. Select **Save script properties** and leave every other property unchanged.

Use Script Properties, not a cell in a Google Sheet and not a constant in the code. The code update needs a new deployed version. A property edit changes the project's setting directly. [Google property instructions](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually)

## 5. Add the key in Cloudflare

A component with `GSIS_SECRET` uses it immediately when the new setting is active. Calls can fail while the two ends use different keys. Keep the maintenance pause in place until the read checks below pass.

For each active Pages project:

1. Open Cloudflare and select the account that hosts GSiS.
2. Select **Workers & Pages**, then open the existing Pages project.
3. Select **Settings > Variables and Secrets** and choose **Production** if shown.
4. Select **Add**, set the name to `GSIS_SECRET`, and paste your key into the value field.
5. Select **Encrypt** or the **Secret** type, then save the setting.
6. Redeploy the matched revision H frontend so the production deployment receives the setting.

[Cloudflare Pages secret instructions](https://developers.cloudflare.com/pages/functions/bindings/#secrets)

For the existing notification Worker:

1. Open **Workers & Pages > gsis-roster-notifications > Settings**.
2. Under **Variables and Secrets**, select **Add**.
3. Choose **Secret**, name it `GSIS_SECRET`, and paste the same key.
4. Select **Deploy** and retain all current bindings, triggers and notification settings.

Repeat for the Operations Worker only if it is already active. Configure preview environments separately only if you use them with the same backend. A key stored in one project does not create it in another. [Cloudflare Worker secret instructions](https://developers.cloudflare.com/workers/configuration/secrets/#via-the-dashboard)

### Check the change

1. Confirm that every active backend and caller has the same exact key.
2. Open Contacts, Calendar, Deploy, Layout and Venues and check that their normal reads load.
3. Open Roster and System Health and check the latest current status rather than old failure history.
4. Open LORD, OVERLORD and STARLORD and check that their normal reads load.
5. Keep validation read only; do not submit an absence, booking, allocation or message as a key test.

### Restore the recorded schedules

1. Return to the notification Worker's **Settings > Triggers > Cron Triggers**, or the **Trigger Events** section.
2. Select **Add**, choose a custom cron schedule if needed, and restore each exact expression recorded before the pause.
3. In each affected Apps Script project, select **Triggers > Add Trigger** and restore only the recorded function and schedule.
4. Check the restored trigger count against your record so that no trigger is missing or duplicated.
5. Allow Cloudflare's propagation time, then inspect the next normal processing result without forcing a send or bulk resend.
6. Resume staff changes after the connections and existing schedules are confirmed.

Cloudflare cron expressions use UTC. Restore the original expression rather than converting a Singapore time again. Preserve each Apps Script project's original trigger time zone and frequency.

An absent `GSIS_SECRET` keeps the legacy setting. A configured but empty or invalid value fails closed with `GSIS_SECRET_INVALID`; correct the configuration instead of replacing Google sign-in settings. It does not silently fall back. A valid but different key at one end causes authentication to fail.

### Roll back the shared key

1. Remove `GSIS_SECRET` from every component changed in this cutover, including the Apps Script projects.
2. Save the Apps Script property changes and redeploy the Pages and Worker settings as applicable.
3. Keep the original per connection secrets in place so the legacy connections resume.
4. If code rollback is needed, restore the preserved matched deployments without deleting data or queued work.
5. Confirm legacy reads, then restore the recorded schedules using the preceding steps.

Removing the key from only one side leaves a mismatch. Reverting code does not undo saved records or messages already submitted to a provider.

## 6. Check existing timetable storage

This section prepares storage only. The future target is compressed baseline and confirmed suspended timetable copies from today through 30 days ahead, inclusive. That is **31 Singapore dates**. For example, on 27 October 2026 the window ends on 26 November 2026.

| Storage | Intended future role |
|---|---|
| D1 | Small current file index, source revisions, hashes, dates and freshness metadata |
| Private R2 | Compressed timetable files, with one current selection for each date and timetable type |

Teacher names needed in a timetable may be included. Private contact details, absence reasons, notification contents and SMC draft plans are outside this intended cache contract.

Earlier GSiS versions already define storage bindings. The actual database and bucket names depend on your account and are not supplied in this guide.

1. Open **Workers & Pages > your Roster Pages project > Settings > Bindings**.
2. Under **Production**, record the database selected for `GSIS_JOBS`.
3. Record the bucket selected for `ROSTER_TIMETABLE_SNAPSHOTS`.
4. Open the existing notification Worker and check the same two bindings under **Bindings**, or **Settings > Bindings** if shown.
5. Confirm that both components point to the same existing database and private bucket.
6. Record the current `ROSTER_SNAPSHOT_CACHE` value without changing it.

[Cloudflare Pages binding instructions](https://developers.cloudflare.com/pages/functions/bindings/)

`GSIS_JOBS` may already store notification receipts and System Health records. Do not replace it with an empty database. Keep existing working resources and bindings unchanged.

If a binding is missing, first check **Storage & databases > D1 SQL database** and **R2 object storage** for an existing intended resource. A missing binding does not prove that the database or bucket is missing.

## 7. Create storage only if it is missing

### D1 database

1. In the same Cloudflare account, open **Storage & databases > D1 SQL database**.
2. Select **Create Database** only if no suitable existing GSiS database is present.
3. Use `gsis-timetable-cache` as a suggested name for a new dedicated resource.
4. Leave the optional location at its default unless the school has a defined location requirement.
5. Select **Create** and record the database name and database ID.

[Cloudflare D1 creation instructions](https://developers.cloudflare.com/d1/get-started/#2-create-a-database)

Leave a newly created preparation database empty and unbound. Revision H does not supply a new timetable writer or a new SQL schema. Do not import the Roster store or change any authority flag to `d1`.

### Private R2 bucket

1. Open **R2 object storage** in the same Cloudflare account.
2. Select **Create bucket** only if no suitable existing private timetable bucket is present.
3. Use `gsis-timetable-cache` as a suggested bucket name and choose **Standard** storage.
4. Leave location at **Automatic** unless the school has a defined location requirement, then select **Create bucket**.
5. Open the bucket's **Settings** and confirm that the **Public Development URL** or `r2.dev` access is disabled.
6. Leave public custom domains unconfigured and record the bucket name.

[Cloudflare R2 creation instructions](https://developers.cloudflare.com/r2/get-started/workers-api/#1-create-a-bucket) · [R2 public access](https://developers.cloudflare.com/r2/buckets/public-buckets/)

Leave a new bucket empty and unbound for now. Attaching a resource to live Roster while an old cache flag is enabled can activate existing behaviour. Existing cache code can include planner scoped data and is not the same as the narrower confirmed timetable target above.

## 8. Stop at storage preparation

Preparation is complete when you have recorded the intended D1 database and private R2 bucket, or confirmed that both already exist. An empty new resource is expected at this stage.

| Prepare now | Leave for the later cache change |
|---|---|
| Record or create the storage resources | Define the confirmed timetable schema and sync writer |
| Check existing bindings without replacing them | Connect new resources and activate a cache path |
| Keep public bucket access disabled | Populate and verify the 31 date window |
| Keep current Roster behaviour and triggers | Add source change updates and date window maintenance |

Storage does not update itself. The later writer should update only changed timetable parts after successful source saves, add the new farthest date as the window advances, and remove expired dates. It should not rebuild the whole Roster every minute.

For safe replacement, the intended design writes the new compressed object first, updates the current D1 pointer, then prunes unreferenced objects after a short recovery period. “Single working copy” means one current selection, not deleting a working file before its replacement is ready.

Do not add a blanket “delete after 30 days” R2 lifecycle rule to a shared bucket. Object age is not the timetable date, and lifecycle deletion is not immediate. Date based pruning belongs to the later cache writer and cleanup design. No new Operations Worker, Queue, cron trigger, public bucket URL or R2 API token is needed for this preparation. [R2 lifecycle behaviour](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## Use revision H

### Independent Stapler timetables

1. Open Stapler > suspension dates and choose **Create blank standalone plan**. No baseline upload is needed. Set a valid period timing structure and add teachers verified against Contacts and the classes needed for that date.
2. Edit the dated plan, including Card Pit, mats, recess and annotations. Save and review its structural and staff identity checks, then confirm it when ready.
3. Treat the confirmed dated plan as the authority. Uploading, replacing or removing a baseline changes comparison information only; it must not move cards, change timings or revoke confirmation. Unmatched comparison periods or identities are information to review, not a reason to restart the confirmed plan.
4. Teacher views, absence reporting, candidate selection, allocation and exports use the confirmed plan even without a matching current baseline. Confirm a deliberate change to the dated plan through the normal workflow.

Stapler export does not require a new source upload or network reference for a standalone plan. With a compatible baseline, Teacher Summary retains the weekly summary for the selected parity. If the baseline is absent, unavailable or incompatible, Teacher Summary and Class POV cover the selected date using the plan's own periods and timings. The export does not invent other weekdays or times.

### Native import and reset archive recovery

Choose **Import JSON** in the planner for native plan backups. It retains IDs, Card Pit, mats, recess and other native structure instead of converting the plan into a plain grid. An imported file's claimed confirmation is not a server-verified confirmation. The import is a local unconfirmed draft. Review it, choose **Save to online**, then **Confirm** through the application.

If the online timetable changed after native import, review Review native timetable replacement. Compare Keep imported draft with Use current online timetable, record the reviewed choice with Keep choice locally, then use Save manually. Import never silently replaces a newer online plan.

For a reset plan, an authorised SMC or administrator can open **Reset history** from the dates screen, choose the archived plan, and run **Preview recovery**. Review the selected date, archived contents and current state before selecting **Restore archived timetable** and applying the restore. Preview checks the expected plan versions. Restore backs up the current plan, checks again for concurrent changes and records a receipt and audit. If another edit has occurred, refresh and preview again. Restoring unchanged server-verified confirmed content preserves its original confirmation; an already restored plan is handled without blindly overwriting newer work. Existing deleted-plan restoration remains available separately. This is plan recovery, not a rollback of all Operations data.

A ready preview is not a successful restore. The reported live incident preview was ready; successful live restoration has not been confirmed. Verify the actual restore receipt and dated plan before recording recovery as complete. No private recovery plan or incident payload is included in this release.

### Publish and communicate separately

**Publish / Let teachers see** changes teacher visibility of saved work. Pending cover, unresolved reports, availability and workload warnings may remain for SMC review without blocking publication. Normal authorisation, privacy, structural checks and stale-write protection still apply. Publishing does not allocate staff or send notifications automatically.

SMC may send the approved WhatsApp notification independently of publication. Sending an unpublished plan does not publish it. Its private link shows only that recipient's specifically communicated snapshot, not later SMC drafts or anyone else's duties. Ordinary teacher access continues to follow publication. Provider acceptance means the provider accepted the submission; it is not proof of delivery. Keep the original request identity when resolving an uncertain send and inspect its evidence before considering any retry. Do not send a live message simply to test the installation. User-facing absence update times use Singapore dates and times; audit timestamps remain UTC.

### UT automatic capacity and manual choices

Automatic allocation treats the configured UT weekly time cap (currently 26 period units) as a hard limit, including confirmed suspended days. It uses the effective weekly timetable and relief accounting in the existing employment cap units. A UT teacher whose remaining capacity cannot be verified is excluded from automatic selection. SMC can make a manual choice above the UT cap after reviewing the visible warning; the override is audited. Other employment and time eligibility checks remain.

### OVERLORD Background work

In OVERLORD, an administrator can choose **System settings > Manage background work** or **Manage background work** in the maintenance notice. The **Background work** dialog opens with **Needs attention** selected; **All work and reviewed receipts** shows the wider history. Review the recipient, notification kind, related booking, Singapore timestamps, safe error and evidence status before selecting an action.

| Evidence or task state | Management action |
|---|---|
| Waiting or confirmed recoverable failure | Preview an eligible retry. |
| Unsent notification | Preview cancellation. |
| Unknown send outcome | Review and retire without resending. Preserve the unknown outcome and provider evidence. |
| Expired reminder | Preview retirement. |
| Active send or provider-accepted message | No ordinary retry. Acceptance is not delivery. |
| Historical warning | Acknowledge separately. |

Select 1 to 20 recipient rows and choose Inspect evidence and actions. Choose Retry recoverable work, Cancel unsent notification, or Review and retire without resend as appropriate. Use Preview selected, review the concrete changes, then Apply reviewed action. For a grouped task, recipients are handled individually: retiring one unknown recipient must not cancel the others. The preview states whether remaining recipients resume. Stale selections return individual results; refresh and review those items again. Retirement stops future attempts and cannot recall an already submitted message. **Reviewed**, **retired** and **accepted** do not mean **delivered**. Booking, custody and audit repair work is outside notification cancellation. An expired lease or interrupted email send remains an unknown outcome, not permission to resend.

If a response is uncertain, use Recover last command to retain the exact original command. To acknowledge an earlier warning, select "I have reviewed the earlier failure and its outcome." before Acknowledge historical warning. Acknowledgement is separate from retry, cancellation or retirement.

## Completion record

| Item | Record privately |
|---|---|
| Revision H installed | Component deployment versions, without secret values |
| Shared key saved | Password manager entry name, without copying the key here |
| D1 selected | Database name and ID |
| R2 selected | Private bucket name |
| Existing cache flag | Current value, left unchanged |
| Storage phase | Existing resources verified, or new resources created and left unbound |

The detailed storage and platform instructions retain the revision G setup references. Dashboard labels may vary. This guide describes user setup steps; preparing the release does not deploy code, change production settings or send messages.
