# GSiS v0.9 — settings and Report Absence correction

This committed source correction follows the existing v0.9 release and is identified by Git tag `v0.9-correction`. The original `v0.9` tag remains unchanged. The correction suite records its exact source commit and includes source history. No live deployment, Script Property change, Cloudflare setting change, staff-record change or provider send is part of this source release. The original v0.9 verification remains separate from the current correction record in source `VALIDATION.md`.

## Move LORD configuration into project settings

LORD runtime source now reads private installation values from project settings. Do not restore tokens or connection constants into `Code.gs`, `_worker.js` or browser assets. Keep the private ledger separate from source and upload ZIPs.

Use [LORD_SETUP_v0.9.md](LORD_SETUP_v0.9.md) for the complete property tables and installation sequence. The settings are divided as follows:

| Location | Settings to preserve or create |
| --- | --- |
| LORD Apps Script → Project Settings → Script Properties | Existing workbook and folder IDs, `LORD_PROXY_SECRET`, both existing booking peppers, and Telegram settings when used |
| Each LORD, OVERLORD and STARLORD Pages project → Settings → Variables and Secrets | `LORD_BACKEND_URL` as a text variable; the matching `LORD_PROXY_SECRET` as an encrypted secret |
| LORD and OVERLORD Pages projects | Preserve `GOOGLE_CLIENT_ID` as a text variable and `LORD_SESSION_SECRET` as an encrypted secret |
| Existing reference bridge and notification settings | Preserve their configured values; follow the setup guide if the v0.9 reference bridge has not yet been installed |

Add the settings **before saving the corrected Apps Script source** or uploading the clean Pages ZIPs. Existing Apps Script triggers use saved source, so the settings must already be present. Preserve existing secret values exactly, especially both booking peppers; this is a storage migration, not a token rotation. Publish a new version of each existing web-app deployment where required, retaining its current `/exec` URL.

The LORD, OVERLORD and STARLORD Pages Workers reject missing, placeholder or malformed backend connection settings with a safe configuration error. They do not substitute source-code defaults or serve a previously cached API result to hide missing configuration. Their static pages remain available. Existing OAuth, session, reference-cache and notification behavior is retained.

The earlier `GSiS_v0.9_Deployment_Configured_LORD.zip` is superseded by the clean correction package. Follow the settings-first instructions above for this correction; the original release note's instruction to restore Worker constants does not apply to it.

## Report Absence: periods, timings and submission

The restored section is labelled **Periods and timings**. When the selected date has authoritative period timings, it shows explicit period cards with their start and end times, including on a non-school date with known timings. It does not invent periods when no timing grid is available: full-day or start/end-time coverage remains available until a real grid can be loaded.

The standard flow is:

1. Choose the absent teacher or teachers, **Start date**, **End date**, reason and whether relief is required.
2. Select every unavailable period, including free periods. Unselected periods remain available for relief assignment.
3. Click **I'm not available during the above selected periods**. This opens a local review of relief instructions; it does not save the absence.
4. Review the lessons and enter instructions. The final button is **Submit absence**.

If a timetable arrives after a clock interval was entered, the interval is retained; loading the period cards does not expand it to whole periods. Switching teacher or date preserves that teacher/date's instruction draft. No relief instructions are fabricated when the timetable is unavailable.

Save feedback appears in the middle of the page, immediately above **Relief instructions**. A pending save uses a neutral status; a failure or unconfirmed outcome is red. The bar turns green only after the save response or durable receipt confirms acceptance. That confirmation remains through teacher/date changes within the saved form, then clears when a new report starts or instructions are edited.

The existing **No relief instructions**, **Own arrangements** and **Save absence now; add instructions later** actions retain their explicit save behavior. On a new multi-teacher draft, these actions also submit the selected batch. **No relief instructions** is separate from selecting **No** for relief required: an absence can still require relief without written lesson instructions.

## Report several teachers together

For SMC and administrators, **Absent teacher(s)** uses the same searchable selection and removable name chips as **Check Availability**. An ordinary teacher remains restricted to their own absence; this correction does not grant them permission to submit for colleagues.

