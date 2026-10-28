# GSiS v0.8.4

Full suite release based on v0.8.3. Items 088 through 094 are included. The package contains five frontend ZIPs, four complete Apps Script backends, the separate notification Worker, source and release documents. Package preparation does not establish production installation or live delivery.

## 088: confirmed suspension dates

Active mapped eligible teachers see confirmed suspension dates from today onward, ordered soonest first, without sponsorship or membership of the plan. A legacy confirmation can make a date visible even when no safe frozen preview survives. Such a row has no preview button and does not reveal the current private draft or its metadata. Frozen confirmed and published previews retain their existing privacy rules. The helper says: "To view the published timetable, select Timetable from the main screen." Account-access problems, read failures and a verified empty list have distinct messages.

A read-only 21 October operations snapshot reproduced the legacy issue with a synthetic eligible teacher. v0.8.3 listed 21 October alone; the updated projection lists 21, 22, 23, 29 and 30 October. The four later records had confirmation evidence but no frozen snapshot. This identifies a data-shape defect; it does not establish the screenshot account's mapping or deployed version. No live records were changed.

## 089: responsive absence reporting

Report Absence retains local input, selected periods, instruction text and the text caret while dated information refreshes. Date checks leave the controls responsive, but submission waits for verified data. The effective suspended timetable and recurring baseline are prepared separately for the selected report. Current attendance, saved instructions and permissions remain online checks.

## 090: mobile Own arrangements

Own arrangements remains beside No relief instructions and works with or without text. A new absence or changed instructions starts its exact save and immediately opens a cancellable pending dialog. Period and colleague selection becomes available after confirmed save. The mobile chooser has visible period buttons, searchable colleagues, cover or Combine choices and retained selection chips. Only Submit requests creates colleague requests. Closing the pending dialog prevents a late save response from reopening it. An uncertain save retains its original receipt recovery.

## 091: prepared timetables and changed instruction cells

Compatible clients request gzip snapshots of the authorised baseline and effective timetable. An unchanged snapshot uses a key-only response. The browser retains bounded decoded snapshots in memory, while each read still verifies authority and returns current operational records. Unsupported compression, missing cache entries or invalid compressed data use the plain read path. Writes are never retried as reads.

Saved instruction edits carry only changed lesson keys, original values, instruction-choice changes and the absence/source scope. Unrelated instruction-cell edits can merge despite a newer global revision. Same-cell or changed absence/source conflicts remain visible, and a rejected patch changes nothing. The instruction editor shows latest and local values with explicit Use latest / Keep my edits choices. If the timetable changed, matching edits stay available and old lesson text can be copied. Existing payloads retain their strict revision behavior.

## 092: one teacher for a consecutive subject block

System Config adds **Same relief teacher for consecutive periods**. The default rule is PAL for three consecutive periods. Admin can add or remove subject rules; SMC can inspect them. The allocator requires one eligible teacher for each complete matching block, while retaining SMC choices and applicable workload limits. An unfillable block remains for review instead of being split silently. No extra lesson periods are created. Six matching PAL periods form two three-period blocks. Gaps and incomplete remainders stay for review. A single protected teacher can anchor the pending remainder; conflicting choices remain unchanged and are flagged. The precise rules are in the API contract.

## 093: separate Roster Apps Script owner

The package provides a standalone Roster backend alongside Contacts, Calendar and Deploy/Layout. Fixed backend kinds and a disabled-by-default owner gate separate the entry points. Roster retains the original file/folder IDs and remains the sole owner of its operational data. Published Deploy reads remain shared dependencies. Follow the [single-writer cutover](docs/ROSTER_BACKEND_CUTOVER_v0.8.4.md); old unguarded deployments and triggers must be disabled and drained before the new owner is enabled. No live cutover is included in package preparation.

## 094: retain position while editing IP Deploy

IP Deploy editing preserves the user's table position and active editing context across the affected redraws. Removing an assignment in a lower row retains scroll position and logical cell focus. Full refresh retains table position without stealing toolbar focus. Wheel movement or a changed tab cancels stale restoration. The validation record states the tested actions; save and publication behavior is unchanged.

## Retained from v0.8.3

Portable Contacts VCF export, separate Stapler class-field arrows, protected manual allocation, explicit Save to online / Let teachers see / Send WhatsApp, local Excel, seven-day private timetable links, acknowledgement statistics, absence-aware recipients, daily audit export and private Inbox media remain included. These are inherited behavior, not new v0.8.4 implementations.

See [Build scope](BUILD_SCOPE_v0.8.4.md), [performance evidence](PERFORMANCE_v0.8.4.md) and `VALIDATION.md` for the verified scope and limits. The single operations document and final writer lock remain. This release does not claim to eliminate every concurrency conflict or establish peak morning throughput. WhatsApp template approval and activation require their separate checks.
