# Installing LORD and its reference bridge in GSiS Suite v0.9.1

This guide covers the matching v0.9.1 Contacts, Deploy, LORD, OVERLORD and STARLORD components. Source preparation and a Git commit do not install live Apps Script or Cloudflare projects. Install the complete matching components on a test copy first.

This v0.9.1 release includes the token-free settings correction from `v0.9-correction` and supersedes `GSiS_v0.9_Deployment_Configured_LORD.zip`. Runtime code stays clean; private values belong in the settings below and a separate private ledger. Source release does not deploy or change live settings.

## LORD deployment settings

In the LORD Apps Script project, open **Project Settings → Script Properties → Add script property**, enter each name/value, then choose **Save script properties**. Preserve each existing value exactly, especially both booking peppers; changing them can invalidate existing booking access. See [Google's Script Properties instructions](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually).

| Script Property | Existing value to preserve |
| --- | --- |
| `LORD_SPREADSHEET_ID` | Transaction workbook ID |
| `LORD_REFERENCE_SPREADSHEET_ID` | Reference workbook ID |
| `LORD_PHOTO_FOLDER_ID` | Evidence-photo folder ID |
| `LORD_REIGN_ARCHIVE_FOLDER_ID` | REIGN archive folder ID |
| `LORD_PROXY_SECRET` | Current backend proxy secret; same value in all three Pages projects |
| `LORD_BOOKING_TOKEN_PEPPER` | Current booking-token pepper, unchanged |
| `LORD_BOOKING_CODE_PEPPER` | Current booking-code pepper, unchanged |
| `LORD_TELEGRAM_BOT_TOKEN` | Current Telegram bot token, if Telegram is used |
| `LORD_TELEGRAM_CHAT_ID` | Current Telegram destination chat ID, if Telegram is used |

Leave both Telegram settings unset if Telegram is intentionally disabled. Preserve existing `LORD_WA_*` properties, consent, queues and receipts. These settings are separate from the new reference bridge.

For **each** LORD, OVERLORD and STARLORD Pages project, open **Cloudflare → Workers & Pages → project → Settings → Variables and Secrets → Add**, choose **Production**, and save these entries before deploying. Use **Encrypt** for secrets. See [Cloudflare Pages variables and secrets](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables).

| Pages setting | Type | Value |
| --- | --- | --- |
| `LORD_BACKEND_URL` | Text variable | Existing LORD Apps Script web-app `/exec` URL |
| `LORD_PROXY_SECRET` | Encrypted secret | Exact value of LORD's `LORD_PROXY_SECRET` Script Property |
| `GOOGLE_CLIENT_ID` | Text variable, LORD and OVERLORD only | Preserve the existing OAuth client ID |
| `LORD_SESSION_SECRET` | Encrypted secret, LORD and OVERLORD only | Preserve the existing session secret |

STARLORD retains its existing display access model. Do not add any of these values to `_worker.js`, `Code.gs` or browser assets. The configurator can produce a separate private `deployment-settings.json`; use `existingInstallation: true` for an upgrade so existing peppers and session settings are retained. Do not include that JSON or the private input JSON in an upload ZIP.

## Reference bridge Script Properties

| Project | Property | Value / purpose |
|---|---|---|
| Contacts Apps Script | `LORD_BRIDGE_SECRET` | Preserve the existing dedicated secret, or create one of at least 32 characters for first adoption; identical in all three projects below |
| Deploy Apps Script | `LORD_BRIDGE_SECRET` | Same dedicated LORD secret |
| LORD Apps Script | `LORD_BRIDGE_SECRET` | Same dedicated LORD secret |
| LORD Apps Script | `LORD_CONTACTS_APPS_SCRIPT_URL` | Existing Contacts web-app `/exec` URL after deploying the updated source |
| LORD Apps Script | `LORD_DEPLOY_APPS_SCRIPT_URL` | Existing Deploy web-app `/exec` URL after deploying the updated source; not the Roster deployment |
| LORD Apps Script | `LORD_GSIS_SNAPSHOT_FOLDER_ID` | ID of a private Drive folder owned/accessible by the LORD execution account; snapshot files contain staff contact data |
| LORD Apps Script | `LORD_GSIS_LOCAL_ACTIVITIES` | Optional reviewed JSON array of local activity names for first adoption; required if unmatched legacy labels need explicit classification |

Retain existing Contacts/Deploy browser bridge secrets, LORD proxy/session secrets, IDs, booking peppers and notification settings. Do not reuse a browser proxy secret for the new service. Do not place this service secret in a Worker, browser bundle, query string or snapshot file.

`LORD_GSIS_ENABLED`, `LORD_GSIS_SNAPSHOT`, `LORD_GSIS_CHECK` and `LORD_GSIS_SYNC_LEASE` are managed by the bridge. Do not create blank placeholders for them. The snapshot pointer and check/lease metadata are not user configuration.

## Installation order

1. Back up current source, Script Properties, Pages settings and published deployment versions; preserve the existing IDs, secrets and booking peppers.
2. Add or preserve the LORD deployment settings before replacing code; existing triggers use saved source. Preserve an already configured reference bridge. Complete its properties only when first adopting that integration.
3. Install the complete v0.9.1 Deploy and Contacts Apps Script files, publish new versions of their existing deployments and retain their `/exec` URLs, access configuration and current properties.
4. Save the complete clean LORD backend while preserving its existing manifest and Sheets advanced service; no booking or custody data migration is required.
5. Authorise the LORD execution account for URL Fetch, the private snapshot folder and time-driven triggers, then run `selfTestLORDV17` and resolve failures.
6. For first adoption, run `enableLORDGSiSBridge` in the LORD editor; it validates and stores the first complete snapshot before enabling integration and installs a one-minute `syncLORDGSiSReferences` trigger if absent. An upgrade preserves an already enabled bridge and its existing trigger.
7. Publish a new version of the existing LORD web-app deployment, keeping its current `/exec` URL, then upload the clean LORD, OVERLORD and STARLORD ZIPs to their existing Pages projects.
8. Check Shared data for the publication name/revision, update time and last successful check; use the existing administrator refresh control for an immediate sync.
9. Exercise the UAT checks below before relying on the integration in production.

A source or configuration error prevents bridge activation. If unmatched legacy form labels need review, use the supplied catalogue evidence to prepare the explicit local activity list. A normal booking form refresh reads LORD's local backend copy and does not call Contacts or Deploy.

The one-minute trigger is a requested schedule, not a Google timing guarantee. Unchanged checks avoid directory transfer and Drive snapshot writes. Contacts still performs a fresh scoped directory read during each check to discover direct Sheet edits. Deploy's unchanged path reads its small publication index and no catalogue document rows.

## UAT and failure behavior

Confirm a phone-only change, unpublished draft save, explicit publication, class rename, staff rename/name reuse, retired staff member, unchanged references, failed source request, two concurrent refreshes and a lost booking response followed by exact retry. Check ordinary and administrator booking paths, historical edits, custom activities/purposes, active loans, collection/return and the current notification recipient. Use controlled test recipients for any separate delivery test; this source work sent no messages.

Failed sync retains the last valid complete snapshot and displays the failed check. A known failed check or Contacts verification older than five minutes prevents a new WhatsApp provider send; pending work retains its existing retry behavior. This protects recipient changes during an outage but can defer notifications until a successful check. Other local reads do not fall back silently to a different directory. The exact periodic-trigger timing and live provider behavior have not been verified.

Published effective dates are shown as metadata. The bridge follows Deploy's explicit published pointer, even when an administrator publishes a future-dated version, and shows a mismatch warning. It never silently adopts the unpublished 2027 plan. There is no new date-based multi-version catalogue selector.

Existing bookings and custody records retain their original text, owners, tokens and audit records. New records bind reference IDs/generation in audit metadata. Subject codes remain the existing subject identities; a subject-code rename is a new identity, not an automatically inferred alias.

Snapshot files contain reference data, not credentials. They are immutable and retained for safe uncertain-write recovery. Apply the school's normal private-data retention policy to the snapshot folder; no automatic deletion of old files is introduced in this release.

## Rollback

Restore the prior complete saved source and matching published deployments/frontends. Remove or disable only the new sync trigger when rolling back. Preserve existing transaction sheets, added Script Properties, Pages settings, booking peppers, audit records and snapshot files. Setting `LORD_GSIS_ENABLED` to `false` switches reference reads back to the original local lists and Contacts sheet; those original lists may be stale, so review them before operational use. This switch does not undo any booking or custody transaction.
