# GSiS v0.8.4: setup and maintenance

This v0.8.4 guide retains the v0.8.3 setup and service behavior unless a change is stated below. Packaging is not evidence of live installation, current Meta approval or message delivery.

## Changes to Roster in v0.8.4

Active mapped eligible teachers see confirmed suspension dates from today onward, ordered soonest first, without sponsorship or membership of the plan. A legacy confirmation can make a date visible even when no safe frozen preview survives. Such a row has no preview button and does not reveal the current private draft or its metadata. Frozen confirmed and published previews retain their existing privacy rules. The helper says: "To view the published timetable, select Timetable from the main screen." Account-access problems, read failures and a verified empty list have distinct messages.

Report Absence retains local input, selected periods, instruction text and the text caret while dated information refreshes. Date checks leave the controls responsive, but submission waits for verified data. The effective suspended timetable and recurring baseline are prepared separately for the selected report. Current attendance, saved instructions and permissions remain online checks.

Own arrangements remains beside No relief instructions and works with or without text. A new absence or changed instructions starts its exact save and immediately opens a cancellable pending dialog. Period and colleague selection becomes available after confirmed save. The mobile chooser has visible period buttons, searchable colleagues, cover or Combine choices and retained selection chips. Only Submit requests creates colleague requests. Closing the pending dialog prevents a late save response from reopening it. An uncertain save retains its original receipt recovery.

Compatible clients use bounded RAM snapshots for timetable data; operational records remain current online reads. Changed saved instruction cells use original/current comparison and can merge unrelated edits. System Config adds consecutive subject blocks, default PAL for three periods. See the current API and performance documents for precise limits.

The remaining sections describe retained suite behavior and setup.

This guide is for the person who installs and maintains GSiS. The Deploy user manual explains the screens used by school planners. The separate WhatsApp activation guide explains how to turn messaging on. Installing code does not turn messages on or publish a school timetable.

Use the **existing installation** path if the school already uses GSiS. Use the **blank installation** path only for a separate new instance. Do not mix these paths.

## 1. Understand the parts

| Part | What it does | Where its authoritative data lives |
| --- | --- | --- |
| Contacts | Staff identity, contact details, role membership and application access | Contacts Google workbook |
| Deploy | Planning versions, teaching deployment, workloads, relief quota R and venue allocations | Deploy Google workbook |
| Layout | Public campus and venue view; controlled unit editing | Deploy publication and venue register |
| Calendar | School calendar, year structure, event publishing and verified school dates | Calendar Google workbook, with explicit sync to staff/parent Google calendars |
| Roster | Baseline timetables, absences, relief, Stapler plans, accounting and acknowledgements | Original Roster Drive folders, owned by the standalone Roster Apps Script project |
| Notification Worker | Runs scheduled service calls and dispatches eligible notices and Inbox replies | It calls the Roster backend; relief notices and Inbox records use their respective private stores |

There are five Pages websites and four Apps Script backends: Contacts, Calendar, Deploy with Layout, and Roster. Roster has a separate project and owns its original operational files. Layout remains with Deploy. The split does not require new Sheets or replacement data stores.

Each Pages ZIP includes its static files and a complete `_worker.js` at the ZIP root. This Worker checks identity and forwards signed requests. The separate notification Worker has a minute timer and no normal website. Its browser response can be 404 while its timer works correctly.

### Terms used in this guide

| Term | Meaning |
| --- | --- |
| Source package | Editable application files, tests and build scripts; not the file to upload to Pages |
| Frontend ZIP | One complete prebuilt Pages website |
| Apps Script deployment | A published version of Google code with a stable URL ending in `/exec` |
| Script Property | Private project configuration in Apps Script Project Settings |
| Cloudflare variable | Configuration attached to one Pages project or Worker |
| Secret | A private credential, stored as an encrypted Cloudflare secret or a private Script Property |
| Local draft | Changes on the current device, not yet accepted by Save to online |
| Online draft | Saved planning data that has not been released with Let teachers see |
| In force | The published Deploy version or baseline valid for the selected date |
| Receipt | A stored record that lets the server recognise a retry of the same save |

## 2. Keep a private installation record

Record the four Apps Script project links, their deployment IDs and `/exec` URLs, their executing account, all workbook IDs, Roster folder IDs, the venue register ID, five Pages project names/domains, Google OAuth client ID and the notification Worker name. Record where secret values are held, not the secret values in this document.

Use a maintained school helper account with access to the workbooks, Shared Drive folders and calendars. A Shared Drive owning files does not replace the Apps Script executing account's access. Staff sign in with their own school accounts; the helper account does not need SMC membership solely to run diagnostics.

Keep an inventory of which Admin and KP access records are active. Contacts application roles and Contacts staff role memberships are separate. SMC membership is a directory role group. Admin is not automatically SMC. Calendar has its own Users sheet and permissions.

## 3. Update an existing installation

Extract `GSiS_v0.8.4_Deployment.zip` first. It is the outer delivery package, not a Pages upload. Use each enclosed `*_Frontend_v0.8.4.zip` for its matching Pages project; the source ZIP is also not a Pages upload.

Follow [Move Roster to its own Apps Script backend](ROSTER_BACKEND_CUTOVER_v0.8.4.md) before normal use. Prepare the new Roster project disabled, retaining the original data IDs and properties. Install guarded Deploy, disable every historical unguarded Roster deployment and old Roster trigger, then drain executions. Only then enable the new owner and route Roster Pages plus the notification Worker to it. Contacts, Calendar and Deploy/Layout keep their existing projects.

Install all five matching frontend ZIPs and the complete notification Worker. Keep school sign-in, private media binding and intended operational flags. Current Roster saves still use one operations document; the split separates its ScriptLock/execution from Deploy and preserves the published Deploy read dependency.

Open retained saved records and compare their dates, revisions, tiles and blanks before editing. A failed read does not authorise deletion, reset or reimport. Run Roster diagnostics in the new Roster project after cutover, retaining diagnostic IDs and timestamps. Existing cached diagnostics may belong to the old project; absence of cached history does not prove success.

Paste each complete backend into its matching project without duplicate modular definitions. Do not alter the fixed backend kind or run blank setup over school data. Refresh old browser tabs after routing changes and keep exact uncertain requests for receipt recovery.

