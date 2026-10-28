# GSiS v0.7.13: setup and maintenance

This guide is for the person who installs and maintains GSiS. The Deploy user manual explains the screens used by school planners. The separate WhatsApp activation guide explains how to turn messaging on. Installing code does not turn messages on or publish a school timetable.

Use the **existing installation** path if the school already uses GSiS. Use the **blank installation** path only for a separate new instance. Do not mix these paths.

## 1. Understand the parts

| Part | What it does | Where its authoritative data lives |
| --- | --- | --- |
| Contacts | Staff identity, contact details, role membership and application access | Contacts Google workbook |
| Deploy | Planning versions, teaching deployment, workloads, relief quota R and venue allocations | Deploy Google workbook |
| Layout | Public campus and venue view; controlled unit editing | Deploy publication and venue register |
| Calendar | School calendar, year structure, event publishing and verified school dates | Calendar Google workbook, with explicit sync to staff/parent Google calendars |
| Roster | Baseline timetables, absences, relief, Stapler plans, accounting and acknowledgements | Roster Drive folders, owned by the Deploy Apps Script project |
| Notification Worker | Runs scheduled service calls and dispatches eligible notices and Inbox replies | It calls the Deploy backend; relief notices and Inbox records use their respective private stores |

There are five Pages websites but only three Apps Script web apps: Contacts, Deploy and Calendar. Roster and Layout use the Deploy backend. Do not create separate Roster or Layout Apps Script projects.

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
| Draft | Saved planning data that has not been published to its intended audience |
| In force | The published Deploy version or baseline valid for the selected date |
| Receipt | A stored record that lets the server recognise a retry of the same save |

## 2. Keep a private installation record

Record the three Apps Script project links, their deployment IDs and `/exec` URLs, their executing account, all workbook IDs, Roster folder IDs, the venue register ID, five Pages project names/domains, Google OAuth client ID and the notification Worker name. Record where secret values are held, not the secret values in this document.

Use a maintained school helper account with access to the workbooks, Shared Drive folders and calendars. A Shared Drive owning files does not replace the Apps Script executing account's access. Staff sign in with their own school accounts; the helper account does not need SMC membership solely to run diagnostics.

Keep an inventory of which Admin and KP access records are active. Contacts application roles and Contacts staff role memberships are separate. SMC membership is a directory role group. Admin is not automatically SMC. Calendar has its own Users sheet and permissions.

## 3. Update an existing installation

1. Keep the last working deployment package and export the current Apps Script code and manifests.
2. Back up the three workbooks, venue register, Roster Drive files and private configuration inventory.
3. Wait for active saves and publication to finish, then pause affected writers during installation.
4. Keep WhatsApp sends and scheduled allocation disabled during the code change.
5. Replace Calendar code with the complete `Calendar_Backend_v0.7.13.gs` file.
6. Replace Contacts code with the complete `Contacts_Backend_v0.7.13.gs` file.
7. Replace Deploy code with the complete `Deploy_Backend_v0.7.13.gs` file.
8. Apply the supplied manifest changes and authorise the deployment account where Google asks.
9. For each existing web app, select **Deploy > Manage deployments > Edit > New version > Deploy**.
10. Upload each matching frontend ZIP to the existing Pages project as a production deployment.
11. Replace the separate notification Worker's code with the complete `notification-worker/dashboard-worker.txt` if it is installed.
12. Refresh old browser tabs and complete the checks in section 7 before activating messages. Stapler writes now require a dated editing lease, so old tabs must reload.

Do not create replacement deployment URLs for an ordinary update. Preserve existing Script Properties, Cloudflare secrets, custom domains and Access rules. Do not rerun blank setup, seed a new Deploy dataset, clear operational files or create replacement Staff IDs.

The combined Deploy file already contains the shared rules, seed and Roster modules. Paste the combined file as one Code.gs and remove duplicate old copies of those same definitions. Do not paste both the combined file and every modular `.gs` file into the project. Keep unrelated school scripts out of these application projects.

### Apps Script projects and manifests

| Project | Complete code | Services used | Important authorisation |
| --- | --- | --- | --- |
| Contacts | `Contacts_Backend_v0.7.13.gs` | Advanced Sheets API v4 | Spreadsheet access and external requests for its optional Deploy connection |
| Deploy | `Deploy_Backend_v0.7.13.gs` | Advanced Sheets API v4 and Drive API v3 | Spreadsheets, external requests, Drive, user email and send mail |
| Calendar | `Calendar_Backend_v0.7.13.gs` | Advanced Sheets API v4 and Calendar API v3 | Spreadsheet, Calendar, Drive and user identity access used by its bound project |

