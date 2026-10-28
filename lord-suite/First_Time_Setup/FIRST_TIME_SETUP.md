> Current release: GSiS Suite v0.9.1. For the Contacts and published Deploy reference bridge, also follow [gsis-integration/SETUP.md](gsis-integration/SETUP.md). Historical function names and provider template names remain compatibility identifiers.

# First-time setup for LORD in GSiS Suite v0.9.1

This guide creates a new instance of the GSPS system. The accepted sign-in domain remains `gsps.edu.sg`, and the operational timezone remains `Asia/Singapore`. Deploying for another institution requires a separate authorization/domain review. Use the clean runtime files under `First_Time_Setup`. For an existing installation, follow the upgrade guide and preserve its current peppers and session settings.

GSiS v0.9.1 includes the token-free settings correction retained from `v0.9-correction`. Source release does not deploy the apps or change live settings. Private settings are separate from runtime code.

## Prepare the Google resources

1. Under the designated maintainer account, create a transaction workbook and a separate reference workbook in Google Sheets.
2. Set both workbook timezones to Singapore and create separate Drive folders for evidence photos and REIGN archives.
3. Copy the two spreadsheet IDs and two folder IDs from their URLs into a private copy of `instance.example.json`.
4. Generate different random values for the proxy secret and both booking peppers, with at least 32 characters each; keep these stable after launch.
5. Supply the Telegram bot token and chat ID for the operations channel, or leave both blank if Telegram is not used.
6. Leave `backendUrl` empty initially and run `python3 configure_instance.py instance.json --output configured` from the first-time folder.

The command generates clean Code.gs, a complete new-project manifest and clean frontend ZIPs. It performs no network calls and never inserts credentials into runtime files. The separate private `deployment-settings.json` contains `appsScript.LORD` values and `cloudflarePages` settings for each project, including a generated session secret. Rerunning with the same output folder preserves that secret. Keep this JSON and the private instance JSON outside source control and upload ZIPs.

## Create the schema

1. Open the transaction workbook and choose Extensions → Apps Script to create the LORD project.
2. Open Project Settings → Script Properties → Add script property, copy the `appsScript.LORD` entries from the private ledger, and choose Save script properties.
3. Replace the empty Code.gs with the clean `configured/backend/Code.gs` after the settings are saved.
4. In Project Settings, show `appsscript.json` and use `configured/backend/appsscript.json` for this new project only.
5. Confirm Google Sheets API v4 and Google Drive API v3 appear under Services; if using a standard Google Cloud project, enable both APIs there too.
6. Run `createLORDV17Schema` from the Apps Script editor and authorize the required Google access as the maintainer.
7. Confirm the transaction workbook has Bookings, Sessions, Session Trolleys, Event Log, contacts and admins.
8. Confirm the reference workbook has teacher, classes, subjects, trolleys and timetable.
9. Run `inspectLORDPhotoUploadReadiness` and confirm `READY` before publishing; it checks the evidence folder without creating photos. See [photo upload reliability](PHOTO_UPLOAD_RELIABILITY.md).

The nine configuration names are `LORD_SPREADSHEET_ID`, `LORD_REFERENCE_SPREADSHEET_ID`, `LORD_PHOTO_FOLDER_ID`, `LORD_REIGN_ARCHIVE_FOLDER_ID`, `LORD_PROXY_SECRET`, `LORD_BOOKING_TOKEN_PEPPER`, `LORD_BOOKING_CODE_PEPPER`, `LORD_TELEGRAM_BOT_TOKEN` and `LORD_TELEGRAM_CHAT_ID`. The two Telegram properties may remain unset when disabled. The bridge uses the additional properties in [gsis-integration/SETUP.md](gsis-integration/SETUP.md).

The setup creates missing tabs and empty headers, expands new Bookings/Sessions tabs to the required width and leaves existing content intact. It preflights transaction headers, timezones and folder access first. It creates no bookings, users or triggers. Creation across two workbooks is not atomic; if a service interruption leaves a partial setup, correct the cause and rerun. A valid rerun makes no data changes. The unused default Sheet1 may be left alone.

## Fill the reference workbook

