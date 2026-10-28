# GSiS v0.9.1a: LORD patch installation

Apply to an existing v0.9.1 installation. The patch contains the LORD backend and matching LORD, OVERLORD and STARLORD frontend ZIPs. Contacts, Deploy, Layout, Roster, Calendar and the notification worker retain v0.9.1.

1. Keep a backup of the current LORD Code.gs and record the existing web-app version and three Pages deployments.
2. Preserve all existing Script Properties and Cloudflare Pages settings, including the proxy and bridge secrets, booking peppers, source URLs and private snapshot folder. This patch requires no new settings.
3. Replace the existing LORD Code.gs with the complete `LORD_Backend_v0.9.1a.gs`. Keep the existing manifest and Google Sheets API v4 service. Scheduled triggers run the saved source immediately.
4. Run `selfTestLORDV17` and inspect any failures. Run `diagnoseLORDBackgroundWork` for the secret-free property and queue report.
5. Publish a new version of the existing Apps Script web-app deployment. Retain its `/exec` URL and access configuration.
6. Upload each inner frontend ZIP to its matching existing Cloudflare Pages project: LORD, OVERLORD and STARLORD. Refresh existing tabs and confirm v0.9.1a.
7. On a test installation, type custom Class / TG / Activity and Subject values, save, reopen and edit a booking. Also select catalogue suggestions and verify the saved values. Check Shared data retains the existing published reference snapshot.

Do not rerun the settings migration, bridge activation, blank workbook setup or trigger installation for this patch. Existing records, drafts and schema versions remain compatible. Custom labels belong to the booking and do not change Contacts or Deploy catalogues.

Property cleanup is automatic and conservative. It retains configuration, unknown keys, recent retry receipts, active claims and unresolved work. A high property count can remain legitimate; the Apps Script settings editor's row limit is separate from storage capacity. Inspect the diagnostic report when capacity or reconciliation warnings appear.

Successful retry receipts are retained for seven days. Completed background receipts are retained for seven days from completion. Pending, uncertain and unreadable work is retained for administrator review. Maintenance removes at most 50 eligible properties per execution and inspects at most 2,048 entries for pruning. It does not erase unrecognised settings.

The policy warns at 350,000 estimated bytes, stops ordinary admission at 400,000 bytes and reserves recovery capacity up to 480,000 bytes. Each runtime value is limited to 8,000 UTF-8 bytes; new task admission stops at 7,000 bytes to leave room for claims and checkpoints. Capacity-reducing completion writes can still proceed under pressure. These are conservative application limits below the published Google property-store limits, not a promise that service quotas cannot fail.

For a manual cleanup batch, run `maintainLORDRuntimeProperties`. It logs the resulting bytes, counts and pruning outcome. `diagnoseLORDBackgroundWork` reports without deleting state. Review `needsAttention`, `uncertainRequests`, `uncertainTasks`, `stalePendingTasks` and `unreadableRecords`; do not clear those records merely to admit another booking. Resolve the associated operation against the authoritative booking/custody history first. A request whose outcome cannot be established must not be resubmitted under a fresh ID as a shortcut.

For rollback, restore the saved Code.gs and the prior published web-app version, then restore all three Pages deployments. Keep valid records and settings. Restoring only the published web app does not restore the code used by triggers.

`PATCH.json` and `SHA256SUMS.txt` identify the committed source and file hashes. `SOURCE.patch` and the incremental Git bundle are maintenance recovery files for the v0.9.1 source repository, not Pages uploads. See `SUITE_MERGE.md`.

The patch was prepared locally. No live deployment, settings change, publication or message send is included.

Fault tests cover property failures around WhatsApp acceptance. They do not establish end-to-end exactly-once delivery: provider transport ambiguity and email/Telegram acknowledgements retain their existing delivery semantics.
