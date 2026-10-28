# GSiS v0.8.7 — installation and maintenance

Release: **0.8.7**, 22 October 2026. Audience: the school service owner, first-time installer, developer and assisting LLM. This guide describes the packaged source and its contracts. It is not a live configuration inventory or a claim that messages have been delivered. The companion `GSiS-v0.8.7-User-Manual.html` explains staff workflows and works offline.

## 1. Start here

**Existing school installation:** use section 9. Preserve its data, URLs, secrets and writer ownership. Do not rerun blank setup or repeat a completed Roster split.

**Another school:** use sections 2–8 in order. This release contains GSPS domain checks, school defaults and campus geometry. It is a deployable GSPS suite, not a configurable multi-school product. A maintainer must adapt and rebuild those parts before another school can use its own accounts safely. Changing only Cloudflare environment variables is insufficient.

### What is in the full package

| File | Destination |
| --- | --- |
| `Calendar_Frontend_v0.8.7.zip` | Calendar Cloudflare Pages project |
| `Contacts_Frontend_v0.8.7.zip` | Contacts Pages project |
| `Deploy_Frontend_v0.8.7.zip` | Deploy Pages project |
| `Layout_Frontend_v0.8.7.zip` | Layout Pages project |
| `Roster_Frontend_v0.8.7.zip` | Roster Pages project |
| `Calendar_Backend_v0.8.7.gs` | Calendar workbook's bound Apps Script project |
| `Contacts_Backend_v0.8.7.gs` | Contacts Apps Script project |
| `Deploy_Backend_v0.8.7.gs` | Deploy/Layout Apps Script project |
| `Roster_Backend_v0.8.7.gs` | Separate Roster Apps Script project |
| `Roster_Notification_Worker_v0.8.7.txt` | Complete module code for the separate scheduled Cloudflare Worker |
| `GSiS-v0.8.7-Maintainer-Guide.md` | This installation and maintenance reference |
| `GSiS-v0.8.7-User-Manual.html` | Single staff manual for all five viewports |

There are twelve members in the outer ZIP. Extract it first. Upload each **inner frontend ZIP** to its matching Pages project. Each frontend ZIP contains its complete runtime, including root `index.html` and `_worker.js`. Paste the complete matching `.gs` into the appropriate Apps Script project. Do not mix it with older copies of the same functions. Paste the entire Worker text, not an individual source module. Source history, development tests and historical documentation are maintained separately from this deployment package. Obtain that maintained source repository for a school adaptation or code change; do not treat minified deployment assets as the preferred source tree.

### Changes in 0.8.7

| Area | Behaviour |
| --- | --- |
| Concurrent absence reporting | Timetable/model preparation runs before the final writer lock. The locked step revalidates dependencies and commits attendance with its allocation consequences. Independent new reports and exact retries retain their existing safe merge/receipt rules. |
| Notification separation | Mutable delivery records move to `Roster notification transport.json`, with an owner-scoped UserLock independent of allocation's ScriptLock. The same Roster Apps Script project remains the sole owner. |
| Sending | Frozen publication intents use bounded batch prepare/result calls and parallel provider requests. A durable Cloudflare Queue wake enables prompt manual sends; the minute scheduler remains recovery/fallback. |
| Acknowledgement | Home and My Relief Duties offer the current teacher's explicit acknowledgement near the top. Exact notice checks replace unrelated whole-document revision conflicts. |
| Loading | Authorised compressed baseline and suspended snapshots are reusable after a cheap server manifest check. Changed dates and deletions invalidate only the relevant stage. |
| Manual suggestions | Enabled business preferences also rank manual suggestions. Teachers with eight or more actual occupied periods, including relief, are deprioritised; the SMC can still make an explicit permitted override. |
| Publication reference | SMC views show publication timestamps in Singapore time, separately from the duty date and last checked time. |
| Statistics | SMC/Admin-only date presets, filterable tables, interactive charts and local Excel exports. Coverage explicitly identifies incomplete historical data. |
| Delivery review | Matching active alerts close after all current required Admin recipients have confirmed sent report receipts. Raw WhatsApp outcomes and history remain; new or changed issues reopen. |
| Daily employment update | Removes annual R utilisation and adds a dated Daily Notify link. The link opens the authorised current view; it does not save, publish or send. |
| Package | Runtime deployables plus this guide and one HTML manual. The manual includes the Archify visual system explainer. |

No production send or save is proved by this package. The 22 October investigation found 44 prepared sends with unconfirmed outcomes and expired leases; it found no recorded Meta message IDs or definitive error codes for them. They are retained for reconciliation, not automatically requeued.

## 2. Infrastructure, responsibilities and authority

### Execution and storage map

| Component | Owns | Reads or calls |
| --- | --- | --- |
| Contacts Apps Script | Contacts workbook, stable Staff IDs, role catalogue, application access and contact save journals | Optional active Deploy information |
| Deploy Apps Script | Deploy workbook, versions, field commit journal, publication, workload and R | Contacts; venue register |
| Calendar Apps Script | Bound Calendar workbook, years, school-day context, events, mutation log and explicit sync state | Configured Google calendars and output folder |
| Roster Apps Script | Baseline register/models, operational JSON, Inbox metadata, dated plans, publication, acknowledgement and immutable notification intents; separate mutable notification transport file | Contacts, current published Deploy data; date context arrives through Calendar |
| Five Pages Workers | Verify browser identity, route signed requests and serve frontend assets | Their assigned Apps Script; Roster also verifies Meta webhooks and serves protected media |
| Notification Worker | Minute scheduler, durable Queue consumer, allocation orchestration, dispatch, Inbox replies, reports and optional audit export | Roster, Contacts through the service contract, Calendar, Meta |
| Optional Cloudflare Queue | Prompt notification wake requests only; no teacher data or delivery authority | Signed Pages wake to the notification Worker; consumer drains durable Roster intents |
| Private R2 bucket | Incoming Inbox voice/image bytes | Roster Pages only, through authenticated media routes |

The split uses **four Apps Script projects**, not merely four files in one project. Deploy and Layout share one project. Roster has its own project. Attendance/allocation commits use its ScriptLock; notification transport commits use a distinct UserLock under the same execution owner. Contacts and Calendar already have their own projects. This reduces unrelated lock contention; it does not remove Google account quotas or make simultaneous writes to the same document safe without its lock. No D1 or KV database is required by the standard package. `ASSETS` is supplied by Pages. `LIVE_HUB` is an optional legacy integration, not a standard installation requirement.

### People and competencies

| Responsibility | Needed competence |
| --- | --- |
| School service owner | Approve access, staffing/workload rules, calendar dates, publication, retention and test recipients |
| Google Workspace administrator | Managed helper account, OAuth client, Sheets/Drive/Calendar access, Apps Script authorisation and deployment |
| Cloudflare administrator | Pages/Worker deployments, DNS, environment secrets, cron, private R2 and logs |
| WhatsApp administrator | Business account and school sender, app permissions/token, webhook, exact template approval and delivery investigation |
| Maintainer / assisting LLM | JavaScript/Apps Script, web identity, schema/version contracts, per-cell concurrency, receipt recovery, source build and meaningful regression checks |
| Duty SMC | Verify the day, save arrangements, release them to teachers, send notices and resolve pending acknowledgements |

Contacts owns current identities and access. A staff role/group and an application role are different. Admin application access does not automatically make someone an SMC member. The first Deploy version needs Admin **and** KP application access. Calendar additionally maintains its own Users roles. Never grant access by changing a client-side button, impersonating an email or weakening a backend check.

### Domain rules to preserve

- **Save to online** commits planning data. **Let teachers see** releases the dated arrangements. **Send WhatsApp** sends the eligible published change. Exporting does not perform any of those actions.
- SMC assignments, explicit clears and No relief required are protected from automatic allocation. **Return to automatic** releases that protection. Current SMC can replace a published or started allocation without a separate audit approval; this does not certify who actually completed a historical duty.
- Confirming a saved Stapler plan freezes the teacher preview. Later working edits do not change that preview until Confirm is used again. Teacher visibility does not expose unconfirmed drafts.
- A fully absent teacher receives no daily changed-timetable notice. A partially absent teacher is eligible only for changes in present periods. An unchanged effective timetable is not an affected timetable.
- Explicit eligible Send WhatsApp clicks can dispatch during quiet hours. Automatic sends retain their schedule. A Meta accepted, delivered or read state is not the teacher's explicit acknowledgement.
- Private timetable links are bearer capabilities: no Google sign-in, repeat access until seven days after issuance, no expiry merely from opening. Reading or link previewing must not acknowledge. Changed published duties require acknowledgement of the current version.
- Missing timetable can be a valid absence-reporting condition. A failed timetable read is an error, not proof that no timetable exists.

## 3. Adapt for another school before bootstrap

Use a new Google/Cloudflare/Meta resource set. Do not copy production staff data or credentials to create a new instance. Record every replacement in your installation inventory.

