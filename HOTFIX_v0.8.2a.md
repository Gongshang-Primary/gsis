# GSiS v0.8.2a Contacts patch

Baseline: full GSiS v0.8.2. Only the Contacts frontend changes.

1. Extract this package, then upload Contacts_Frontend_v0.8.2a.zip to the existing Contacts Cloudflare Pages project as a new production deployment.
2. Keep the current project domain, Access policy, GOOGLE_CLIENT_ID, APPS_SCRIPT_URL and BRIDGE_SECRET. Normal GSiS sign-in still uses these settings.
3. Reload Contacts and check that its version is v0.8.2a. The first column should read add with a plain + in each row.
4. Press + for a test contact, open the downloaded VCF and inspect Prefix, First Name, Last Name, mobile and work emails before saving it on an Android phone and an iPhone.

No Apps Script, notification Worker or other frontend update is included or required by this patch. People API access and Google Contacts consent are no longer needed for the plus action. Existing Google contacts and earlier consent settings are not changed.

The contact file is created from the selected directory row already loaded in the browser. It remains usable when that browser goes offline after the directory loads. Downloading does not save a contact automatically, synchronise future changes or prevent duplicates. Phone/browser import handling needs actual device acceptance testing.

If rollback is needed, redeploy the Contacts frontend from full v0.8.2. That restores its earlier Google Contacts flow and prerequisites. Do not reset school data or replace backend deployments.

SOURCE.patch is for maintainers merging the change into the full suite. Apply it to commit 4cd0fbe5f33175ac2be5c28b33e2c55d9a8a05b6, or port the files described in SUITE_MERGE.md. It is not a Cloudflare upload.

This package was prepared and committed locally. It has not been installed on the live site and has not written to any phone or Google address book.
