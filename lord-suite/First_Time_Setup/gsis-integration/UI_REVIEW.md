# LORD reference UI integration

The frontend keeps the existing booking screens and legacy string-list contract. When the backend enables the GSiS copy, booking fields use the public `referenceCatalog` IDs and `referenceSource.key`. Class, teaching group and local activity options use separate namespaces. No email or phone is added to the public reference catalogue.

The original free-text student-group and subject/activity flow is retained through explicit Other activity choices. The class/group field accepts up to 160 characters as `classRef:{kind:"customActivity",name}`; the subject/purpose accepts up to 120 as `subjectRef:{kind:"customPurpose",name}`. Both require the current reference key. Typed text never becomes a class or subject ID; exact matches to a known current label must use the corresponding shared-list choice. Historical labels still remain unchanged by default.

LORD and OVERLORD load the same small `reference.js` helper from their own deployment assets. Their HTML uses the `1.8.1-gsis1` asset query for the changed app and helper; formal product version labels are unchanged. The copies are asserted identical in the focused test. STARLORD needs no frontend change: its feed continues to supply display labels and historical class text.

Each opened booking form checks the local LORD backend with `/api/reference?latest=1`. The Workers bypass their reference edge cache for this read but do not send `forceRefresh`, so opening a form does not trigger an external GSiS sync. Ordinary reference reads retain edge caching and coalescing. A failed check may show the saved copy with a delayed-connection label; the backend still validates the reference key on writes.

An open LORD form pins its displayed reference generation. A background refresh followed by a period or quantity redraw cannot silently replace that generation. A definitive stale-reference rejection retains the selections and asks the user to reload choices. Explicit reload preserves stable IDs, so a class label reused by another class cannot retarget the selection. Pending unknown submissions retain their original payload and request ID through the existing recovery mechanism.

Existing admin edits include a default saved-booking option for each historical teacher, class and subject. Leaving that choice unchanged sends the original text without assigning a new reference ID. Explicit replacement uses the selected current ID. The publication name/revision, source update time, source status and last-check time appear in booking screens and OVERLORD Shared data settings; the existing administrator refresh command refreshes the copy. A date-range mismatch is advisory and does not switch publication. The retained LORD admin-edit compatibility path uses the same explicit stale-reference recovery; current own-booking screens remain read-only.

Validation (local assets, synthetic data, no deployment or messages):

- `gsis-reference-ui-browser.cjs`: genuine Chromium pass for both apps; worker checks prove latest reads reach only the reference endpoint without source-sync flags. Browser cases cover same-label namespaces, pinned open generation, stale rejection and explicit refresh, class label reuse, staff IDs, retained historical labels, saved form fields, the legacy admin-edit retry path, explicit custom activity/purpose payloads, custom draft restore after reload, custom fields retained through reference refresh and the mobile viewport.
- `run_reload_browser_checks.cjs`: 17 passed with `LORD_TEST_CHROMIUM` set to the available browser binary.
- `run_frontend_14_checks.cjs`: 40 passed; the VM harness loads the new helper as the deployed HTML does.
- `run_v18_frontend_checks.cjs`: 5 passed.
- `run_school_frontend_checks.cjs`: 2 passed.
- `run_frontend_141_checks.cjs`: 19 runtime cases passed; the old backend source-equality guard needs its intentional GSiS changes recorded by the integration owner.

These tests do not establish live Apps Script latency or a live concurrent-user load result. Backend atomic snapshot publication, identity matching and retry receipts are tested separately by the backend owner.