Deploy's manifest is `appsscript.json` in the deployment archive, or `backend/appsscript.json` inside the source archive. The email reporting feature needs `https://www.googleapis.com/auth/script.send_mail`. Save that scope, run `authoriseRosterMail()` in the editor as the deployment helper account and complete Google’s permission prompt, then publish a new version of the **existing** deployment. Keep `https://www.googleapis.com/auth/userinfo.email`; removing it can break editor identity diagnostics. The helper checks remaining email quota and sends nothing. Adding a scope to the editor alone does not update already published code.

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
6. Create separate Apps Script projects for Contacts and Deploy, and a project bound to the new Calendar workbook.

The Calendar project must be opened from the Calendar workbook with **Extensions > Apps Script**. Its code uses `getActiveSpreadsheet()`. Contacts and Deploy use explicit configured workbook IDs instead.

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
8. Run `authoriseRosterWrites()` and `authoriseRosterMail()` under the deployment account and complete Google's permission prompts. The mail helper checks quota without sending a message.
9. Deploy as a web app and set `DEPLOY_WEB_APP_URL` to that deployment's `/exec` URL.

The folder properties must identify folders, not files. A custom `DEPLOY_SHEET_ID` or any one Roster folder override requires all three folder properties. Partial overrides are rejected rather than falling back to the existing school's folders. In a new instance, leave `ROSTER_INDEX_FILE` and `ROSTER_OPERATIONS_FILE` unset; never copy the old instance's file pointers to the new folders. The operational register and operations JSON are created by supported application writes. Do not create empty files with those names or paste `{}` into them. The service expects a specific schema, revision and receipts.

The packaged source retains compatibility defaults for the existing GSPS installation. A new instance must set the workbook and folder overrides explicitly. Never rely on legacy IDs for a new instance.

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
| Roster | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL`, `CALENDAR_APPS_SCRIPT_URL`, secrets `BRIDGE_SECRET` and `CALENDAR_PROXY_SECRET` | Deploy and Calendar `/exec` |

Create or reuse a school Google OAuth web client for Google Identity Services. Add each actual website origin to its authorised JavaScript origins. An origin contains the scheme and host, without a path. Update `shared/viewports.js` and rebuild when using different school domains so navigation points to the correct apps.

Pages settings are per project and per environment. Production and Preview are separate. After changing production variables or secrets, create a new production deployment so the Worker uses them. Use new secrets for an independent instance. Never copy production sending credentials into a test site by accident.

No D1, R2 or KV database is required by the default package. `ASSETS` is supplied by Pages. `LIVE_HUB` is an optional legacy live-update integration; ordinary Deploy operation uses explicit reads and saves without requiring it. The scheduled notification Worker is a separate resource and does not need an ASSETS binding.

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
| Contacts `BRIDGE_SECRET` | Contacts Apps Script; matches Contacts Pages and Deploy's `CONTACTS_BRIDGE_SECRET` |
| Deploy `BRIDGE_SECRET` | Deploy Apps Script; matches Deploy, Layout and Roster Pages |
| Contacts `DEPLOY_API_URL`, `DEPLOY_BRIDGE_SECRET` | Optional reverse connection for active teaching information; use Deploy's existing URL and secret |
| `ROSTER_SERVICE_SECRET` | Same dedicated value in Contacts Apps Script, Deploy Apps Script, Roster Pages and notification Worker |
| `CALENDAR_PROXY_SECRET` | Calendar Apps Script; matches Calendar Pages, Roster Pages and notification Worker |
| `CALENDAR_SESSION_SECRET` | Calendar Pages only; signs its browser session |
| `EXTERNAL_LINK_SECRET` | Roster Pages and notification Worker; signs recipient-specific external links |
| `ROSTER_INDEX_FILE`, `ROSTER_OPERATIONS_FILE`, `ROSTER_INBOX_FILE` | Runtime file pointers in Deploy Script Properties; preserve them during updates |
| `ROSTER_STAPLER_LEASE:YYYY-MM-DD` | Runtime dated editor/fence records in Deploy Script Properties; preserve current/future records and release tombstones |
| `WHATSAPP_CURRENT_RELIEF_URL` | Roster Pages only; HTTPS destination for the contact menu Report Absence link, initially `https://roster.diveanalytics.com/` |
| `WHATSAPP_INBOX_MEDIA` | Private R2 bucket binding on Roster Pages only; no public bucket URL |
| `WHATSAPP_INBOX_ALERTS_ENABLED` | Enables optional WhatsApp duty alerts only after the exact dedicated template is approved; not required for in-app alerts |
| `DEPLOY_WEB_APP_URL` | Deploy diagnostic URL; not the Contacts service URL |