### Apps Script projects and manifests

The full package contains these four backend files. Install the matching v0.8.4 services before the frontend and separate Worker updates; retain each project's own manifest and data.

| Project | Complete code | Services used | Important authorisation |
| --- | --- | --- | --- |
| Contacts | `Contacts_Backend_v0.8.4.gs` | Advanced Sheets API v4 | Spreadsheet access and external requests for its optional Deploy connection |
| Deploy and Layout | `Deploy_Backend_v0.8.4.gs` | Advanced Sheets API v4 and Drive API v3 | Existing Deploy/venue permissions |
| Roster | `Roster_Backend_v0.8.4.gs` | Advanced Sheets API v4 and Drive API v3 | Original Roster files, published Deploy reads, external requests, user email and send mail |
| Calendar | `Calendar_Backend_v0.8.4.gs` | Advanced Sheets API v4 and Calendar API v3 | Spreadsheet, Calendar, Drive and user identity access used by its bound project |

The shared Deploy/Roster manifest is `appsscript.json` in the deployment archive, or `backend/appsscript.json` inside the source archive. The email reporting feature needs `https://www.googleapis.com/auth/script.send_mail`. Save that scope, run `authoriseRosterMail()` in the Roster editor as the deployment helper account and complete Google’s permission prompt, then publish a new Roster deployment version after the owner gate is configured. Keep `https://www.googleapis.com/auth/userinfo.email`; removing it can break editor identity diagnostics. The helper checks remaining email quota and sends nothing. Adding a scope to the editor alone does not update already published code.

For Calendar, retain the complete existing manifest. `calendar-backend/appsscript.sheets-service.fragment.json` is a services fragment, not a complete replacement manifest. If an explicit scope list is used, it must cover the services the installed Calendar code invokes. A blank project can let Apps Script infer the required scopes before its first authorisation. Do not copy Deploy's manifest over Calendar's manifest.

Web apps execute as the deploying school account and use the access setting that permits the gateway's server requests. The application validates a signed envelope or proxy secret before serving protected actions. A Google account sign-in wall in front of `/exec` prevents the Cloudflare gateway from receiving JSON. Do not remove the application's signature or identity checks to work around it.

## 4. Create a separate blank installation

A blank installation creates empty operational stores. It does not recreate the school's staff, classes, venues, calendars or historical R entitlement automatically. The school must supply and verify them. Keep the old instance available until the new one passes acceptance checks. This package still enforces GSPS school identities and includes GSPS defaults. These instructions create a separate GSPS instance; another school's domain requires a reviewed code and configuration change before use.

### 4.1 Create the resources

1. Create a Contacts workbook, a Deploy workbook and a Calendar workbook under the intended school account or Shared Drive.
2. Create a venue register workbook with a `Venues` tab and the exact columns in the schema reference.
3. Create a Roster root folder with separate `Previous Timetables` and `Operational Data` folders.
4. Give the deployment helper account the required edit access to these workbooks and folders.
5. Create or choose separate staff and parent Google calendars if Calendar sync will be used.
6. Create separate Apps Script projects for Contacts, Deploy and Roster, and a project bound to the new Calendar workbook.

The Calendar project must be opened from the Calendar workbook with **Extensions > Apps Script**. Its code uses `getActiveSpreadsheet()`. Contacts, Deploy and the Roster published-source reader use explicit configured workbook IDs instead.

### 4.2 Configure and initialise Contacts

1. Paste the complete Contacts backend and enable Advanced Sheets API v4.
2. Set `CONTACTS_SHEET_ID` to the new Contacts workbook ID and `ADMIN_EMAIL` to the first school Admin's full email address.
3. Run `setupBlankContacts()` only against the new empty workbook.
4. Run `setupGSiS()` to validate the directory structure and retain or create its bridge secret.
5. Run `prepareContactsPerformance410()` to prepare the protected backup required before editing stored contact values.
6. Deploy the project as a web app and record its `/exec` URL.
7. Enter real staff details and the school's role catalogue before using the application for operational decisions.

The blank setup is guarded against a populated workbook. It is not an import or reset function. It creates a minimal Teacher record for the initial Admin, plus the access row. Set optional `ADMIN_NAME` for its display name and complete the real staff details later. The setup does not grant SMC membership or assign a workload. Use permanent unique Staff IDs and keep TTb names and normalised mobile numbers unique.

### 4.3 Configure and initialise Deploy

1. In the new project's Script Properties, set `DEPLOY_SHEET_ID` and all three folder IDs: `ROSTER_ROOT_FOLDER_ID`, `ROSTER_ARCHIVE_FOLDER_ID` and `ROSTER_DATA_FOLDER_ID`. Set this complete group before running any Deploy setup function; the folder check runs when the script initialises.
2. Paste the complete Deploy backend and use its manifest with Sheets v4 and Drive v3 enabled.
3. Set `CONTACTS_API_URL` to Contacts `/exec` and `CONTACTS_BRIDGE_SECRET` to the Contacts bridge secret.
4. Set `LANDMARK_SHEET_ID` to the new venue register workbook ID.
5. Check that the deployment account can edit all four workbooks and the three Roster folders.
6. Run `setupDeploy()` to initialise the empty Deploy index and preserve or create its bridge secret.
7. Run `setupLandmarkDeploy()` to validate the configured venue register.
8. Keep Roster-specific authorisation and setup in the separate Roster project described below; the Deploy artifact rejects Roster operations.
9. Deploy as a web app and set `DEPLOY_WEB_APP_URL` to that deployment's `/exec` URL.

The folder properties must identify folders, not files. A custom `DEPLOY_SHEET_ID` or any one Roster folder override requires all three folder properties. Partial overrides are rejected rather than falling back to the existing school's folders. In a new instance, leave `ROSTER_INDEX_FILE` and `ROSTER_OPERATIONS_FILE` unset; never copy the old instance's file pointers to the new folders. The operational register and operations JSON are created by supported application writes. Do not create empty files with those names or paste `{}` into them. The service expects a specific schema, revision and receipts.

The packaged source retains compatibility defaults for the existing GSPS installation. A new instance must set the workbook and folder overrides explicitly. Never rely on legacy IDs for a new instance.

### Configure the blank Roster owner