| Area | Actual adaptation required |
| --- | --- |
| School identity | The four non-Calendar Pages identity functions check `hd` and the email suffix against `gsps.edu.sg`; Calendar uses `GSPS_DOMAIN`. Contacts backend validates the same school email domain. Calendar's `CALV2.DOMAIN` and other server checks must agree. Change these in maintained source and verify both permitted and rejected accounts. There is no general `SCHOOL_DOMAIN` environment switch. |
| Contact schema | Headers and code use `GSPS Alias (@gsps.edu.sg)`, iCON and CES aliases. Name derivation, email creation, access validation, signature branding and VCF prefix `GSPS` are school-specific. Either retain compatible internal headers with an explicitly adapted domain contract, or migrate all readers/writers together. A sheet header rename alone breaks the contract. |
| Navigation and branding | Review `shared/viewports.js`, each viewport's links/assets, titles, privacy information, email signatures and public URLs. Some existing catalogue entries use GSPS `pages.dev` origins. Update all actual origins and rebuild copies. |
| Planning seed | `backend/Seed.gs` contains GSPS classes, groups, subjects, venues and defaults. First-version creation is not an import of another school's real deployment. Replace the seed or fully replace/review its data before publication. Never publish the sample unchanged. |
| Layout | The supplied campus model and geometry are GSPS-specific. A new venue register alone does not draw another campus. Adapt the model, unit geometry and any legacy unit corrections with consistent unit IDs; test search, selection, floor placement and published allocations. |
| Calendar | Change seeded Shared Drive/calendar IDs, URLs, lanes, dates and school structure. `CALV2.TZ`, UI defaults and scheduled Roster logic assume Singapore. Another timezone requires a source review, not just changing the Apps Script timezone field. |
| Workload | Review roles, employment modifiers, period lengths, offload, subject categories, weekly caps, SIUE and school budgets. This is a school policy configuration, not a legal or HR interpretation by the software. |
| WhatsApp | Template bodies/buttons contain GSPS URLs and must match the contracts exactly. Adapt source contracts and hashes, rebuild both sending surfaces, submit the school's exact new templates, then verify approval. Old template IDs/approval observations are not portable. |
| Resource defaults | Explicitly set every workbook/folder ID below. Contacts and Roster retain legacy fallbacks for the existing school; a blank property must not accidentally select them. |

No general campus builder or one-click multi-school migration is included. Supported blank bootstrap functions exist for Contacts, Deploy and Calendar. Roster creates its own correctly shaped records through supported first writes. Do not construct an empty `{}` operational file by hand.

## 4. Create the Google resources

Use a school-managed execution account with durable ownership and recovery, not an individual's disposable account. Keep resource IDs, project script IDs, deployment IDs/URLs, installed versions and owner emails in a restricted installation inventory. Store secrets in the platform's secret/property mechanism rather than that general inventory.

1. Create an empty **Contacts** spreadsheet.
2. Create an empty **Deploy** spreadsheet.
3. Create an empty **Calendar** spreadsheet.
4. Create a **venue register** spreadsheet with a tab named exactly `Venues`.
5. Add the venue headers below and values for the real school.
6. Create a private **GSiS Roster** Drive folder with **PreviousTimetables** and **OperationalData** subfolders.
7. Give the execution account the required read/write access to these resources. Staff do not need direct access to operational JSON.
8. Create the staff and parent Google calendars and output folder if those Calendar sync/export capabilities will be used.

The venue register accepts these exact headers (the reader locates them by name):

```text
Unit number | Venue name | Short name | Block | Level | Capacity | Capacity basis | Notes
```

A unit must match one capital block letter, numeric level, hyphen and an alphanumeric suffix, for example `A2-01`. Block `A` and level `2` must agree with that unit. Venue name is required. Capacity is blank or a nonnegative integer. Unit numbers are unique. Store values, not formulas. `LANDMARK_UNIT_GEOMETRY` is an optional JSON Script Property mapping unit numbers to supported geometry records; it does not generate an entire school model.

### Apps Script manifest configuration

Open **Project Settings → Show appsscript.json manifest file in editor**. Use the manifest for that project below, preserving any independently required reviewed settings. Apps Script Advanced Services must be enabled; when using a standard Google Cloud project, also enable the matching APIs there. Re-authorise the execution account after a scope change. The `.gs` file does not embed its manifest.

**Deploy and Roster: exact shared source manifest.** Use it in each of those separate projects:

```json
{
  "timeZone": "Asia/Singapore",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.send_mail"
  ],
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Sheets",
        "serviceId": "sheets",
        "version": "v4"
      },
      {
        "userSymbol": "Drive",
        "serviceId": "drive",
        "version": "v3"
      }
    ]
  },
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

**Contacts:** the following complete manifest enables its Sheets v4 service. Scopes are automatically inferred from the complete source; do not introduce an incomplete explicit scope list.

```json
{"timeZone":"Asia/Singapore","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER","dependencies":{"enabledAdvancedServices":[{"userSymbol":"Sheets","serviceId":"sheets","version":"v4"}]},"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}
```

**Calendar:** the following complete manifest incorporates the source's Sheets/Calendar advanced-service fragment. Scope discovery remains automatic from the complete Calendar source, including its Drive/export and Calendar operations. This is deliberately not the Deploy manifest.

```json
{"timeZone":"Asia/Singapore","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER","dependencies":{"enabledAdvancedServices":[{"userSymbol":"Sheets","serviceId":"sheets","version":"v4"},{"userSymbol":"Calendar","serviceId":"calendar","version":"v3"}]},"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}
```

The source's web-app model is **Execute as Me** (the deploying school account), **Who has access: Anyone**. Cloudflare verifies the user and signs backend calls; the public backend rejects unauthenticated application requests. If school policy prohibits this deployment model, do not weaken authentication or substitute a different execute-as mode without redesigning the integration. Google describes the current web-app deployment flow at [Apps Script web apps](https://developers.google.com/apps-script/guides/web).

## 5. Bootstrap the four backends, in order

All ID properties below contain an ID, not a full Drive URL. Backend API properties contain the published URL ending in `/exec`, not the editor URL or `/dev`.

### A. Contacts

1. Create a standalone Apps Script project and paste `Contacts_Backend_v0.8.7.gs`.
2. Apply the Contacts manifest and enable Sheets v4.
3. In Script Properties set `CONTACTS_SHEET_ID` to the new empty Contacts workbook ID.
4. Set `ADMIN_EMAIL` to the initial administrator's school email and optionally `ADMIN_NAME`.
5. Run `setupBlankContacts()` and approve the requested scopes with the execution account.
6. Run `setupGSiS()` to validate setup. It retains or creates `BRIDGE_SECRET`; record it privately for the matching connections.
7. Run `prepareContactsPerformance410()` before enabling directory editing. Keep its preparation backup.
8. Choose **Deploy → New deployment → Web app**, apply the execution/access settings above and copy `/exec`.
9. Configure Contacts Pages in section 6. Use its supported Admin controls to complete roles and the real staff directory, then grant the initial planner KP application access as well as Admin.

Blank setup refuses a populated workbook. It creates a minimal Teacher role and the first application Admin; it does not invent the school's role catalogue or grant SMC membership. Keep stable Staff IDs unique and never recycle them. Timetable names must be unique after case/space normalisation. Keep mobile numbers valid and resolve duplicate identities rather than creating another record to bypass a collision.

### B. Deploy and Layout

1. Create a different standalone project and paste `Deploy_Backend_v0.8.7.gs`.
2. Apply the Deploy/Roster manifest; enable Sheets v4 and Drive v3.
3. Set `DEPLOY_SHEET_ID` to the new Deploy workbook.
4. Set `CONTACTS_API_URL` and `CONTACTS_BRIDGE_SECRET` to the Contacts `/exec` and its bridge secret.
5. Set `LANDMARK_SHEET_ID` to the new venue register workbook.
6. Run `setupDeploy()`. It creates `deploy_index` and `deploy_documents`, an empty version index and a bridge secret if missing.
7. Run `setupLandmarkDeploy()` and resolve invalid venue headers or values before continuing.
8. Deploy as a web app and set `DEPLOY_WEB_APP_URL` to its own `/exec` for diagnostics.
9. Use this URL and this project's `BRIDGE_SECRET` in both Deploy and Layout Pages.
10. Optionally set Contacts' `DEPLOY_API_URL` and `DEPLOY_BRIDGE_SECRET` to this published Deploy service for its active-teaching integration.

The current Deploy-only role starts without Roster folder configuration. Do not run `setupDeploy()` inside the Roster project. Setup creates storage, not a trustworthy school deployment. Review the seed before the first version is created and published.

### C. Calendar

1. Open the new Calendar spreadsheet and select **Extensions → Apps Script**. It must be a bound project: its source uses `SpreadsheetApp.getActiveSpreadsheet()`.
2. Paste `Calendar_Backend_v0.8.7.gs`, apply the Calendar manifest and enable Sheets v4 and Calendar v3.
3. Set a new private `CALENDAR_PROXY_SECRET` in Script Properties.
4. Run `setupCalendarV2Workbook()` and authorise the school account.
5. Review the initial Users row, seeded from the installing account, and grant the intended Calendar administrators/parent publishers.
6. Replace the seeded folder/calendar IDs and URLs through the Calendar settings. Do not sync against the supplied GSPS defaults.
7. Enter the real year, terms, school weeks, holidays and exceptions; check them, then release the year to teachers.
8. Deploy as a web app and record `/exec`.

Setup supplies and validates the application tabs, headers and defaults. Existing RC1.9 installations retain their schema marker; v0.8.7 does not mean re-create the workbook. The source's `upgradeCalendarToRC19()` is for a genuinely older supported schema, not a routine upgrade ritual. Roster needs a **released and correctly structured** Calendar year for verified school-day decisions.

### D. Standalone Roster

1. Create the fourth project and paste `Roster_Backend_v0.8.7.gs`.
2. Apply the Deploy/Roster manifest and enable Sheets v4 and Drive v3.
3. Set `DEPLOY_SHEET_ID`, `CONTACTS_API_URL` and `CONTACTS_BRIDGE_SECRET` to this school's published sources.
4. Set all three `ROSTER_ROOT_FOLDER_ID`, `ROSTER_ARCHIVE_FOLDER_ID` and `ROSTER_DATA_FOLDER_ID` to the folders created in section 4.
5. Generate a private `BRIDGE_SECRET` for this Roster backend and a separate `ROSTER_SERVICE_SECRET`. Set the latter also in Contacts Script Properties.
6. Leave `ROSTER_INDEX_FILE`, `ROSTER_OPERATIONS_FILE`, `ROSTER_INBOX_FILE` and `ROSTER_NOTIFICATION_TRANSPORT_FILE` **unset only for this blank installation**. Supported writes create the right structures.
7. Run `authoriseRosterWrites()` to authorise and check access; run `authoriseRosterMail()` to authorise MailApp and check its quota without sending an email.
8. Copy this project's **Script ID** from Project Settings to `ROSTER_OWNER_SCRIPT_ID`.
9. Set `ROSTER_WRITER_ENABLED=true` only after verifying that no other project writes this instance's Roster data.
10. Run `showBackendOwnership()`. Expect `kind:"roster"`, `rosterEnabled:true` and `rosterOwnerMatches:true`.
11. Deploy as a web app. Set `ROSTER_WEB_APP_URL` to this project's own `/exec`.
12. Use this URL in Roster Pages and the notification Worker. Run `checkRosterAccess()` and `diagnoseRoster()` and resolve current failures.
13. Set `ROSTER_PUBLIC_ORIGIN` to this school's HTTPS Roster origin, without a path, for dated email links. The authenticated Worker also supplies its configured origin.
14. Keep **Execute as Me** under the same school execution account. Notification transport records the effective owner email and script ID; changing the execution identity requires a reviewed migration, not a new user-specific deployment.

The writer is fail-closed when disabled or owned by another script ID (`ROSTER_OWNER_INACTIVE`). The enabled flag is not a substitute for stopping an old unguarded writer. Roster uses the published Deploy workbook; duplicating that workbook to bypass a failed read would create a different authority.

## 6. Set up the five websites

Create five Cloudflare Pages **Direct Upload** projects. Upload the matching frontend ZIP. A dashboard ZIP with root `_worker.js` is supported; the package already includes it. Do not upload the outer suite ZIP. Add your intended custom domains and wait for them to work before configuring school sign-in. See [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Create a Google OAuth **Web application** client. Configure its consent branding and add each actual website's scheme and hostname to **Authorised JavaScript origins**, with no path. The suite uses the Google Identity Services browser credential flow; do not substitute an Apps Script URL as a browser origin. See [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

### Production variables and secrets

For each Pages project use **Settings → Variables and Secrets → Production**. A secret below must be encrypted. Production and Preview have separate settings. Redeploy after changing bindings so the new deployment receives them. Never give a preview site production message-sending credentials by accident.

| Project | Plain variables | Encrypted secrets |
| --- | --- | --- |
| Contacts | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL` = Contacts `/exec` | `BRIDGE_SECRET` = Contacts bridge |
| Deploy | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL` = Deploy `/exec` | `BRIDGE_SECRET` = Deploy bridge |
| Layout | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL` = Deploy `/exec` | `BRIDGE_SECRET` = Deploy bridge |
| Calendar | `GOOGLE_CLIENT_ID`, `CALENDAR_APPS_SCRIPT_URL` = Calendar `/exec` | `CALENDAR_PROXY_SECRET`, independent `CALENDAR_SESSION_SECRET` |
| Roster | `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL` = Roster `/exec`, `CALENDAR_APPS_SCRIPT_URL` | `BRIDGE_SECRET` = Roster bridge, `CALENDAR_PROXY_SECRET`, `ROSTER_SERVICE_SECRET`, `EXTERNAL_LINK_SECRET` |

Create independent high-entropy bridge, service, session and link secrets. The non-Calendar bridge/session gate requires a bridge secret at least 32 characters long; use a password manager's strong generated values. Preserve them on upgrades. `EXTERNAL_LINK_PREVIOUS_SECRET` is an optional previous signing key on **both** Roster Pages and the Worker during a deliberate seven-day overlap. New links use the current key. Do not rotate keys to fix a version number.

Do not place an interactive Cloudflare Access wall across all routes. Public Layout, privacy assets, the Meta webhook and token-scoped `external.html` / `/api/external` must work for their intended external users. Protected staff APIs and Inbox attachments still enforce application authority. Test both access and denial rather than making the operational folders public.

### Load the school data

1. Complete Contacts identities, groups and access.
2. Create the initial Deploy version with Admin + KP access. Enter real classes, TGs, venues and assignments; review employment/workload rules.
3. Save and publish that checked Deploy version with valid dates. Verify current R export and source version.
4. Release the corresponding Calendar year and check odd/even week and school-day context.
5. As Roster Admin, upload a supported baseline workbook, preview its period/time structure, resolve clashes and map names to Contacts before saving validity dates.
6. SENOs or other ad hoc timetable-only people outside the main eligible relief pool must not block verification merely because they have no numeric R. An eligible pool member's missing required R remains a real error.
7. Set the dated SMC duty lists, System Config, notification rules and daily email-report recipients.
8. Confirm a controlled day's online save, published teacher view and role restrictions before activating automation.

## 7. Notification Worker, WhatsApp and private media

### Install with sending paused for a new school

Create a **separate Cloudflare Worker**, paste the entire `Roster_Notification_Worker_v0.8.7.txt` into its module editor and deploy. A normal browser request to it may return 404; it is a scheduled service and authenticated Queue-wake endpoint, not the Roster website. Enable observability. Add **Settings → Triggers → Cron Triggers → `* * * * *`**. Cron executes in UTC; application scheduling uses Singapore time. [Cloudflare Cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) explains propagation and event logs.

Initial safe values (plain variables) for a **new** installation:

```text
WHATSAPP_ENABLED=false
ROSTER_AUTOMATION_ENABLED=false
WHATSAPP_MENU_ENABLED=false
WHATSAPP_INBOX_ALERTS_ENABLED=false
WHATSAPP_DIAGNOSTICS_ENABLED=false
WHATSAPP_TEMPLATES_JSON={}
```

For an upgrade, follow the short sending pause and migration order in section 9, then restore the intended flags. Copying a default configuration over active settings can pause the service.

Set the following in **both Roster Pages and the Worker**, unless stated otherwise:

| Name | Value and handling |
| --- | --- |
| `APPS_SCRIPT_URL` | Standalone Roster `/exec` |
| `CALENDAR_APPS_SCRIPT_URL` | Calendar `/exec` |
| `CALENDAR_PROXY_SECRET` | Secret matching Calendar |
| `ROSTER_SERVICE_SECRET` | Secret matching Roster and Contacts |
| `EXTERNAL_LINK_SECRET` | Dedicated secret shared by these two Cloudflare projects |
| `EXTERNAL_LINK_PREVIOUS_SECRET` | Optional previous link key during planned rotation only |
| `ROSTER_PUBLIC_ORIGIN` | Actual HTTPS Roster origin, without a path |
| `CONTACTS_PUBLIC_URL` | Actual HTTPS Contacts URL |
| `WHATSAPP_PHONE_NUMBER_ID` | School sender's Meta phone-number ID |
| `WHATSAPP_TEMPLATE_ACCOUNT_ID` | WhatsApp Business Account used to retrieve template approval |
| `WHATSAPP_ACCOUNT_ID` | Expected actual signed webhook `entry.id`; do not assume another account ID is interchangeable |
| `WHATSAPP_API_VERSION` | Supported Graph API version including `v`; preserve the currently verified version when upgrading |
| `WHATSAPP_ACCESS_TOKEN` | Secret system-user token with required account/phone access |
| `WHATSAPP_APP_SECRET` | Secret for verifying Meta webhook signatures |
| `WHATSAPP_VERIFY_TOKEN` | Secret matching the callback challenge configuration |
| `WHATSAPP_TEMPLATES_JSON` | Compact route map from appendix A, enabled only after exact approval |

Roster Pages additionally retains its basic Google/bridge settings. The timer signs service requests and does not sign in as a teacher. In Roster Script Properties, optional `ROSTER_NOTIFICATION_ADMIN_IDS` is a comma-separated list of actual Admin Staff IDs for Contacts-review WhatsApp alerts; it is not the new delivery-review email recipient list.

### Configure Meta and the Inbox

1. Configure the school's Meta business app, WhatsApp Business Account and registered sender with the required access token permissions. Keep credentials private.
2. Set callback URL `https://YOUR-ROSTER-HOST/api/whatsapp/webhook`, use the matching verify token and subscribe the school account to **messages**.
3. Verify an actual signed callback matches the configured account and phone IDs. A successful challenge alone does not prove message ingestion.
4. Create a **private** R2 bucket and bind it to **Roster Pages** as `WHATSAPP_INBOX_MEDIA`. No public bucket URL is needed. The scheduled Worker does not need this binding.
5. Redeploy Pages after binding/settings changes.
6. Submit and approve the exact needed template bodies, languages and buttons. Appendix A contains all shipped contracts and parameters; historical `PENDING` or `APPROVED` observations are not today's provider status.
7. For a deliberately paused test window, `WHATSAPP_DIAGNOSTICS_ENABLED=true` on the Worker produces read-only connection checks in logs. Restore false before expecting normal processing; diagnostic mode replaces the normal timer work.
8. Enable only verified routes and intended flags. Confirm one specifically authorised end-to-end test before wider operational use.

Meta requires template approval before template sends. A button variant is a separate exact contract; preparing it in code is not submitting, approving or activating it. See [template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review) and [template management](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management). The incoming/status callback model is documented at [WhatsApp webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).

Inbox supports incoming text, voice and JPEG/PNG. Image retrieval validates type, bytes, integrity and the 5 MiB maximum before private storage. Unsupported attachments remain unavailable records. The app cannot recover old messages that never reached its webhook. If uncached provider media is no longer available, it cannot invent the image. Ordinary human replies are queued and remain subject to the current 24-hour customer-message window; later contact requires a supported approved template.

All eligible SMC/Admin can use Inbox. New-message duty alerts go only to current eligible duty SMC. Optional WhatsApp Inbox alerts use `gsis_inbox_new_message_v1` in `en_GB`; leave `WHATSAPP_INBOX_ALERTS_ENABLED=false` until that exact optional template is approved. In-app alerts do not need it.

### Flags are separate controls

| Control | What it changes |
| --- | --- |
| `WHATSAPP_ENABLED` | WhatsApp capture/sending gate; disabling it also pauses new Inbox capture, while saved conversations remain readable |
| `WHATSAPP_DIAGNOSTICS_ENABLED` | Worker read-only diagnostics instead of its normal timer cycle |
| `ROSTER_AUTOMATION_ENABLED` | Scheduled automation service gate, separate from ordinary human Inbox reply support |
| System Config Scheduled automatic allocation | Whether scheduled allocation changes drafts; manual Auto-allocate and other notification/report workflows are separate |
| System Config Verbose logging | Optional detailed decision capture and Drive text/evidence export only |
| `WHATSAPP_MENU_ENABLED` | Optional contact menu, not template-notice eligibility |
| `WHATSAPP_INBOX_ALERTS_ENABLED` | Optional dedicated duty-SMC WhatsApp alerts |

Before enabling the menu, set Pages' `WHATSAPP_CURRENT_RELIEF_URL`, `WHATSAPP_LAYOUT_URL`, `WHATSAPP_LORD_URL` and `GENERAL_OFFICE_PHONE` to verified school destinations. The report-absence menu opens its HTTPS destination; it does not migrate or submit absence records. Leave the menu off when those destinations are unknown.

### Enable prompt manual notification dispatch

The Queue is the recommended configuration for “Send WhatsApp” to start promptly after the publication commit. The HTTP request only requests a durable wake. Actual preparation, provider calls and result settlement run in the Queue consumer or minute scheduler, so closing a browser does not truncate an accepted batch.

1. In Cloudflare, create a Queue, for example `gsis-roster-notifications`.
2. Open the **notification Worker → Settings → Bindings** and add a Queue producer binding named exactly `NOTIFICATION_QUEUE`, pointing to that Queue.
3. On the Queue, add the same notification Worker as its consumer. Start with maximum batch size **10**, maximum batch wait **1 second**, and maximum concurrent invocations **1**. Equivalent Wrangler consumer keys are `max_batch_size: 10`, `max_batch_timeout: 1`, `max_concurrency: 1`.
4. Deploy the complete notification Worker with that binding. Keep its one-minute cron; Queue wakes do not replace scheduled allocation, reports or recovery.
5. In **Roster Pages → Production variables**, set `NOTIFICATION_DISPATCH_URL` to `https://YOUR-NOTIFICATION-WORKER/dispatch`.
6. Ensure Pages and the Worker have the same encrypted `ROSTER_SERVICE_SECRET`, at least 32 characters. The endpoint validates an HMAC, a purpose and a timestamp; it is not an unauthenticated send URL.
7. Redeploy Roster Pages so the binding is available, then use a deliberately authorised test publication and recipient. Check durable queue acceptance, provider submission and delivery as separate outcomes.

If the dispatch URL/Queue is absent, the accepted notice stays durable and the minute scheduler drains it on a subsequent tick. A queued wake is not proof that Meta accepted or delivered a message. Queue delivery can repeat; stable outbox IDs, prepare claims and result receipts protect the send path. A prepared send whose outcome is uncertain is held for reconciliation, not automatically retried.

`WHATSAPP_SEND_CONCURRENCY` and `WHATSAPP_SENDS_PER_SECOND` each default to **12**, with a code ceiling of **20**. Set them lower if this sender's verified provider allowance or operational observations require it. The dispatcher also enforces a durable six-second gap for the same recipient and provider cooldowns after throttling. These are application ceilings, not a grant of provider capacity. A lower Meta/account limit still wins. Do not increase limits to work around template, recipient or quota failures.

The Queue consumer drains bounded batches for up to four minutes per invocation; backend claims, per-recipient pacing and result settlement remain authoritative. It does not issue actual message sends from the short-lived Pages HTTP background task.

### Delivery review emails in 0.8.7

WhatsApp Readiness is removed. The backend reports actionable delivery issues to active Admins with valid, uniquely owned email addresses. Identical polls are suppressed. After **every current required Admin recipient** has a confirmed sent receipt for the exact current issue snapshot, the matching active review alert closes automatically. The WhatsApp failure/uncertainty, attempts and provider history remain in the transport record. Emailing an alert does not change a failed or uncertain WhatsApp into delivered.

An uncertain email submission does not count as sent. Changed issue fingerprints, a new attempt/outcome or a genuine reopened issue need their own report. Historical email jobs lacking the exact issue binding cannot be treated as proof that today's issue was reported. This path continues when verbose logging is Off. Run `authoriseRosterMail()` if the execution account needs the email scope. Do not infer delivery success from an absent review warning.

## 8. Acceptance checks before routine use

Run controlled tests on the intended installation with the service owner's chosen recipients. Local unit checks cannot establish Google permissions, actual mail quota, peak latency, Meta approval or delivery.

| Check | Expected result |
| --- | --- |
| Identity | School account admitted with its actual role; wrong-domain and unauthorised staff API requests denied |
| Source ownership | Four correct backend projects; Roster owner diagnostic true/true; Deploy/Layout and Roster point at their respective services |
| Calendar/Deploy/baseline | Verified school day, applicable dates, correct week parity, in-force quota source and mapped timetable |
| UT limit | UT at full actual 26-period cap has R=0 in Deploy and Roster; missing cap metadata does not pass verification |
| Absence without baseline | Full-day or timed absence recorded without initial instructions; same record later editable through Manage my absences |
| Period refresh | Inline yellow progress; latest selected date wins; inputs/caret retained; failed read is not treated as empty |
| Two planners | Different changed cells merge; same-cell conflict is explicit; both drafts survive; same request retry has one effect |
| SMC protection | Assignment, clear and No relief required survive automatic allocation; Return to automatic explicitly releases ownership |
| New exclusions | Exact/wildcard subjects break only consecutive counting; occupied slots and full workload remain counted |
| Verbose Off | Online writes work, no new optional detailed log export/backlog, existing logs retained, essential receipts/audit remain |
| Teacher visibility | Confirmed upcoming suspension list and read-only preview; no unconfirmed working plan, private reasons or Relief Load |
| Publication | Saved plan and published plan remain distinct; an authorised overwrite can be released after prior publication |
| Notice eligibility | Unchanged and fully absent teachers excluded; partial absence compares present periods only |
| Private link | No sign-in; repeated opens before fixed seven-day expiry; explicit acknowledgement shown in Daily Notify |
| Inbox | Signed inbound text/image/voice captured; SMC/Admin view allowed, ordinary teacher/signed-out media denied; queued reply status observable |
| Delivery email | A controlled actionable issue reaches intended Admin addresses once; duplicates suppressed; later material change/reopening handled |
| Export | Assign Relief Excel reflects the loaded local draft without a required network save/verification |
| Contacts | `add` / `+` produces a valid one-contact VCF; import tested on actual Android/iOS devices |
| Deploy switching | Version overlay clears on success/failure; stale response cannot replace new selection; draft remains safe |

Do not test with Notify All unless every affected recipient is intentionally included. Choosing a test duty SMC only controls duty-SMC alerts, not teacher notices or Admin contacts-review recipients.

## 9. Upgrade and, only if needed, complete the split

### Existing v0.8.4+ split installation

This upgrade keeps the existing four Apps Script projects. Do **not** create a fifth project or a replacement operations file. Plan the cutover outside the busy absence-reporting period where practical. Notification sending pauses for the one-time six-minute migration drain; ordinary Roster use is intended to remain available after its matching backend/frontend are installed.

1. Back up the workbooks, private Drive stores, Script Properties, current Worker/Pages settings and deployment inventory. Keep the previous release and unresolved request IDs.
2. Ask planners to retain local drafts and resolve in-flight saves where possible. Do not clear browser storage to prepare the upgrade.
3. Open the old **notification Worker → Triggers** and temporarily remove/pause its one-minute cron. Record the exact schedule so it can be restored. Pause any existing Queue consumer too. Stop duplicate notification Workers and old Apps Script allocator triggers that write this same Roster instance. Do not delete unrelated integrations.
4. Allow any already-running legacy send to finish. The new backend adds its own six-minute drain after initialisation; it cannot remotely stop an older deployment that remains in use.
5. In the existing Contacts project, replace its complete code with `Contacts_Backend_v0.8.7.gs`, save, then choose **Deploy → Manage deployments → Edit → New version → Deploy**. Keep its existing `/exec` URL.
6. Repeat for Calendar with `Calendar_Backend_v0.8.7.gs`, then Deploy with `Deploy_Backend_v0.8.7.gs`. Deploy/Layout retain their existing shared backend. Do not copy Roster code into either project.
7. Open the existing standalone **Roster** project. Replace the complete deployed source with `Roster_Backend_v0.8.7.gs`. Remove accidental duplicate full source copies in helper files such as `DeliveryAlert.gs`; one global function definition must have one intended implementation. Preserve genuine helper/recovery files only after checking for duplicate function names.
8. Preserve all operational file IDs, secrets, owner settings and the existing `ROSTER_STAPLER_LEASE:*` compatibility metadata. Leave the new `ROSTER_NOTIFICATION_TRANSPORT_FILE` unset unless this installation has already created it. Never point it at `ROSTER_OPERATIONS_FILE` or create an empty JSON file manually.
9. Check `ROSTER_OWNER_SCRIPT_ID` is the current Roster project's Script ID and `ROSTER_WRITER_ENABLED=true`. Run `showBackendOwnership()` and require `kind:"roster"`, `rosterEnabled:true`, `rosterOwnerMatches:true`. Keep **Execute as Me** with the same school account.
10. Set/verify `ROSTER_PUBLIC_ORIGIN` for dated email links. Retain/re-authorise `script.send_mail` as needed; `authoriseRosterMail()` checks authorisation/quota without sending.
11. Save and update the **existing Roster deployment** with **New version → Deploy**. Keep the same `/exec` URL used by Roster Pages and the notification Worker. Do not leave another old endpoint or project actively writing the same data.
12. Upload the five matching frontend ZIPs to their existing Pages projects. Preserve their production variables/secrets and private R2 binding. Refresh a test teacher tab and check Report Absence before wider use.
13. Replace the separate notification Worker with the entire v0.8.7 Worker text. Preserve secrets and intended flags. Add the Queue producer/consumer and Pages `NOTIFICATION_DISPATCH_URL` as described in section 7 if prompt manual dispatch is required.
14. Restore the one-minute cron and intended Queue consumer. On the first transport operation, the backend creates **Roster notification transport.json**, records its owner and sets a six-minute `readyAt`. During this interval new sends report `migration-drain`; they remain queued. Result/callback settlement can still record outcomes. Do not reset the file or click Send repeatedly.
15. After `readyAt`, a subsequent transport operation imports final legacy outcomes and marks migration complete. Check Worker logs for transport readiness and the source version. The 44 unconfirmed prepared sends remain uncertain unless stronger provider evidence arrives; migration does not requeue them.
16. Repeat targeted acceptance checks: two simultaneous new absence reports, one lost-response retry, an SMC local edit/save during a controlled notification batch, published teacher view, exact acknowledgement and Queue/cron duplicate protection. A test must use intentionally authorised recipients.
17. Resume routine use once the checks pass. Record the installed versions, transport file ID and execution owner. Do not reset historical relief counters or run allocation merely to repair a warning.

If sending cannot settle during the cutover, pause its Queue/cron while keeping the current Roster backend available for absence reporting and planning. Retain the transport file, pending claims and both store backups for diagnosis. Rolling back to a pre-transport Roster backend is not a complete rollback: it does not understand the independent delivery authority and can resend legacy intents. Use a compatible forward fix or a reviewed reconciliation plan.

### Only for an installation still using an old combined Roster/Deploy writer

A second enabled writer is unsafe even if its new project has a separate lock. Two project locks do not protect one shared file from each other.

1. Pause the scheduled service and arrange a short no-write window; retain drafts and allow current executions to finish.
2. Back up all properties and data.
3. Update the old Deploy service to the role-guarded Deploy artifact; retire or disable every still-reachable older unguarded deployment and any old Roster-writing triggers.
4. Create the standalone Roster project with its complete artifact and manifest.
5. Copy the existing operational resource IDs and relevant settings/secrets, including `ROSTER_INDEX_FILE`, `ROSTER_OPERATIONS_FILE`, `ROSTER_INBOX_FILE` and existing recovery/audit metadata. Do not make a new blank store.
6. Keep `ROSTER_WRITER_ENABLED=false` while checking access and ownership. `ROSTER_OWNER_SCRIPT_ID` must be the **new** project ID, never the copied old owner.
7. After the old writer has stopped, enable the new owner and verify `showBackendOwnership()`.
8. Publish its `/exec`; route only Roster Pages and the notification Worker to it. Deploy/Layout retain the Deploy `/exec`.
9. Check existing records, pending receipts, quota and duty context, then resume the intended flags and planner access.

Normal v0.8.7 scheduled work belongs to the **one Cloudflare minute Worker**, not duplicate Apps Script allocator triggers. Inspect any pre-existing trigger before removing it; do not delete unrelated school's integrations. Current Stapler editing does not need an exclusive lease. Retain legacy `ROSTER_STAPLER_LEASE:*` properties and other compatibility/recovery metadata rather than deleting them as a speed fix.

## 10. Read/write performance and data contracts

Roster Home also reads the current Singapore day’s verified SMC Duty Roster after the icons render, without adding an initial profile-loading dependency. All teachers can see the duty names as ordinary text above the icons and use `https://contacts.gsps.edu.sg` to look up phone numbers. The read exposes no phone-number payload and grants no teacher editing rights to duty records. A verified empty roster and an unavailable read have distinct, honest states. A school adaptation must update the Contacts destination along with the other school URLs.

After Roster home icons render, the client fetches two compressed batches for Singapore today through **today + 30 days inclusive**. Baselines come first. Authorised saved suspended plans follow: teachers get confirmed snapshots, while authorised planners may get working plans. Decompression and local manipulation use bounded client RAM. Compressed baseline and suspended snapshots, and immutable baseline models, can use bounded account/permission-scoped IndexedDB. A current authorised manifest response must validate the persisted snapshot before it is installed; sign-in is never bypassed by a cache hit. Baseline and suspension stages have separate keys, and changed/deleted dates invalidate their relevant data. Role changes and sign-out invalidate that scope. A browser storage failure falls back to server reads and must not create an empty authoritative model.

This preload does not grant teachers draft access, pre-send notices, or make writes offline. Current permissions, absence, quotas, revisions, input sources and publication still receive server checks. Compressing data reduces transfer; it does not eliminate Drive latency or the final commit lock.

| Store | Commit/recovery boundary |
| --- | --- |
| Contacts | Stable IDs, narrow changed ranges, data epochs, durable save journal and receipt recovery |
| Deploy | Field-level changes, script lock, durable journal and index commit marker; reads reject unfinished commits |
| Calendar | Mutation IDs, bounded batched Sheets changes and explicit sync state |
| Roster | Accepted absence/allocation/audit/notification intent committed together in operational JSON; repeated request returns its receipt |
| Stapler | Original/local/online cell comparison; independent edits merge, same-cell conflicts remain for explicit review |
| Notification transport | Separate Drive document and owner UserLock hold mutable delivery claims/results, review emails and delivery alerts; ordinary delivery never writes the allocation document |
| Provider dispatch | Durable frozen intent, unique preparation and batch result/callback; an uncertain network send is held for investigation |

These are separate transactions, not a cross-service database transaction. Publishing Deploy, updating Contacts, writing Roster and delivering an email/WhatsApp cannot all roll back together. Do not promise exactly-once external delivery. A timeout does not establish that a save failed. Reuse the original request identity through the supported recovery control.

### Workload and allocation

`R` is weekly relief capacity in periods, not a count of currently free slots. The workload calculation includes FTT, PD, duties and other countable non-teaching activity once, plus teaching with the configured SIUE/offload factors. The resulting budget headroom is converted using the configured timetable factor, capped by employment headroom and rounded down. For **UT**, employment cap headroom now uses full actual countable periods. Other cap bases remain unchanged. Timetable blocks mark unavailable slots; they do not get subtracted a second time from R.

Automatic allocation maximises valid cover within hard constraints before applying enabled business preferences. The configured order matters. The configured business-preference order applies to automatic allocation and manual suggestions. Manual suggestions keep suitability tiers, apply the enabled preferences, and deprioritise candidates already at eight or more actual occupied periods that day, including relief. Blank/recess slots do not count; overlapping Combine activity counts once. This is a soft ordering rule, not a new eight-period hard block. Annual history is preserved. Truly absent history can begin at zero; failed history reads remain errors. Candidate checks include availability, eligible identity, employment/weekly capacity, enabled daily/consecutive constraints and protected manual choices. PAL defaults to the configured same-teacher three-period block; subjects must come from baseline and currently confirmed suspensions, not free text.

Six-consecutive exclusions use `consecutiveCountExclusions:[{"type":"exact"|"wildcard","value":"..."}]`, default `[]`. Matching uses normalised case/spacing and `*` wildcard semantics. The effective lesson subject is matched; an excluded occupied or proposed relief period counts as blank **only for the streak**, breaking it. It does not create a free teaching slot, reduce actual workload or mean “no automatic relief.” The no-auto-relief policy is separate and existing reports retain their captured exclusion policy.

### Absence and acknowledgement concurrency

Absence preparation resolves source models and creates a proposal outside the allocation ScriptLock. The locked commit rechecks current state, source manifests and relevant dependencies before applying attendance and allocation effects together. A changed dependency causes a bounded rebuild; a busy/uncertain response retains the same request ID. New independent absence reports can tolerate unrelated revision changes. Editing an existing absence remains conservative and can require conflict review. This release does not split attendance into another independently writable copy of the allocation data.

Acknowledgement reads are compact and current-account-only. Saving an acknowledgement checks the exact teacher and published notice identity rather than rejecting because another teacher saved a different record. Home and My Relief Duties share the pending request/result on the client. Recovery first checks the original receipt, then replays that exact command if still unconfirmed. A receipt for an older notice never acknowledges a newer publication.

### Statistics and historical coverage

Statistics is restricted to SMC/Admin at the server and in navigation. The date range is inclusive. Each compressed request covers at most 366 days; the UI can load a longer manually chosen range in bounded chunks and accepts it only at a consistent state revision. Sorting, filtering, charts and Excel run on the loaded client data. Exports include all matching filtered rows, not only the visible page; the date matrix export includes every selected date.

| Measure | Meaning |
| --- | --- |
| Absent teacher-days | One teacher on one date, even for a partial absence. Multiple records do not multiply the teacher-day. |
| Known absent periods | Union of recorded periods per teacher/date. No timetable snapshot means an unknown period total, not zero. |
| Relief / Combine | Unique teacher/date/period activity. Drafts and no-relief entries are excluded. Combine remains activity even where its R cost is zero. |
| Scheduled + recorded completed | Published activity and explicitly recorded completions; this does not assert that every past scheduled duty was performed. |
| Recorded completed only | Uses actual completion records. Elapsed time alone does not establish completion. |
| Imported weekly relief | Shown separately. A weekly total cannot be truthfully assigned to individual dates. |

“This week” is Monday through today in Singapore. Past week and Past Fortnight are the previous complete one/two weeks. Past Month and Past Year use the previous complete calendar month/year. Past Term uses the most recently ended released Calendar term. Past Semester derives from released term dates with default term groups `[[1,2],[3,4]]`; change Calendar Script Property `ROSTER_STATS_SEMESTER_TERMS` to an approved JSON list of term-number groups if the school's definition differs. Missing term dates disable the preset rather than guessing calendar months. Manual Start Date/End Date always remains available.

Statistics tracking begins with the first qualifying v0.8.7 domain change. Before pruning operational history, the system preserves compact absence/activity facts. Earlier retained records can produce useful partial figures, but previously deleted data cannot be reconstructed. Coverage marks tracked, preserved, partial, unknown and future dates; missing history must never be treated as a complete zero. The archive increases retained statistics data and must be included in backups/capacity planning.

### Logs and retention

With `verboseLogging:true` (the default for old and new saved settings), the daily optional trail uses `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` under the Roster root, with structured evidence under `Allocation Audit/YYYY/MM/Evidence/YYYY-MM-DD.json`. It explains accepted automatic decisions and online SMC changes. Unsaved browser edits are not online decisions.

With verbose logging Off, new optional detailed decision capture/export stops. Minimal operational audit, manual ownership, committed allocations and receipts continue. Existing files remain. A suppression marker prevents a later burst of logs for the Off interval. This switch does not disable delivery-review email, message status, required write validation or error reporting. Failed optional export must not roll back an accepted online allocation.

### Capacity and maintenance limits

| Source limit | Operational response |
| --- | --- |
| Baseline upload 8,000,000 bytes; register 500 entries | Use supported archive/prune before capacity is exhausted |
| Roster operational JSON and notification transport JSON: 12,000,000 characters each | Preserve history and use authorised maintenance; never replace either with `{}` or point their IDs at the same file |
| Stored Stapler plan 2,000,000 uncompressed bytes; save request guard 1,900,000 bytes | Simplify or investigate oversized plan, do not bypass guard |
| Inbox 20,000 messages; metadata 8,000,000 characters | Plan retention/archiving with the school; existing records remain evidence |
| Deploy index new-write guard 45,000 characters | Use supported version lifecycle and recovery |
| Google and Cloudflare quotas | Check the actual account/plan and current official limits; source tests do not guarantee throughput |

## 11. Diagnose and recover without losing work

| Symptom | Check first |
| --- | --- |
| Sign-in loops or wrong domain | Actual OAuth origin/client ID, adapted domain checks and current authorised account |
| Backend HTML/404 instead of JSON | Recorded `/exec`, correct project/deployment, execute-as and access; saving source alone is not deployment |
| `ROSTER_OWNER_INACTIVE` | Writer flag and exact current Script ID; confirm old owner is stopped before enabling |
| R unverified | Current published Deploy source, baseline identity/eligibility and cap metadata; distinguish support staff outside the pool from missing eligible-teacher data |
| Draft retained / Retry | Keep exact request and local values; use Review or original retry/recovery action; do not discard merely to remove the banner |
| Pending Deploy field commit | Preserve marker and journal; use maintained `recoverFieldCommit()` recovery path, not manual deletion |
| Existing Stapler date fails to open | Preserve record; capture reference/date/version and inspect current diagnostics; do not replace the plan with a blank one |
| Save settings unconfirmed | Use the settings' own Check saved settings recovery for the exact request; unrelated allocations should not invalidate the settings comparison |
| Worker runs but no notice | Migration `readyAt`, Queue binding/consumer, intended flags, current template match, recipient eligibility, due time and outbox status |
| Notification owner changed | Restore the expected execute-as-owner account/project; do not rewrite the recorded owner simply to bypass the check |
| Prepared lease expired | Provider outcome is uncertain. Preserve attempt/claim records and seek Meta/Worker evidence before authorising another send |
| Private link expired unexpectedly | Original seven-day expiry, signing-key agreement/current+previous overlap, complete URL fragment, correct Pages origin/version |
| Image/voice unavailable | Private R2 binding, authorised route, supported media, provider availability and token; preserve message metadata |
| Email missing | Active Admin address/recipient setting appropriate to that report, MailApp authorisation/quota, durable dispatch state and duplicate suppression |
| Calendar display differs from Google | Record save and explicit Staff/Parent sync are separate; inspect sync result and correct destination |
| Old warning persists | Compare timestamps and current check; historical failures may be resolved. A review alert closes only after matching confirmed Admin email receipts, while the delivery outcome remains in history |

Capture action, target date/version, time, request/trace ID and current component version. Redact private links, tokens and unrelated staff data. Do not send raw operational files to public issue trackers.

For recovery: pause the affected writers/sends; preserve current stores, receipts and journals; prefer completing the original request or a compatible forward fix. Restore data only from a known consistent backup with a plan for changes since that backup. A Pages rollback does not roll back Apps Script, Drive, Sheets or already-sent notices. A workbook backup does not include Script Properties, private operational JSON, R2 media or external calendars. Recheck permissions, ownership and pending work before resuming.

## 12. Maintainer and LLM handover

Treat this guide as an orientation, and the matching release source/contracts as implementation authority. Resolve an apparent conflict against source and actual stored state before changing behaviour. Do not infer live approval, delivery, user consent or deployment from a build artifact.

The separate recovery artifact is **`GSiS_v0.8.7_Source_History.bundle`**. It is not a thirteenth member of the full install ZIP. Retain it with your release record: another-school adaptation needs the canonical modules and history, not only the generated deployed files. With Git, Node.js/npm and Python 3 installed, restore the tagged source as follows:

```sh
git clone GSiS_v0.8.7_Source_History.bundle gsis
cd gsis
git switch --detach v0.8.7
npm ci
npm test
npm run build
npm run test:release
```

`npm ci` requires dependency access or a prepared package cache. The release scripts generate matching component artifacts and verify the full package. For a code change, create a branch from the restored tag before editing. Browser checks additionally need the supported test browser setup documented in the source tests; do not count a skipped browser check as passed.

The maintained source separates `Contacts_Code.gs`, `backend/*`, `calendar-backend/Code.gs`, `shared/*`, the five viewport `public` trees and `notification-worker/*`. Complete deployment artifacts are generated. Modify canonical source, update its focused tests, run the repository's actual build/release checks, and inspect the produced package. Avoid patching generated copies alone. Package scripts and test entry points in the source repository define the current build; do not assume a generic npm framework scaffold.

Before editing a shared schema, find every caller: browser model/cache, gateway, Apps Script, service Worker, importer/exporter, email/WhatsApp serializer and recovery tests. Preserve stable identities, idempotency keys, receipts, content/revision binding and server authority. Version a cache key when its semantic contract changes. Keep expensive reads outside final commit locks where safe, then recheck the required authority/state inside the commit boundary. Use changed-cell writes and compare original/current values; never trade correctness for a whole-sheet overwrite.

Measure warm/cold reads, write acceptance, final confirmation and provider delivery separately. Record payload sizes and lock duration as well as elapsed time. Broad compression is suitable for immutable timetable batches; small current operational reads and surgical writes still matter. Do not call an interface responsive merely because it hides its spinner or shows success before acknowledgement of a durable write.

For a release, keep a human-readable account of changed behaviour, meaningful checks actually run, component version alignment and remaining live-service tests. The clean full package intentionally contains only runtime deployables and these two docs. The HTML manual embeds the source-based Archify visual explainer, with no third documentation file. Keep git history, code review and detailed validation in the maintained source record, not as extra files in the deployment ZIP.

### Official platform references

Reviewed for the deployment workflow on 22 October 2026. Dashboard labels can change; preserve the contracts in this guide.

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web) and [versioned deployments](https://developers.google.com/apps-script/concepts/deployments).
- [Advanced Google services](https://developers.google.com/apps-script/guides/services/advanced), [manifests](https://developers.google.com/apps-script/concepts/manifests) and [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).
- [Google Identity Services client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/), [R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/) and [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- [Meta template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review), [management](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management) and [webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).

## Appendix A. Complete notification contract reference

This appendix replaces separate template/config files in the full deployment package. No credentials or live template IDs are required here. Use the named routes and **exact** approved body/language/button contract embedded in the runtime. The shipped text below is GSPS-specific. Changing it requires coordinated source contracts, SHA-256 hashes, rebuilt sending code and Meta approval; editing the environment hash alone cannot authorise a new body.

Start with `{}` to disable all routes. The complete compact disabled mapping below enables you to select routes individually after the matching current provider approval is verified. Change only a deliberately activated route's `enabled` to `true`. Keep JSON compact when pasting into a platform variable with a size limit. Copy the same chosen map into Roster Pages and the notification Worker. Dynamic body values are normalised to a single line to avoid provider linebreak/tab parameter errors; paragraph formatting belongs in the approved template body.

```json
{"mutual_request":{"name":"gsis_relief_request_v1","language":"en_GB","enabled":false,"bodySha256":"e2f88d19f08ce961bf513224028e820d8b6a08f258d36f2ce700d8fadfc7ad36","summaryMaxCharacters":1024},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","enabled":false,"bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","summaryMaxCharacters":1024},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","enabled":false,"bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","summaryMaxCharacters":1024},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","enabled":false,"bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","summaryMaxCharacters":1024},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","enabled":false,"bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","summaryMaxCharacters":1024},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","enabled":false,"bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","summaryMaxCharacters":1024},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","enabled":false,"bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","summaryMaxCharacters":1024},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","enabled":false,"bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","summaryMaxCharacters":1024},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","enabled":false,"bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","summaryMaxCharacters":1024},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","enabled":false,"bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","summaryMaxCharacters":1024},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","enabled":false,"bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","summaryMaxCharacters":1024},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","enabled":false,"bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","summaryMaxCharacters":1024},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","enabled":false,"bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","summaryMaxCharacters":1024},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","enabled":false,"bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","summaryMaxCharacters":1024},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","enabled":false,"bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","summaryMaxCharacters":1024},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","enabled":false,"bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","summaryMaxCharacters":1024},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","enabled":false,"bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","summaryMaxCharacters":1024},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","enabled":false,"bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","summaryMaxCharacters":1024},"stapler_timetable":{"name":"gsis_timetable_updated_v1","language":"en_GB","enabled":false,"bodySha256":"b7ea3b9c0741face4f14e08d84793fe3588a2f010ec8d629d2801db59f3bffcb","summaryMaxCharacters":1024},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","enabled":false,"bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","summaryMaxCharacters":1024},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","enabled":false,"bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","summaryMaxCharacters":1024}}
```

### mutual_request

`gsis_relief_request_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` requesting_teacher_name, `{{3}}` duty_date, `{{4}}` lessons_and_periods, `{{5}}` private_approval_url.

```text
*Peer Relief Arrangement*

Hi {{1}}, {{2}} has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.

Accept or reject using this link: {{5}}.

Thank you.
```

### mutual_override

`gsis_relief_changed_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` change_details, `{{4}}` private_published_duties_url.

```text
*Peer Relief Arrangement Updated*

Hi {{1}}, Relief Team has changed the peer relief arrangement for {{2}}.

{{3}}

View the published arrangement here: {{4}}.

Thank you.
```

### contact_review

`gsis_contact_review_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` request_date, `{{3}}` contact_review_details, `{{4}}` contacts_review_url.

```text
*Contact Details for Ad Hoc External Relief*

Hi {{1}}.

On https://roster.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on {{2}}.

Please review these details as a Contacts Admin:

{{3}}

Review and confirm the details in Contacts: {{4}}.

Thank you.
```

### relief_assignment

`gsis_relief_assignment_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` lessons_periods_venues, `{{4}}` private_timetable_url.

```text
*Relief Assignment*

Hi {{1}}, Relief Team has assigned you relief duties on {{2}}.

{{3}}

View the relief instructions and acknowledge your duties here: {{4}}.

Thank you.
```

### relief_updated

`gsis_relief_updated_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` changed_or_cancelled_duties, `{{4}}` private_timetable_url.

```text
*Relief Assignment Updated*

Hi {{1}}, Relief Team has changed your relief duties for {{2}}.

{{3}}

View your updated timetable and acknowledge the change here: {{4}}.

Thank you.
```

### relief_reminder

`gsis_relief_reminder_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` lesson_period_time_venue, `{{4}}` private_timetable_url.

```text
*Relief Duty Reminder*

Hi {{1}}, your relief duty on {{2}} starts in 20 minutes and has not been acknowledged in Roster.

{{3}}

View the relief instructions and acknowledge your duty here: {{4}}.

Thank you.
```

### relief_unacknowledged

`gsis_relief_unacknowledged_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` assigned_teacher_name, `{{3}}` duty_date, `{{4}}` lesson_period_start_venue, `{{5}}` roster_status_url.

```text
*Relief Duty Not Acknowledged*

Hi {{1}}, {{2}} has not acknowledged the relief duty on {{3}}.

{{4}}

The lesson starts in 10 minutes. Please contact the teacher and confirm cover.

View the current status here: {{5}}.

Thank you.
```

### relief_urgent

`gsis_relief_urgent_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` minutes_remaining, `{{4}}` lesson_period_start_venue, `{{5}}` private_timetable_url.

```text
*Urgent Relief Assignment*

Hi {{1}}, Relief Team has assigned you a relief duty on {{2}} that starts in {{3}} minutes.

{{4}}

Please view the relief instructions and acknowledge your duty now: {{5}}.

Thank you.
```

### relief_urgent_smc

`gsis_relief_urgent_smc_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` assigned_teacher_name, `{{3}}` duty_date, `{{4}}` minutes_remaining, `{{5}}` lesson_period_start_venue, `{{6}}` roster_status_url.

```text
*Urgent Relief Cover*

Hi {{1}}, {{2}} has been assigned relief on {{3}}. The lesson starts in {{4}} minutes.

{{5}}

The duty has not yet been acknowledged. Please check that cover is confirmed.

View the current status here: {{6}}.

Thank you.
```

### relief_evening

`gsis_relief_evening_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` absence_allocation_uncovered_summary, `{{4}}` roster_plan_url.

```text
*Relief Planning Update*

Hi {{1}}, here is the relief planning update for {{2}}.

{{3}}

These allocations are drafts pending publication.

Review the plan here: {{4}}.

Thank you.
```

### relief_morning

`gsis_relief_morning_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` overnight_absence_allocation_summary, `{{4}}` relief_health_summary, `{{5}}` roster_plan_url.

```text
*Morning Relief Summary*

Hi {{1}}, here is the relief summary for {{2}}.

{{3}}

Relief Health: {{4}}

These allocations are drafts pending publication.

Review the plan here: {{5}}.

Thank you.
```

### absence_update

`gsis_absence_update_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` new_absence_count, `{{3}}` duty_date, `{{4}}` additional_periods_allocation_summary, `{{5}}` roster_plan_url.

```text
*New Absence Update*

Hi {{1}}, {{2}} new absence(s) have been reported for {{3}} since the previous update.

{{4}}

Review the latest allocation and publication status here: {{5}}.

Thank you.
```

### relief_manual_review

`gsis_relief_manual_review_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` uncovered_periods_summary, `{{4}}` roster_plan_url.

```text
*Relief Allocation Requires Review*

Hi {{1}}, please review the relief plan for {{2}}.

The final scheduled allocation run is complete.
{{3}}

Please allocate the remaining cover and publish the relief plan here: {{4}}.

Thank you.
```

### capacity_warning

`gsis_relief_capacity_warning_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` capacity_details, `{{4}}` relief_health_summary, `{{5}}` roster_plan_url.

```text
*Relief Capacity Warning*

Hi {{1}}, relief capacity for {{2}} needs your attention.

{{3}}

Relief Health: {{4}}

Review the affected periods in Roster: {{5}}.

Please consider external ad hoc relief where needed. External staff are not activated automatically.
```

### relief_final

`gsis_relief_final_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` allocation_summary, `{{4}}` relief_health_summary, `{{5}}` roster_plan_url.

```text
*Final Draft Relief Allocation*

Hi {{1}}, the final scheduled relief allocation for {{2}} is complete.

{{3}}

Relief Health: {{4}}

Review and publish the draft in Roster: {{5}}.

Thank you.
```

### conditional_relief_instruction

`gsis_relief_instruction_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` class, `{{3}}` duty_date, `{{4}}` period_and_time, `{{5}}` conditional_instruction, `{{6}}` absent_teacher_name, `{{7}}` absent_teacher_contact.

```text
*Instructions for relief lesson*

Hi {{1}}, please note the following instructions for your assigned relief lesson at Gongshang Primary School.

Class: {{2}}
Date: {{3}}
Period and time: {{4}}

Lesson instructions:
{{5}}

For clarification, please contact {{6}}, the absent teacher:
{{7}}

Thank you.
```

### urgent_forward

`gsis_urgent_forward_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` original_message, `{{3}}` sender_name, `{{4}}` sender_contact.

```text
*Urgent Message to Relief Team*

Hi {{1}}, a staff member has sent this urgent message:

{{2}}

From: {{3}}
Contact: {{4}}

Please contact the sender directly. This message does not create an absence report or confirm relief cover.
```

### smc_attention

`gsis_relief_attention_v2` · `en_GB` · UTILITY

Positional values: `{{1}}` duty_smc_name, `{{2}}` duty_date, `{{3}}` attention_details, `{{4}}` roster_status_url.

```text
*School Relief Allocation Requires Action*

Hi {{1}}, you are on SMC relief duty at Gongshang Primary School on {{2}}.

The following issue has been recorded in the teacher relief allocation for your duty date:

{{3}}

Please review the affected lessons and confirm or correct their teacher coverage in Roster: {{4}}.

Thank you.
```

### stapler_timetable

`gsis_timetable_updated_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` change_details, `{{4}}` private_timetable_url.

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

View your updated timetable alongside your usual timetable:
{{4}}

Thank you.
GSiS Roster
```

### stapler_request

`gsis_timetable_sponsor_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` recipient_name, `{{2}}` requesting_teacher_name, `{{3}}` duty_date, `{{4}}` roster_plan_url.

```text
*Request to plan Suspended Timetable*

Hi {{1}}, {{2}} has requested your approval to plan and publish a suspended timetable for {{3}}.

Please review the request and approve or reject it here:
{{4}}

Thank you.
```

### stapler_decision

`gsis_timetable_access_v1` · `en_GB` · UTILITY

Positional values: `{{1}}` requesting_teacher_name, `{{2}}` duty_date, `{{3}}` change_details, `{{4}}` roster_plan_url.

```text
*Suspended timetable request outcome*

{{1}} made a request to plan a suspended timetable for {{2}}.

The request has been reviewed and the outcome is:
{{3}}

View the request and decision here:
{{4}}

Thank you.
```

### Optional two-button timetable variant

`gsis_timetable_updated_button_v2` · `en_GB` · UTILITY. Verified APPROVED through Meta on 22 October 2026. v0.8.7 automatically upgrades an enabled legacy timetable route to this exact three-parameter, two-button contract. A disabled route stays disabled. Live approval and component validation remain required before sending.

Positional values: `{{1}}` recipient_name, `{{2}}` duty_date, `{{3}}` change_details.

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

Please use the buttons below to view your updated timetable alongside your usual timetable and acknowledge this update.

Thank you.
Access https://roster.gsps.edu.sg for more info.
```

| Button text | Exact dynamic URL |
| --- | --- |
| View Detail | `https://roster.gsps.edu.sg/external.html#{{1}}` |
| Acknowledge | `https://roster.gsps.edu.sg/external.html?action=ack#{{1}}` |

The acknowledgement button opens the explicit acknowledgement action; a GET or preview must not record acknowledgement. Retain both URL-button definitions and dynamic suffix positions. For explicit configuration, replace only `stapler_timetable` in the complete map with this approved entry on both Roster Pages and the notification Worker:

```json
{
  "stapler_timetable": {
    "name": "gsis_timetable_updated_button_v2",
    "language": "en_GB",
    "bodySha256": "c045ccb418e1680e2f528de915ba3897511bd7514eb9941b67f83fab2917c5b0",
    "enabled": false,
    "summaryMaxCharacters": 1024
  }
}
```

### Optional Inbox alert

`gsis_inbox_new_message_v1` · `en_GB` · UTILITY. This separate optional contract is controlled by `WHATSAPP_INBOX_ALERTS_ENABLED`, not an additional arbitrary map route.

```text
*New School WhatsApp Message*

Hi {{1}}, a new message from {{2}} is waiting in the GSiS WhatsApp Inbox.

Open Roster to review and reply: {{3}}.
```

Values are duty SMC name, sender display name and Roster URL. Obtain current approval before enabling it. The shipped proposal and this reference do not submit a template or establish approval.


## Clearing current notification work without erasing delivery history

In the active **Roster Apps Script owner**, select and run `inspectCurrentWhatsAppQueue`. This is read-only and prints counts, not recipient names or access links. To explicitly cancel the existing queue and dismiss current delivery alerts, run `clearCurrentWhatsAppQueue` once, then run the inspection again. These editor functions are included in the Roster gCode and are not exposed through a web API. Never paste a second complete Roster gCode into DeliveryAlert.gs.

The cleanup takes the same owning locks as Roster. It cancels unprepared pending work, retains prepared/uncertain outcomes for late provider settlement, cancels queued delivery-report emails, and records manual dismissal receipts. It does not send any WhatsApp/email, mark delivery successful, change timetables/absence records, or expire seven-day private links. An already submitted message/email cannot be recalled. New future notices and materially new failures remain enabled. A lock-busy result means rerun this exact function; a partial transport-write error is also safe to retry. This cleanup does not replace the automatic exact-email-receipt closure built into v0.8.7.

If NotificationMaintenance.gs was added separately to an older deployment for emergency cleanup, remove that temporary file when installing the complete v0.8.7 Roster gCode, which already includes these functions. Run maintenance only from the active Roster owner project. The Google authorisation dialog is not proof that the function executed; require an execution result and read-only verification.