A new batch shares its date range, unavailable periods or time coverage, reason and relief-required choice. In **Relief instructions**, use **Absent teacher** and **Absence date** to review each teacher's actual lessons and enter separate instructions for each teacher/date. Those instructions are submitted with the whole selected batch. To give teachers different absence dates, reasons or unavailable periods, submit separate batches.

The backend validates the complete selection against the latest state under its existing writer lock before saving. Permissions, current staff eligibility, absence-type rules, date restrictions, overlapping entries and current lesson identities all apply to every selected teacher/date. If any member fails validation, none of the new batch is saved. Duplicate staff IDs and Contacts entries that identify the same person are rejected.

One accepted batch creates its absence records in one durable save with one retry receipt. If the response is lost, receipt recovery or an exact retry returns the accepted result without creating duplicate absences or queued notices. Reusing the same request identifier with a changed batch is rejected. This all-or-none guarantee covers the absence save; external message delivery remains a separate process.

The batch accepts up to 150 distinct teachers and 300 teacher/date records in one submission. Existing absence records are edited one teacher at a time. Saved instruction edits remain scoped to the selected record or that teacher's selected dates; they do not silently copy one teacher's text to colleagues.

## Own arrangements: full-day timetable

The popup restores the full-day table. The selected absent teacher stays in the first row, with colleagues below and the same period and timing columns across every row. Type part of a colleague's name to filter those rows; the absent teacher remains visible.

Choose an absent lesson in the first row, then choose a colleague in that period's column. An eligible blank slot offers **Provide cover**; an eligible occupied class offers **Combine class**. Review the selected requests before submitting. Server eligibility is checked again when the request is sent and when the colleague accepts it.

For a multi-teacher absence, the popup arranges relief for the teacher and date currently selected in **Relief instructions**. The other teachers' saved absences and instructions remain intact.

If a teacher opens the popup while STAPLER changes differ from the confirmed or published timetable, it reports that timetable confirmation is required. The absence is still saved; ask SMC to confirm the changes, then refresh availability. SMC and administrators may inspect the current planning grid. Colleague absence cells display **Absent** without disclosing the absence reason.

## Less work during absence submission

Colleague availability is requested only when **Own arrangements** opens. Reviewing relief instructions or submitting an ordinary absence no longer starts that optional availability request. A normal successful **Submit absence** uses the compact accepted response without an extra records refresh.

The same candidate request can include the permitted full-day timetable using `includeTimetable: true`. It reuses the already loaded context, including the timetable identity, parity and STAPLER revision, without an additional API call or model read. Existing candidate eligibility and request/approval validation remain in force. Compact saved-report responses retain the STAPLER lessons for every selected absent teacher and contain only those teachers' timetable rows.

Absence preparation skips a duplicate read of notification-delivery state. The commit still reads the current delivery store under the writer lock, and an exact receipt replay still loads current delivery state. This removes repeated preparation work without weakening the final check or retry recovery.

The preparation proof filters STAPLER to the relevant timetable weeks before validating and packing it, skipping unrelated dates and archives. The durable commit still packs the complete saved state. These are verified reductions in local work; no production response-time improvement is claimed.

## Manage school-wide absences

The **Entries per page** dropdown offers **50**, **100**, **150** and **200** rows, with **50** selected initially. Changing the size returns to page 1 and retains the chosen date range, search, sort and selections from other pages.

**Select all matching** still selects eligible absences across the complete filtered date range, rather than only the current page. Deletion uses that complete selected set and excludes past or otherwise noneditable records. Changing the date range clears the selection and returns to page 1, as before; the chosen page size is retained. Other tables keep their existing page sizes.

## Install the matching correction together

Deploy the matching Roster Apps Script source before the corrected Roster frontend so the backend understands the multi-teacher request. Use the complete generated source and frontend assets from the same correction package. After installation, reload existing Roster tabs to load the corrected scripts and styles. No timetable-cache clearing, storage-schema migration or new release label is required for this correction.

For rollback, retain the previous complete source and frontend packages and the existing settings. Restore matching backend and frontend versions together. Keep already saved absence records, booking credentials, receipts and audit history.