Use `Roster_Backend_v0.8.4.gs` in the separate new project. Set its explicit new-instance `DEPLOY_SHEET_ID` for published source reads, all three new-instance Roster folder IDs, Contacts connection and bridge/service secrets. Keep the complete configured group required by shared initialisation. Do not call Deploy setup or recovery functions through the Roster artifact.

For a genuinely blank instance, leave runtime file pointers unset; supported Roster writes create the proper schema. Set `ROSTER_OWNER_SCRIPT_ID` to this project's script ID. Enable `ROSTER_WRITER_ENABLED=true` only when no other project owns these folders. Authorise `authoriseRosterWrites()` and `authoriseRosterMail()` using the maintained account, then deploy. The mail helper checks quota and sends nothing. Set `ROSTER_WEB_APP_URL` to its own `/exec` for diagnostic self-requests. Register Roster triggers only in this project.

The existing-school upgrade is different: it must preserve every original pointer and use the cutover guide. Never apply blank-instance pointer rules to existing data.

### 4.4 Configure and initialise Calendar

1. Paste the complete Calendar backend into the project bound to the new workbook.
2. Enable Advanced Sheets API v4 and Calendar API v3 and set the script timezone to Asia/Singapore.
3. Set a new private `CALENDAR_PROXY_SECRET` in Script Properties.
4. Run `setupCalendarV2Workbook()` and authorise the executing school account.
5. Replace seeded school-specific folder, calendar and source URLs in Settings with this instance's resources.
6. Review the initial Users row and give the intended Calendar Admin access.
7. Create the real school year, terms, weeks and holidays, then release the year to staff when correct.
8. Deploy as a web app and record its `/exec` URL.

Setup creates Calendar tabs and defaults and validates their headers. It also seeds the installing account as Admin. School-specific defaults are starting values, not verified resources for a new instance. Do not run Google Calendar sync until the staff calendar, parent calendar and Shared Drive destination are correct. Calendar year release is needed for verified Roster dates; a calendar-shaped screen alone is not proof of school-day readiness.

### 4.5 Create the five Pages projects

Create five Cloudflare Pages direct-upload projects, one for each matching frontend ZIP. The ZIP must expose `index.html` and `_worker.js` at its root. Upload the individual frontend ZIP, not the outer deployment package. `_worker.js` is supported by dashboard direct upload; a source `functions` folder would require a different build path.

| Pages project | Required basic settings | Backend |
| --- | --- | --- |
| Contacts | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL`, secret `BRIDGE_SECRET` | Contacts `/exec` and Contacts bridge secret |
| Deploy | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL`, secret `BRIDGE_SECRET` | Deploy `/exec` and Deploy bridge secret |
| Layout | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL`, secret `BRIDGE_SECRET` | Deploy `/exec` and Deploy bridge secret |
| Calendar | `GOOGLE_CLIENT_ID`, `CALENDAR_APPS_SCRIPT_URL`, secrets `CALENDAR_PROXY_SECRET` and `CALENDAR_SESSION_SECRET` | Calendar `/exec` |
| Roster | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL`, `CALENDAR_APPS_SCRIPT_URL`, secrets `BRIDGE_SECRET` and `CALENDAR_PROXY_SECRET` | Roster and Calendar `/exec` |

Create or reuse a school Google OAuth web client for Google Identity Services. Add each actual website origin to its authorised JavaScript origins. An origin contains the scheme and host, without a path. Update `shared/viewports.js` and rebuild when using different school domains so navigation points to the correct apps.

Pages settings are per project and per environment. Production and Preview are separate. After changing production variables or secrets, create a new production deployment so the Worker uses them. Use new secrets for an independent instance. Never copy production sending credentials into a test site by accident.

No D1 or KV database is required by the default package. WhatsApp Inbox voice notes and incoming JPEG/PNG images require the private WHATSAPP_INBOX_MEDIA R2 binding; text capture does not require that media bucket. `ASSETS` is supplied by Pages. `LIVE_HUB` is an optional legacy live-update integration; ordinary Deploy operation uses explicit reads and saves without requiring it. The scheduled notification Worker is a separate resource and does not need an ASSETS binding.

Do not put a blanket sign-in wall in front of routes that must be reached externally: the public Layout view, privacy page and images, Meta webhook and token-scoped external relief links. The underlying application checks still apply. Check public access without exposing protected staff APIs or operational files.

### 4.6 Load the school data in order

1. Complete Contacts identities, role memberships and application access.
2. Review Deploy's seeded planning data against the real school before creating the first operational version.
3. Enter the real classes, TGs, subject loads, venues, employment and workload rules in Deploy.
4. Publish the checked Deploy version with its correct validity dates and confirm the in-force R export.
5. Release the corresponding Calendar year and confirm school-day and odd/even-week context.
6. As Admin, upload and preview the baseline timetable, set validity dates and verify its period timings.
7. Match timetable names to Contacts identities and investigate any collision or missing quota.
8. Set the dated SMC duty roster, System Config and daily email report recipients.
9. Existing annual R history is retained. If no data exists, Roster starts the count at zero; a read failure remains an error. Pruning also removes the corresponding counts.
10. Follow the separate WhatsApp activation guide after these checks pass.

Initial Deploy setup creates storage, not a trustworthy school deployment. The packaged seed may contain GSPS planning defaults. Review it before publication. Creating the first version, before an active version exists, requires both Admin and KP application access. Blank Contacts setup grants Admin only: use Contacts access management to give the initial operator the additional KP access before creating that first version. Staff role membership is a separate setting.

## 5. Configuration ownership