Keep bridge secrets, service secrets, link secrets and provider tokens distinct. Do not enter secrets in source files, browser local storage, screenshots, tickets or release notes. Replacing a session-signing secret invalidates existing sessions. Replacing a link secret invalidates existing external links. Plan rotation accordingly.

## 6. How reads and writes stay reliable

The full baseline model is immutable by its model ID and can stay in memory and IndexedDB under the signed-in account and permission scope. Current profile/date metadata still decides which model applies. Sign-out or changed authority clears the old scope; blocked or failed browser storage falls back to server reads. Names, timetable views, local filters and highlighting can use this loaded model. The server still validates permissions, current absence state, eligibility, revisions and publication before writes. A cached blank cell does not guarantee that another user has not just assigned that teacher.

Deploy reads exact field ranges and maintained projections. A field save uses a script lock, a durable journal, narrow field updates and an index commit marker. Readers reject an unfinished or changed marker. A retry with the same request ID can return its saved receipt. Contacts uses its own journals and data epochs. Calendar uses mutation IDs and bounded batched changes. These mechanisms are separate, not one cross-service database transaction.

Roster saves absence, assignment, audit and notification intent in one operational JSON document while holding the Deploy script lock. Baseline upload first creates immutable model and archived workbook files, then commits the register that points to them. A failed upload can leave an unreferenced file; that is different from a committed active baseline. Do not delete files merely because a browser timed out. New absence reports may carry an older global revision and are validated against current state inside the lock. Existing-record edits and shared allocation remain revision-guarded; exact request retries replay their saved receipt. The design still serializes durable writes and does not promise unlimited simultaneous throughput.

Publishing can involve more than one service. Deploy catalogue publication, Contacts updates, Roster writes, email and Meta delivery cannot all succeed or roll back as one atomic operation. Stored receipts, pending markers, outbox states and explicit recovery paths handle those boundaries. Never promise exactly-once delivery across a network failure.

### Dated Stapler editing

A planning date has one editor lease, stored separately in Deploy Script Properties. Its active workspace renews every 45 seconds and the lease expires after 180 seconds without renewal. These heartbeat writes do not replace the operations document or advance its revision. Save retains the lease; Confirm releases it only after the saved plan is confirmed. A failed or uncertain confirmation must be retried with its original request.

The date list shows the editor. Admin can use Release abandoned editing lock after checking that the session is no longer in use. This does not save that editor's local changes. Leaving the workspace stops renewal. Current/future release records retain their fence to prevent delayed requests from regaining the lock. Never delete these tombstones as a routine storage fix.

### Duty and shared-subject settings

Use SMC Duty Roster to create named inclusive date ranges. Activate today changes only the start date; otherwise each list follows its dates. Resolve an overlap by editing or deleting the intended list, not by changing the underlying JSON. Past membership remains available for audit and existing notification checks.

System Config enables shared Form coverage by default. Review the actual baseline venue labels: only a matching subject, period and one known venue can establish a shared lesson. Add further subjects from the catalogue or switch the rule off as required. A present co-teacher receives a draft Combine; if none remains, Auto-allocate fills one vacancy. Individual manual and accepted own-arrangement decisions are preserved. This setting does not publish or send the day.

### WhatsApp Inbox prerequisites

Install the matching Deploy, Roster Pages/frontend and scheduled notification Worker code together. Retain the every-minute Cron trigger for queued replies. Keep the existing school sender credentials and `WHATSAPP_TEMPLATE_ACCOUNT_ID`; bind a private R2 bucket as `WHATSAPP_INBOX_MEDIA` on Roster Pages. Normal replies use the customer's current 24-hour window, while later contact requires a supported approved template.