| Tab | Start | Columns and content |
| --- | --- | --- |
| teacher | A1, no header | One unique timetable teacher name per row. Use identical spelling in contacts and admins. |
| classes | A1, no header | One class or student-group label per row. |
| subjects | A1, no header | One subject or activity label per row. |
| trolleys | Row 2 | A trolley name, B device quantity 1–200, C cart/group, D device type, E stylus option, F headphone option. Use TRUE/FALSE for options. Trolleys in one cart must have the same type. |
| timetable | Row 2 | A period code, B start time, C end time. Use plain-text 24-hour `HH:mm` values such as `08:00`, in chronological order, with unique codes. |

Do not add a heading to the three single-column lists; it would become a selectable value. Populate real operational values before testing. The example below illustrates the format only and is not seeded automatically:

```text
trolleys row:  Trolley A1 | 28 | Cart A | MacBook Neo | FALSE | TRUE
timetable row: 1          | 08:00 | 08:30
```

## Fill contacts and administrators

| contacts column | Meaning |
| --- | --- |
| A | TTB Name; match the teacher list exactly. |
| B | Reserved; leave blank. |
| C | Schools email; retained but not used for LORD booking email. |
| D | Verified GSPS email, used for identity matching and booking messages. |
| E | Display name used on STARLORD. |
| F | Mobile number for agreed WhatsApp alerts and the existing contact shortcut; local Singapore format or full country code. |
| G | Reserved; leave blank. |
| H | Explicit WhatsApp link, if needed; otherwise the existing code derives one from F. |

In admins, enter GSPS Email, TTB Name, Active (`yes`), Role (`Admin`), Remarks and Google Sub. Leave Google Sub blank for first verified sign-in; the service binds it under a lock. Bootstrap one authorized maintainer here. After first sign-in, grant additional administrators through OVERLORD Settings using Contacts and confirmed WhatsApp agreement. Add only people authorized to administer equipment. Do not manually insert arbitrary subject values.

For WhatsApp, use your own registered sender and review the template definitions using `WHATSAPP_SETUP.md`. Keep sending disabled until approved, configured and tested. Telegram and WhatsApp are independent.

## Publish and connect the three apps

1. Run `selfTestLORDV17`; resolve all failures and confirm the reference counts are sensible.
2. Deploy Apps Script as a web app executing as the maintainer account, with access that allows the server-side Worker requests. For the current architecture this is `Anyone`; Google Workspace policy must permit that choice. The proxy secret protects backend actions; health is public.
3. Copy its deployed `/exec` URL into `backendUrl` in the private instance JSON, then rerun the configurator with the same output folder.
4. Create a Google OAuth web client and register the exact HTTPS origins of the LORD and OVERLORD sites, including any custom domains you will use.
5. Create three Cloudflare Pages projects, then open Workers & Pages → each project → Settings → Variables and Secrets → Add and select Production.
6. On all three projects, add `LORD_BACKEND_URL` as a text variable and `LORD_PROXY_SECRET` using Encrypt from the private ledger; on LORD and OVERLORD also set text `GOOGLE_CLIENT_ID` and encrypted `LORD_SESSION_SECRET`.
7. After the bindings are saved, upload the clean LORD, OVERLORD and STARLORD ZIPs separately; keep `_worker.js`, `index.html` and `assets` at each project root.
8. Sign into LORD as staff and OVERLORD as an active administrator, and confirm STARLORD shows the intended read-only information.
9. Run `installLORDV1Triggers` once from the maintainer's account and confirm both monitor and secondary-queue triggers are listed.
10. Complete the nonproduction acceptance checks in `VALIDATION.md` before opening the sites to users.

Install triggers from one owner only. Apps Script lists triggers owned by the current user; another owner's trigger can otherwise remain and duplicate work. Telegram setup involves an external message only when you deliberately run the appropriate test; the release preparation itself sent no messages.

Keep the instance JSON and `deployment-settings.json` in a private maintenance location. STARLORD needs no Google sign-in binding. Redeploy a Pages project after later binding changes. Do not publish either workbook, the evidence folder, the archive folder or private settings to make the application work. Review photo-viewing permissions for the authorized operations team separately.