| Setting | Owner and meaning |
| --- | --- |
| Contacts `BRIDGE_SECRET` | Contacts Apps Script; matches Contacts Pages and both Deploy/Roster `CONTACTS_BRIDGE_SECRET` values |
| Deploy `BRIDGE_SECRET` | Deploy Apps Script; matches Deploy and Layout Pages |
| Roster `BRIDGE_SECRET` | Roster Apps Script; matches Roster Pages; preserve the current value during cutover |
| `ROSTER_WRITER_ENABLED`, `ROSTER_OWNER_SCRIPT_ID` | Roster-only enabled flag and exact current project script ID; fail closed by default |
| Contacts `DEPLOY_API_URL`, `DEPLOY_BRIDGE_SECRET` | Optional reverse connection for active teaching information; use Deploy's existing URL and secret |
| `ROSTER_SERVICE_SECRET` | Same dedicated value in Contacts Apps Script, Roster Apps Script, Roster Pages and notification Worker |
| `CALENDAR_PROXY_SECRET` | Calendar Apps Script; matches Calendar Pages, Roster Pages and notification Worker |
| `CALENDAR_SESSION_SECRET` | Calendar Pages only; signs its browser session |
| `EXTERNAL_LINK_SECRET` | Roster Pages and notification Worker; signs recipient-specific reusable seven-day timetable links |
| `EXTERNAL_LINK_PREVIOUS_SECRET` | Optional previous signing key in the same two projects during a planned seven-day key-rotation overlap |
| `ROSTER_INDEX_FILE`, `ROSTER_OPERATIONS_FILE`, `ROSTER_INBOX_FILE` | Runtime file pointers in Roster Script Properties; preserve them during updates |
| `ROSTER_STAPLER_LEASE:YYYY-MM-DD` | Retained compatibility metadata for older clients; current local editing and base-plan saves do not require an exclusive lease |
| `WHATSAPP_CURRENT_RELIEF_URL` | Roster Pages only; HTTPS destination for the contact menu Report Absence link, initially `https://roster.diveanalytics.com/` |
| `WHATSAPP_INBOX_MEDIA` | Private R2 bucket binding on Roster Pages only; no public bucket URL |
| `WHATSAPP_INBOX_ALERTS_ENABLED` | Enables optional WhatsApp duty alerts only after the exact dedicated template is approved; not required for in-app alerts |
| `DEPLOY_WEB_APP_URL` | Deploy diagnostic self URL; keep the existing Deploy `/exec` |
| `ROSTER_WEB_APP_URL` | New Roster diagnostic self URL; set to its own `/exec`, never the old Deploy URL |

Keep bridge secrets, service secrets, link secrets and provider tokens distinct. Do not place them in source files or support material. Replacing a session-signing key invalidates existing sessions. For link-key rotation, keep the previous key in `EXTERNAL_LINK_PREVIOUS_SECRET` on both Roster Pages and the notification Worker until its outstanding seven-day links have expired; issue new links only with the current key. Do not rotate working link secrets just to upgrade.

## 6. How reads and writes stay reliable

The full baseline model is immutable by its model ID and can stay in memory and IndexedDB under the signed-in account and permission scope. Current profile/date metadata still decides which model applies. Sign-out or changed authority clears the old scope; blocked or failed browser storage falls back to server reads. Names, timetable views, local filters and highlighting can use this loaded model. The server still validates permissions, current absence state, eligibility, revisions and publication before writes. A cached blank cell does not guarantee that another user has not just assigned that teacher.

Deploy reads exact field ranges and maintained projections. A field save uses a script lock, a durable journal, narrow field updates and an index commit marker. Readers reject an unfinished or changed marker. A retry with the same request ID can return its saved receipt. Contacts uses its own journals and data epochs. Calendar uses mutation IDs and bounded batched changes. These mechanisms are separate, not one cross-service database transaction.

Roster commits accepted absence, assignment, audit and notification intent together in one operational JSON document. Prepared allocation saves do expensive work outside the final script lock, recheck authority and planning inputs, then commit against the latest state. Save to online compares each changed cell's original, local and online values: independent changes can merge; a real same-cell conflict requires explicit local resolution. A repeated request returns its durable receipt, and newer local edits remain local. Baseline upload uses a separate immutable model/register transaction. A timeout does not establish whether a write committed; retain the exact request rather than inventing a replacement. Durable writes still serialize, so the system does not promise unlimited throughput.

Publishing can involve more than one service. Deploy catalogue publication, Contacts updates, Roster writes, email and Meta delivery cannot all succeed or roll back as one atomic operation. Stored receipts, pending markers, outbox states and explicit recovery paths handle those boundaries. Never promise exactly-once delivery across a network failure.

### Local planning, confirmation and publication

Assign Relief and Stapler keep manual edits local until **Save to online**. Navigation and Excel export do not silently save them. Browser draft retention is scoped to the signed-in user and date; if storage is unavailable, keep the page open and use the displayed recovery/export options. An unconfirmed request must be retried with its original identity. Do not discard it merely because a receipt has not yet appeared.

Several authorised planners can edit the same date. Stapler submits the retained base and local plan for comparison with current online data; conflicting edits remain for review. Current clients do not use an exclusive date lease as an editing gate. Retain legacy lease metadata for older-client compatibility and refresh older tabs after deployment.

**Confirm** requires a successfully saved plan. It makes that plan ready for allocation and captures a frozen confirmed preview for active mapped eligible teaching staff on today/future dates, whether or not they have a lesson in that plan. Later saved changes to an already confirmed plan can update allocation inputs; teachers continue to see the earlier frozen Confirmed preview until the next Confirm. They need no sponsorship to view that preview, but editing remains permission controlled. **Let teachers see** separately releases the dated relief arrangements. **Send WhatsApp** sends only eligible changes from that publication.

A successful save or confirmation stores structural validation with the compressed plan, bound to content, date, baseline, saved revision and validation-rule version. Compatible stored plans reopen without rebuilding all baseline cells or quotas. Source, timing and catalogue changes still require appropriate validation. Corrupt storage or mismatched proof remains an error; never reset or overwrite an unreadable plan as a diagnostic step.

SMC Assign Relief choices, clears and No relief required remain protected from automatic allocation. Use **Return to automatic** to release that protection. Published or already-started periods can be edited without a separate audit-approval workflow. Invalid choices are flagged; real availability, structural and employment-cap constraints remain. Changing a historical allocation is not a declaration that the replacement teacher completed the duty.

### Duty and shared-subject settings

Use SMC Duty Roster to create named inclusive date ranges. Activate today changes only the start date; otherwise each list follows its dates. Resolve an overlap by editing or deleting the intended list, not by changing the underlying JSON. Past membership remains available for audit and existing notification checks.

System Config enables shared Form coverage by default. Review the actual baseline venue labels: only a matching subject, period and one known venue can establish a shared lesson. Add further subjects from the catalogue or switch the rule off as required. A present co-teacher receives a draft Combine; if none remains, Auto-allocate fills one vacancy. Individual manual and accepted own-arrangement decisions are preserved. This setting does not publish or send the day.