All SMC/Admin can use the Inbox. Only verified current duty SMC receive new-message alerts, without a fallback to all SMC. Optional WhatsApp alerts require the exact proposed `gsis_inbox_new_message_v1` template in `en_GB` and `WHATSAPP_INBOX_ALERTS_ENABLED=true`; leave the flag unset or false until approval. In-app duty alerts do not require that template. Provider calls in local checks are mocked; verify ingestion, private audio playback and delivery in the separately authorised installed-service test.

Set `WHATSAPP_CURRENT_RELIEF_URL` on Roster Pages to the current relief portal, initially `https://roster.diveanalytics.com/`. The Report Absence menu item only opens this HTTPS link. The scheduled Worker does not need this inbound-menu variable, and the link does not migrate or submit reports.

## 7. Acceptance checks before normal use

| Check | Expected result |
| --- | --- |
| Five app footers | Matching installed release version |
| Contacts Admin sign-in | Directory loads and intended application access is visible |
| Deploy initial view | Latest saved unpublished draft for an authorised planner, otherwise the in-force publication; explicit selection retained |
| Ordinary teacher | Cannot enter Admin-only System Config or baseline upload |
| Deploy `diagnoseRoster()` | Current checks pass; read timestamps separately from cached historical failures |
| Deploy `checkRosterAccess()` | Expected folders readable; rights match intended operations |
| Roster date | Calendar confirms school day, timetable validity and week parity |
| Roster timetable | Blank view until selection; warm name selection/filtering responds locally |
| Test save | One confirmation, retained draft on failure, safe receipt-based retry |
| Concurrent absence reports | Distinct new reports can both save; overlap still conflicts; exact retry creates no duplicate |
| Existing-record edits | Stale/conflicting edits remain visible and cannot silently overwrite a newer decision |
| Stapler editor | One editor per date; another session is read-only; successful Confirm releases the lease |
| Named duty lists | Inclusive dates, explicit Activate today, overlap rejection and preserved historical membership |
| Shared Form lesson | Draft Combine with a present co-teacher; one vacancy if none remains; no automatic publication |
| WhatsApp Inbox | SMC/Admin access, ordinary-teacher denial, private audio and current-duty-only alerts |
| Publication | Daily publication uses the current Singapore school workday; future plans can be confirmed for allocation |
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
| Stapler leases: 256 current/future dated records; 1,200 bytes per record | Acquisition fails visibly at the limit; past records are cleaned on acquisition |
| Script Properties lease acquisition guard: 350,000 bytes | Acquisition stops if the serialized property snapshot plus 1,200 bytes exceeds this safe ceiling; it is not permission to delete future tombstones |
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
| Stapler has no date context | Return to its date list; select a verified school date with a valid baseline |
| Stapler says read only | Check the displayed editor and lease expiry; Admin may release a confirmed abandoned session |
| Planning lock storage limit | Preserve current/future fence records; review date usage and other property storage before a supported correction |
| Inbox text exists but audio fails | Check the private R2 binding and current sender credentials; retain the message record |
| R unknown | Check in-force Deploy, identity mapping and baseline. Missing annual history starts at zero; failed data reads must be resolved |
| Worker timer runs but no messages | Check diagnostics mode, sending flags, route approval, publication, due time and outbox status |
| Email absent | Check publication, recipient addresses, mail authorisation, quota and report dispatch status |

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


## v0.7.13 update

See `CHANGELOG_v0.7.13.md`, `API_CONTRACTS_v0.7.13.md` and `API_ROSTER_OPERATIONS_v0.7.13.md` for the current changes. `VALIDATION.md` records the checks actually run; installation and live activation remain separate.

### v0.7.13 configuration check

Review the new System Config controls after the matching code is installed. Relief Health period selection changes display only. Employment-period restrictions control new automatic assignments, with explicit reasoned SMC exceptions; existing timetabled lessons remain valid. Name Bridge now requires an exact baseline name and flags old retained names for review.

Configure duty-summary times in Singapore time. The defaults are 16:00 through 21:30 every half-hour for the following date, plus 05:30, 05:45, 06:00, 06:15 and 06:29 for the current date. The first evening and 05:30 reports are fresh, including zero absences. Later unchanged summaries are suppressed against the last successful summary. The special quiet-hour allowance is limited to configured duty summaries. Confirm target-date duty membership before checking installed delivery.

The user's 05:45 delivery confirmation on 19 October 2026 is retained as an observation. The release build does not resend it or verify provider callbacks. Local verification and remaining limits are recorded in VALIDATION.md.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.