### WhatsApp Inbox prerequisites

For Inbox, install the matching full v0.8.4 backend, Roster Pages and separate notification Worker. Retain the every-minute cron, school sender credentials and `WHATSAPP_TEMPLATE_ACCOUNT_ID`; bind a private R2 bucket as `WHATSAPP_INBOX_MEDIA` on Roster Pages. Incoming JPEG/PNG images use authenticated viewing, the same private bucket and validated media metadata/bytes. Message rows and local drafts remain usable during refresh; invalid or unavailable media stays visibly unavailable. Ordinary human replies still require the current 24-hour customer-message window; later contact requires a supported approved template.

All SMC/Admin can use the Inbox. Only verified current duty SMC receive new-message alerts, without a fallback to all SMC. Optional WhatsApp alerts require the exact proposed `gsis_inbox_new_message_v1` template in `en_GB` and `WHATSAPP_INBOX_ALERTS_ENABLED=true`; leave the flag unset or false until approval. In-app duty alerts do not require that template. Provider calls in local checks are mocked; verify ingestion, private image viewing/audio playback and delivery in the separately authorised installed-service test.

Set `WHATSAPP_CURRENT_RELIEF_URL` on Roster Pages to the current relief portal, initially `https://roster.diveanalytics.com/`. The Report Absence menu item only opens this HTTPS link. The scheduled Worker does not need this inbound-menu variable, and the link does not migrate or submit reports.

## 7. Acceptance checks before normal use

| Check | Expected result |
| --- | --- |
| Updated component versions | All four backends, five frontends and the separate notification Worker match the v0.8.4 package |
| Contacts Admin sign-in | Directory loads and intended application access is visible |
| Deploy initial view | Latest saved unpublished draft for an authorised planner, otherwise the in-force publication; explicit selection retained |
| Ordinary teacher | Cannot enter System Config or baseline upload; Calculations returns only the signed-in teacher |
| SMC System Config | Can inspect saved rules but cannot change them; Admin can edit and save |
| Home and own absence | First eight authorised functions precede the divider; compact Start/End dates and timed periods lead to a no-write review, visible instructions and the final bottom Submit absence |
| Automatic limits | Enabled defaults 9 daily and 6 consecutive reject an extra period; toggles and priorities survive refresh |
| Personal calculations | Current published weekly values; completed-only percentage or explicit unavailable history/source state |
| Roster `diagnoseRoster()` | Current checks pass; read timestamps separately from cached historical failures |
| Roster `checkRosterAccess()` | Expected folders readable; rights match intended operations |
| Roster date | Calendar confirms school day, timetable validity and week parity |
| Roster timetable | Blank view until selection; warm name selection/filtering responds locally |
| Test save | One confirmation, retained draft on failure, safe receipt-based retry |
| Concurrent absence reports | Distinct new reports can both save; overlap still conflicts; exact retry creates no duplicate |
| Existing-record edits | Stale/conflicting edits remain visible and cannot silently overwrite a newer decision |
| Suspended timetable editor | Independent concurrent edits merge on Save to online; conflicts retain choices; Confirm freezes the current/future teacher preview and compatible saved validation is reused |
| Offline final timetable | Final absence, coverage and swap annotations survive import and saved readback without creating online absence records, relief credit or messages |
| Import contacts | Contacts candidates exclude SLs, MK and OSO; eligible contacts without a baseline row remain selectable; creating a permitted new contact preserves the import draft and mappings |
| Assign Relief tools | Export Class POV covers the complete dated class timetable; Absent Teachers and Relief Load show current dated information without writing or sending |
| Named duty lists | Inclusive dates, explicit Activate today, overlap rejection and preserved historical membership |
| Shared Form lesson | Draft Combine with a present co-teacher; one vacancy if none remains; no automatic publication |
| WhatsApp Inbox | SMC/Admin access, ordinary-teacher denial, private JPEG/PNG and audio, preserved reply drafts and current-duty-only alerts |
| Publication | Let teachers see releases saved arrangements. Allow advance publishing permits verified future dates; a published future day is eligible for explicit Send WhatsApp. No save/export silently publishes. |
| Ordinary-teacher Daily Updates | Grouped published Absent teachers/Relief teachers, no Relief Load, quota, private reason or draft data |
| Private link | Opens without sign-in, repeatedly before the fixed seven-day expiry; acknowledgement is explicit and publication-specific |
| Teacher confirmed suspensions | Today/future confirmed plans appear for an active mapped eligible teacher even without a lesson in the plan; **View confirmed timetable** is frozen and read-only, private absence reasons are neutralised, and **Timetable** help points to the published daily view |
| Contact-file export | The **add** / **+** column generates one `.vcf` with exact GSPS/TTb/Statutory name fields, offers a fallback, and needs no extra consent; verify native import separately |
| Allocation trail | Worker creates one dated text file and structured evidence; failed export leaves accepted online choices intact and pending |
| WhatsApp Readiness | Approval and Sending shown separately; no assumption that Approved means delivered |
| Daily email report | Correct recipients, both recorded addresses where selected, schedule and original dated snapshot |

Use the school's authorised production test with the operator's simulated absence only when ready to test side effects. Local tests do not prove live permission, quotas, Google latency, provider approval, webhook correlation, delivery or acknowledgement. Reading a message is not the same as pressing the acknowledgement action.

## 8. Routine maintenance

Daily: review failed or uncertain sends, unacknowledged duties, current health and unresolved saves. Confirm the intended in-force Deploy version, valid baseline and duty-SMC schedule after a timetable change.

Before each release: back up data and code, inspect the release-specific migration notes, preserve URLs and secrets, update matching backends first and retain the previous package. Keep a record of the Apps Script deployment versions and Pages deployment IDs installed together.

At each staff change: update Contacts by the supported Admin workflow, resolve provisional ad hoc contacts and inspect identity matching. Do not recycle Staff IDs. A teacher's inactive state and a dated external-relief activation are different records.

At year change: set and release the next Calendar year, prepare and publish the next Deploy version with correct validity, upload the right baseline and review annual accounting. Do not delete last year's operational history merely to make the new year appear empty.

When storage grows: use supported prune and archive screens and retain original report snapshots. Baseline prune marks entries and preserves archived material. Administrative operational pruning has its own preview and controls. Do not clear journals, receipts or the operational JSON by hand.

### Limits that matter

| Limit in the application source | Effect |
| --- | --- |
| Baseline workbook: 8,000,000 bytes | Larger files are rejected before save |
| Baseline register: 500 entries | Review supported pruning/storage before adding more |
| Roster operational JSON: 12,000,000 characters | Save stops when the document is too large; use supported maintenance |
| One stored Stapler plan: 2,000,000 uncompressed bytes | Oversized plan is rejected; the save endpoint also has a 1,900,000-byte request-plan guard |
| Legacy Stapler leases: 256 current/future dated records; 1,200 bytes per record | Older-client compatibility endpoints only; current editing does not depend on lease acquisition |
| Legacy lease acquisition guard: 350,000 bytes | Retain compatibility records; do not delete future tombstones to bypass an old-client limit |
| Inbox: 20,000 messages; 8,000,000-character metadata document | Capacity failures retain existing history; archiving requires an authorised maintenance process |
| Deploy index: 45,000 characters for new writes | Stops a new save before exceeding the cell budget; legacy recovery has a separate margin |
| Google service and mail quotas | Depend on account and service; a source build does not guarantee available quota |

## 9. Diagnose without destroying evidence

| Symptom | First action |
| --- | --- |
| `/exec` returns HTML or 404 | Confirm the recorded deployment URL, execution account, access and current published version |
| Identity diagnostic fails | Retain `userinfo.email`, authorise the deployment account and redeploy the existing URL |
| Contacts service read fails | Check Contacts URL and the appropriate bridge or Roster service secret, not an unrelated browser sign-in |
| Permission denied for Drive | Run the read diagnostics and inspect the reason; check the helper account's folder rights |
| Save result uncertain | Retain the draft and request ID; use the existing confirmation/retry action |
| Pending field commit | Stop new writes and use `recoverFieldCommit()` through the maintained backend; do not erase its marker |
| Old failure still shown | Compare timestamps and current checks; diagnostic history can retain an earlier failure for hours |
| Saved Stapler date is listed but cannot open | Preserve it; capture the reference, backend version and failure stage, then inspect matching showRosterDiagnostics() history |
| Stapler has no date context | Return to its date list; select a verified school date with a valid baseline |
| Stapler says read only | Check current role, sponsorship and whether this is the ordinary-teacher frozen Confirmed preview; refresh stale pre-v0.8.4 tabs |
| Old client reports a planning lock error | Refresh to v0.8.4 assets; preserve its unconfirmed request and retained lease metadata |
| Inbox text exists but image/audio fails | Check private R2 binding, supported type, size, media availability and sender credentials; retain the message record |
| R unknown | Check in-force Deploy, identity mapping and baseline. Missing annual history starts at zero; failed data reads must be resolved |
| Worker timer runs but no messages | Check diagnostics mode, sending flags, route approval, publication, due time and outbox status |
| Email absent | Check publication, recipient addresses, mail authorisation, quota and report dispatch status |
| Email recipient settings save unconfirmed | Use Check saved settings for the exact request. It survives same-user, same-tab reloads when storage is available; keep the page open if a memory-only warning appears. Settings-specific comparison ignores unrelated allocation/acknowledgement changes but rejects competing settings edits. Saving settings sends no email. Capture the diagnostic reference if confirmation still fails; the reported production error has no established root cause. |

Capture the trace/diagnostic ID, action, date, app version and time. Avoid screenshots containing tokens or full staff data. Preserve journals and operational files before recovery.

## 10. Recover or roll back

1. Stop the affected writers and pause sends before restoring anything.
2. Preserve the current data, receipts, journals and delivery state for comparison.
3. Prefer a compatible forward fix or documented recovery of the existing request.
4. Restore code only after checking its schema, template and message contracts against current data.
5. Restore data only from a known consistent backup with an explicit plan for changes made since that backup.
6. Recheck permissions, dates, in-force version, baseline and pending operations before resuming.

A Pages rollback does not roll back Apps Script, Google Sheets, Drive files, email or messages already sent. A workbook copy alone does not include Script Properties or external operational JSON. A changed Apps Script deployment does not undo writes made by the newer code. Do not overwrite newer operational history with an old snapshot as a routine rollback.

## 11. Source and platform references

Application evidence: `Contacts_Code.gs`; `backend/Code.gs`; `backend/FieldStore.gs`; `backend/Roster.gs`; `backend/RosterOperations.gs`; `backend/StaplerLeases.gs`; `backend/RosterInbox.gs`; `calendar-backend/Code.gs`; each `public/_worker.js`; `shared/roster-operations.js`; `shared/roster-allocation.js`; `notification-worker/index.js`; `scripts/build-release.py`.

The release API contracts describe current logical stores and service fields. Historical architecture material in the source archive describes its stated version; it is not a scan of live Cloudflare or Google configuration.

Platform instructions checked on 18 October 2026: [Cloudflare Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Apps Script deployments](https://developers.google.com/apps-script/concepts/deployments), [MailApp authorisation and quota check](https://developers.google.com/apps-script/reference/mail/mail-app). Follow a newer official interface label if the dashboard wording changes; preserve the resource and configuration contracts above.


## v0.8.4 operator checks

### Report Absence

Start and End date sit beside each other where the screen permits; individual timed periods, Select All and Clear remain available. Periods begin unselected. **I'm not available in these selected periods** reviews the chosen dates and periods without saving. Wait for the selected day's timetable verification to finish before reviewing. Date changes must not leave lesson rows from a previously selected date.

After review, relief instructions stay visible. **No relief instructions** sits beside the instruction section's **Absence date** selector. Clicking it changes the choice and immediately saves through the same validated path as the bottom action. It preserves entered text and the confirmation when marking entered instructions not applicable; it does not mean no relief is required. Teachers entering written instructions use **Submit absence** or **Save instructions** at the bottom. **Own arrangements** sits directly beside **No relief instructions** in editable preview and saved instruction headers and works with or without text. A new absence or changed instructions are saved before the colleague chooser opens; a clean saved record opens directly. Typed text and the instruction choice are retained, and blank text does not silently select No relief instructions. A failed or uncertain submission retains the draft and exact retry identity; repeated clicks during saving must not create duplicate writes. The chooser stays closed until confirmation. Successful recovery resumes it only while the same report/date remains open. A definite failure keeps the fields editable for retry. Cancelling the chooser retains the saved absence/instructions. Opening it creates no colleague request and does not mark No Relief; **Submit requests** is the separate request action.

### Import the final offline timetable

**Import Offline JSON** accepts the selected day's final offline result, including its saved absence annotations, covering-teacher placements and supported swaps. It does not replay offline absence reports, relief credit or notifications into online operational records. Represented teachers receive their whole final day, including blanks; teachers entirely missing from the JSON retain baseline and default presence, subject to existing online absences.

The resolution picker uses Contacts and excludes SLs, MK and OSO using recorded categories. An eligible contact does not need a recurring baseline row. Resolve ambiguous names explicitly to the correct contact identity. Each unresolved name has its own Add new contact action. It pre-fills that source name and selects the returned canonical identity only in its original row. Existing Contacts permissions and any required approval remain; cancellation and retries preserve the other mappings and draft. Do not rewrite the recurring baseline simply to add a dated participant.

Imported workload-cap exceptions remain visible warnings through Save, Confirm and reopening. They do not disable the configured limits for new online relief work. Save retains a draft; Confirm makes the saved timetable available for allocation. Daily publication and notification remain separate.

### Apply a class field in Stapler

In Class view, **Subject**, **Venue** and **Group** each have a separate **→** arrow. Apply one field at a time; only that field changes across current lesson tiles linked to the class, including Card Pit tiles. Shared multi-class tiles change once; baseline comparison tiles and recess do not change. Blank inputs ask for a value without changing the plan, and invalid text leaves the entire plan intact. Other unapplied input values survive redraw. Check one Undo restores one apply, then use **Save to online** when ready. These controls are absent from ordinary teachers' confirmed read-only views.

### Save, export, release and notify

**Save to online** submits local changes. The success comparison shows which cells were updated, already matched online or retained the online value. A conflicting cell keeps its original, local and current online values for review. An uncertain outcome is not shown as Saved. Independent sessions may save different cells, but the final server check still rejects invalid double booking or capacity.

**Export Excel**, **Export relief excel** and **Export Class POV** use the loaded selected-day data with current local edits. They do not wait for network verification or save to online. An offline/local export can differ from online and teacher-visible data; it is not a receipt of either. SMC's Absent Teachers and Relief Load tools remain operational summaries. Ordinary teachers instead have the separate published-only Daily Updates groups and no Relief Load view.

**Let teachers see** releases saved online arrangements; unsaved local changes must be saved explicitly first. **Send WhatsApp** sends eligible published changes. A combined action performs both named steps. All affected includes corrections owed after a prior sent, acknowledged or uncertain notice, even if the latest timetable has returned to baseline. Teachers matching baseline with no such correction are excluded. Teachers absent for the full school day are excluded from timetable WhatsApp and the acknowledgement population. For partial absences, only changed timetable content or a correction owed during periods they are present qualifies; absent-only changes do not. Full-day absence spans all school-day periods, not just baseline lessons. Saved online attendance is checked again before queued dispatch, without mutating the released timetable.

A published current or future date is eligible for explicit individual or bulk Send WhatsApp. Explicit clicks request immediate dispatch during quiet hours; automatic notices retain their schedules. Past dates cannot send current notices. Admin's **Allow advance publishing** controls whether an unpublished future day may be released; turning it off does not retract an already published day. A started period no longer triggers an audit-approval block on an SMC allocation change.

Daily Notify uses an inline spinner and explanatory text during refresh, without a blurred blocking screen. Its top-right Teacher acknowledgements dashboard counts unique eligible teachers in the selected current publication, showing Requiring acknowledgement, Acknowledged, Pending and progress. Eligible already-sent teachers remain included. Only acknowledgement of the current timetable notice counts as Acknowledged; provider read/delivery does not. Search and grouping do not change the totals. The date/revision and unpublished or zero-eligible states are explicit; the dashboard stacks below the controls on a narrow screen. Its summaries, notification eligibility and acknowledgement indicators refer to the latest published timetable. Queued, accepted by Meta, delivered, read and explicitly acknowledged are different states. An uncertain provider result is reconciled rather than blindly resent.

Main Timetable shows the published suspended day first when available and keeps the recurring baseline visibly below, with shared teacher/class/TG selectors and separate baseline PDF/Excel controls. Top exports continue to use the published day. It continues to use the last verified same-date published view while refreshing. A failed initial publication check can retain the baseline with a visible retry state. This is distinct from Stapler's frozen confirmed preview for today/upcoming dates. In Stapler, **Confirmed suspensions** comes first. Ordinary teachers use **View confirmed timetable**, while an authorised delegate retains **Open planner**. **Request planning access** starts collapsed unless existing planning dates or a pending request need attention. The helper says: “To view the published timetable, select Timetable from the main screen.” Viewing does not save, confirm, publish or send a notice. Exact request receipts remain the recovery path for uncertain saves; never reset operational files to remove a loading error.

Use `PERFORMANCE_v0.8.4.md` and `VALIDATION.md` for measured local checks and their limits. Installation is not evidence of live Google/Meta permissions, delivery or morning concurrency latency.

### Retained configuration check

Review the new System Config controls after the matching code is installed. Relief Health period selection changes display only. Employment-period restrictions control new automatic assignments, with recorded explicit SMC exceptions; existing timetabled lessons remain valid. Baseline Name Bridge management retains its exact source-name validation and flags old retained mappings for review. The offline import picker separately permits eligible Contacts identities without a recurring baseline row.

Configure duty-summary times in Singapore time. The defaults are 16:00 through 21:30 every half-hour for the following date, plus 05:30, 05:45, 06:00, 06:15 and 06:29 for the current date. The first evening and 05:30 reports are fresh, including zero absences. Later unchanged summaries are suppressed against the last successful summary. Automatic quiet-hour exceptions remain limited to configured duty summaries; explicit teacher Send WhatsApp clicks also dispatch immediately. Confirm target-date duty membership before checking installed delivery.

The user's 05:45 delivery confirmation on 19 October 2026 is retained as an observation. The release build does not resend it or verify provider callbacks. Local verification and remaining limits are recorded in VALIDATION.md.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## Retained settings

Existing saved automatic allocation settings remain in Roster operations.json. Retain that file and the backend properties that locate it when updating code. A one-time allocationRulesVersion 1 migration moves Same teaching subject to the end while retaining other relative priorities. Subsequent custom order is preserved. Inspect the six preference toggles and two limit toggles after installation. Missing toggle values default on; missing daily/consecutive limits default to 9 and 6. Existing settings are retained. Disabled rules retain their values and position. Enabled limits are strict and count distinct effective lesson, relief and invigilation periods. SMC can inspect these settings; Admin alone can save them. A new backend with a new operational store starts with defaults. Cloudflare activation flags are separate from the saved Roster business rules.


### Retained Inbox activation boundary

The Inbox code and readiness display are configuration-ready. No live activation or delivery is established by this package. Verify matching Pages, Roster and notification Worker deployment, backend/service secret, WHATSAPP_ENABLED, account and phone IDs, webhook verification and app secrets, the Meta messages webhook, sender token/API version, private WHATSAPP_INBOX_MEDIA binding and retained Inbox store. There is no independent INBOX_ENABLED switch. An empty Inbox does not by itself prove that capture is disabled. A failed read must remain visible. New verified webhook events are captured; old uncaptured messages are not imported. Optional duty alerts have their own template and flag.

For installed acceptance, use an authorised controlled inbound message, refresh its saved conversation, check SMC/Admin visibility, private image viewing and voice playback, then check a separately authorised reply and its delivery status. Keep the test result distinct from configuration readiness. Do not enable unrelated menu or automatic allocation switches merely to open the Inbox.

### Retained personal calculations

Calculations is an on-demand own-record read. The server resolves the signed-in Contacts Staff ID, rejects alternate identity/date/version selectors and uses the applicable current published Deploy source. W_i and R remain weekly under whole-week-v5. Configured teaching-cap headroom is applied before rounding R. The completion percentage requires verified recorded annual history, a recorded current week and a positive denominator; missing data must display Unavailable. Completed relief through Singapore today is distinct from planned/committed work used by allocation fairness. This page does not reconstruct missing historical weekly quotas or write accounting records.

## Saved-plan readback still required

The gzip decoder now supplies `application/x-gzip` and a `.gz` filename when reconstructing the stored Blob. Existing compressed bytes and validation metadata remain unchanged. A strict local adapter reproduces the old metadata failure. The production cause is not established by that test.

The saved planner read in Roster avoids quota and complete baseline-cell work that the editor does not need. Current baseline identity and timing, Calendar and permissions still apply. Save to online and Confirm retain structural, identity, authority, source and conflict validation, with the visible imported workload-cap exceptions described above. Opening a plan does not write a replacement or a migration.

For the reported failure, use the existing 21 October Revision 1 draft as the acceptance case. Do not create a new plan over it to make the check pass. If a load error remains, keep the draft and investigate the matching deployed diagnostic before any recovery write.

Calculations reuses its loaded Deploy index within the request. Its own-record scope, whole-week-v5 formula and recorded-history requirements remain unchanged. The explanation uses the saved SIUE allowance, without attributing it to an unverified national average. KP appointment status alone adds no extra preference to be assigned last; ordinary eligibility and saved allocation rules still apply.


## Retained integration setup

### Portable contact file

Extract the outer suite package and upload its inner `Contacts_Frontend_v0.8.4.zip` to the existing Contacts Pages project. Refresh the browser, verify the visible v0.8.4 version and ensure `contact-vcard.js` is included. The login screen and workspace header both display the version. A page still showing v0.8.2 with `google-contacts.js` is not the current release. If required contact-file code failed to load, the page explains this and asks the user to **Reload Contacts and try again**. A missing status region is created safely; this recovery does not claim a contact was saved. Preserve the existing `GOOGLE_CLIENT_ID` and school sign-in settings. The **add** / **+** action generates a `.vcf` from one selected loaded row without another API request or Contacts consent. Prefix is `GSPS`, First Name is the complete TTb Name and Last Name is the complete Statutory Name. The native device contact app determines the review/save prompt.

Follow [Contact-file export](GOOGLE_CONTACTS_SETUP.md) for browser fallback and Android/iPhone import guidance. Check the installed version, generated file and native import separately. The file is not a sync; repeated imports may create duplicates. Previous personal contacts and OAuth grants are not modified. A package build does not create a device contact.

### Reusable private links and button template

Keep `external.html`, its assets and `/api/external` reachable without a blanket Access/sign-in wall. The signed recipient/date/purpose capability remains required; protected staff APIs and files stay protected. Timetable links remain usable for seven days from original issuance, through repeated opening and acknowledgement. Refreshing, retries and publication changes do not extend that expiry. View and acknowledgement use the latest teacher-visible publication; stale acknowledgement attempts require review of the new version.

The prepared `gsis_timetable_updated_button_v2` variant has **View Detail** and **Acknowledge** buttons. Keep the approved in-text URL route selected until Meta approves the exact variant and an operator deliberately updates the mapping in both Roster Pages and the notification Worker. `notification-worker/templates.buttons.pending.example.json` is disabled and contains only the replacement route; it must be merged with the complete route map, never pasted as the full activation configuration. The acknowledgement URL opens the page action and does not mark acknowledgement merely by being opened.

### Daily allocation audit export

The Roster executing account needs its existing write access to the configured `ROSTER_ROOT_FOLDER_ID`. The Worker uses the existing signed service connection and minute cron; no new secret, public bucket or staff messaging permission is needed. Normal Worker operation includes an independent audit-export lane; diagnostics mode replaces the normal cycle and therefore pauses that lane too.

The exporter creates `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` beneath the Roster root, plus structured evidence under `Allocation Audit/YYYY/MM/Evidence/YYYY-MM-DD.json`. Each text file explains accepted automatic choices, exclusions and solver limits, and records accepted SMC online before/after changes with actor and time. Unsaved device edits are not online audit events. Messages, phone numbers and private capability tokens are not exported.

Failed Drive export leaves the accepted online change intact and retries. Verify the dated file, pending/exported revisions and Worker errors after installation. Both the durable evidence file and text watermark must confirm captured facts before old records are compacted from the working document; newer/unexported facts remain. Retain the evidence files and metadata for subsequent corrections and historical audit reads. A local mocked export test does not establish live folder access or a completed production export.
