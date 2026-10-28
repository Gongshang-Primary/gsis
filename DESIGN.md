---
version: alpha
name: GSiS operational interface
colors:
  primary: "#087af0"
  text: "#304a5c"
  muted: "#5f7484"
  border: "#d5dfe7"
  canvas: "#f2f5f9"
  surface: "#ffffff"
typography:
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: 16px
    lineHeight: 1.45
rounded:
  control: 5px
spacing:
  controlVertical: 9px
  controlHorizontal: 12px
components:
  button:
    minHeight: 42px
---

## Overview
GSiS is a dense school operations product for teachers, SMC and Admin, not a marketing site. Preserve the existing Roster blue header, outline stationery icons, plain white form surfaces and compact full-page tables. The school screenshot and existing product take precedence over external design references. The Airtable reference informs plain surfaces and clear borders only.

## Colors
Runtime ownership remains roster-update/public/roster.css. Its root variables --blue, --border and --muted supply component colours. Feature styles reuse those variables. Roster lesson colours are semantic and remain defined by the planner and operations styles.

## Typography
Use the system font. Keep labels readable and concise. Numeric table data can be centred; names and descriptions remain left aligned.

## Layout
Use normal full-page scrolling. Avoid an iframe or nested vertical viewport for forms and report tables. Put related controls in one horizontal row when the width permits. Stack controls on narrow screens. Keep breadcrumbs at the right of the status row. Home follows the saved 20-function display order. The first section contains positions 1 to 8, ending with WhatsApp Inbox; a horizontal divider separates the remaining functions. Four desktop columns give two primary rows. Smaller screens retain the same sequence and boundary. Filter each group by role without blank placeholders. The planner displays Suspended Timeable Advance PLannER while its internal Stapler route remains stable.

## Elevation & Depth
Plain bordered panels are the default. Report refresh uses inline status while leaving local input available. Own arrangements uses a cancellable pending dialog at the current viewport. Do not repeat save messages across buttons, page bars and dialogs.

## Shapes
Retain existing control radii and icon line style. Do not introduce a second component framework.

## Components
RosterOpsUI owns teacher search, period selection, health bars, dialog feedback and progress. RosterSettingsUI reuses its progress and health rendering. Native date and time inputs own input geometry and keyboard behaviour. Rule ordering also has labelled up/down buttons. Tables use existing ops-record-table and horizontal overflow only when needed.

Report Absence keeps Start and End dates together and exposes individual periods, Select All and Clear. Review prepares visible instruction rows without writing. Keep Own arrangements beside No relief instructions, with or without text. Preserve entered text, selections and caret during read refresh. Date verification can block submission while input remains responsive. A new/dirty Own arrangements action opens pending feedback immediately, then enables period and colleague choices only after confirmed save. Cancel prevents a late reopen. Only Submit requests creates colleague requests. An uncertain save retains its exact recovery and locks changes to report identity. The mobile chooser uses 44px controls, visible period buttons, searchable colleagues and a reachable submission action.

Relief Health places periods on one bottom axis and stacks teacher opportunities upward. Retain baseline green markers and pair assigned red markers by teacher identity. Use a neutral marker for eligibility outside the baseline or unverified capacity. Move complete paired teacher rows when stacking red assigned markers from the bottom. Filled green means baseline eligibility; a neutral outline means outside that pool or unverified, not spare capacity. Current free counts and the percentage remain the live capacity measures. A configured display filter hides columns only; distinguish full-day headline totals from the visible periods. Keep horizontal scrolling inside the chart on narrow screens, with keyboard focus and labelled teacher status.

RosterDutyUI owns named current and upcoming duty lists, with native inclusive date fields and explicit Edit, Activate and Delete actions. Show the conflicting name and range when dates overlap. Preserve history and exact retry, including navigation away and back during a save.

Suspended Timeable Advance PLannER lists confirmed dates before planning requests for ordinary teachers. Today's and upcoming dates sort earliest first. Separate date visibility from frozen-preview availability; an older confirmed date can show preview-unavailable guidance without exposing a draft. Show account-access and read errors distinctly from empty results. Existing authorised planners edit locally and use the server's save comparison; ordinary editing does not require an exclusive lease.

RosterSettingsUI owns the three automatic relief exclusion steps: wildcard rules, additional specific subjects, then the combined excluded population. Reuse GSISRosterOperations.matchesNoReliefSubject for filtering and preview. Subjects covered by a wildcard are omitted from the second step, while their saved exact rules are retained and become selectable again if the wildcard is removed. All previews use the loaded baseline and remain local until Save changes. Name Bridge reuses RosterOpsUI.teacherPicker as one searchable combobox for exact baseline names and separately selects a Contacts teacher. Arrow keys, Enter, Escape and Clear work without a server request. Custom text is not a selected identity; retain stale links visibly for review. Relief Health periods, employment-period restrictions and duty-summary times use clearly separated labelled settings. Employment restrictions explain the manual override and existing-timetable exception; hiding a health column is only a display choice. Existing labelled inputs, checkbox choices, rule chips and live status messages remain the canonical controls.

GSISRosterStapler owns aligned level recess cohorts and their complete adjacent swaps. RosterStaplerUI projects each cohort as a purple Canteen block across its visible class rows and configured duration. Class filtering changes the displayed rows, not the cohort moved; the block states the full class count. Native dragging and focused left/right arrow keys move between timetable periods. Displaced lessons with teacher clashes, or shared lessons extending outside that cohort, go intact to Card Pit with named feedback. One Undo restores the entire operation. Persisted recess identities and classroom supervision metadata remain unchanged.

RosterStaplerExport owns the offline Plan, all-teacher Relief and Class POV workbook projections. Assign Relief keeps Export Excel for the full teacher summary and Export relief excel for the arrangements-only table. Its second toolbar row places Export Class POV, Absent Teachers and Relief Load immediately before Refresh records. Both rows use 40px controls on desktop and 44px on narrow or coarse-pointer screens; this is a local toolbar variant. Summary dialogs reuse the loaded saved day and restore keyboard focus when closed. Class POV covers every class and period of the effective selected day, retains stacked lessons and labels draft or published allocations. Export operates on a snapshot and never changes save or confirmation state. Preserve teacher blocks without relief.

Import Offline JSON takes final placed tiles for the selected suspended day. The embedded workbook supplies teacher membership, not source lesson constraints. Replace each included teacher's whole day, including blanks; teachers entirely absent from the file retain baseline. Resolve uncertain names through eligible Contacts and verified TTB labels, excluding SLs, MK and OSO. Fuzzy suggestions require selection. Inline Add new contact preserves the draft and existing mappings through creation, cancellation and retry. Keep errors and unresolved mappings within the import dialog. Imported drafts use the existing local save and separate confirmation flow. Confirmation supplies one working timetable to summaries, Excel and relief allocation. Saved offline absence and cover labels describe the final overlay; they do not create online attendance records, relief credits or notifications. Existing online absences still apply.

RosterInboxUI uses a two-pane conversation layout on wide screens and a single list or conversation on phones. Native audio controls, explicit delivery states, labelled assignment controls and visible reply-window guidance keep the workflow usable without hover. Only server-provided duty alert flags indicate new-message alerts.

## Do's and Don'ts
Keep local search, highlights, selection and wildcard previews synchronous using loaded data. Show pending operations at the user's current viewport. Preserve input after errors. Use visible keyboard focus. Do not hide permission checks only in CSS or imply that a local selection has been saved.

Manual candidate Tier 1 contains all eligible internal teachers, ordered by remaining weekly R descending before timetable fit and fairness. Explicit override, external and repurposed recess groups stay separate. Admin-configured automatic allocation preferences are independent.

Home and the #reportAbsence deep link open own absence reporting; the header keeps Calculations available to signed-in teachers. Own absence uses the teacher's verified identity, native Start/End dates and explicit period selection. The former day shortcuts and Full/Partial controls are removed; speed work targets loading and save response time. Calculations loads only when opened, shows the current teacher's published Deploy values and explains them in five plain steps. Weekly W_i and R use whole-week-v5 without a fortnight conversion. Completed relief percentage uses verified recorded completed costs and weekly entitlements, with unavailable states for missing or incomplete history.

System Config is read-only for SMC and editable for Admin. Keep six independent preference toggles and the two independent daily/consecutive limit toggles on their respective rows. Disabled rules retain value and priority. New missing settings default to 9 total daily and 6 consecutive periods, enabled and strict. Hard eligibility and maximum coverage remain fixed.

A saved suspension plan carries validation tied to its content and revision. Reopening that accepted plan uses the canonical day; ordinary edits validate changed cards and affected occupancy. Save and Confirm remain separate. Show the saved revision and identify which pending operation needs retry; a fresh unsaved plan must say it is not saved.

Stapler dates provide separate Rename, Change date and Delete actions. Deleted plans provide Restore. Keep labels explicit, show the affected name and date in confirmation, and preserve the original request during an uncertain result. Move and Restore become Draft; a name edit retains confirmation. Explain blocked occupied destinations and protected history within the existing dialog.

Contacts owns the compact lowercase add column directly before TTb Name. Its semantic button shows the unboxed text + at the table text height, with invisible horizontal padding and visible keyboard focus. It must not increase row height. Clicking creates one local VCF from the selected authorised directory row; there is no Google Contacts consent, network call, saved tick or contact creation request. The exact name components are Prefix GSPS, First Name the entire TTb Name, and Last Name the entire Statutory Name. Show a Download contact file fallback and truthful save/import guidance above the table. Export is not evidence that a device contact was saved. contacts-update/public/contact-vcard.js owns the pure serializer; app.js owns click handling and temporary download URLs; styles.css owns compact presentation. Keep filtering, spreadsheet export, sign-in and directory permissions unchanged.


## v0.8.4 boundaries

RosterReportCache owns only prepared timetable pairs. Its bounded RAM cache is separate from current absence/instruction/authority data. Read failure must remain visible; cached timetables do not authorise a write. Saved instruction edits retain original/current values for the changed lesson cells and preserve local text after a conflict.

System Config uses a separate **Same relief teacher for consecutive periods** section. Keep Subject and Consecutive periods labelled, with Add subject rule and Remove rule controls. Subject is a native select containing the active baseline and current or future confirmed suspension subjects. It accepts no custom text. Retain an unavailable saved subject as a disabled selected option with replacement or removal guidance. Missing catalogue data blocks saving with a reload or backend update message; an empty catalogue permits removing all rules. Selection and period changes stay local until Save changes. PAL defaults to three periods. Explain whole-block eligibility and retained manual choices without an approval dialog. SMC sees the saved rules; Admin can save them.

IP Deploy redraws retain the logical active cell and table scroll position. Restore after viewport height/layout has settled, so the new table does not clamp its saved position to zero. Keep toolbar focus through a full refresh. A changed tab, wheel or other intentional navigation cancels stale restoration; do not pull the user back after they move.


Custom Notifications lists ongoing rules without a date selector. Each rule has a labelled On/Off switch and retains its filters and text while Off. Keep local form edits through other rule toggles, preserve exact retry identity, and invalidate all affected cached dates after policy changes. Assign Relief may resolve its next school date on entry after 14:00 Singapore time; show inline progress and explicit recovery on Calendar failure, never replace a chosen date or an active draft.

## v0.8.10 interaction boundaries

Deploy places ASC Export immediately before Audit. Preview and download use a frozen local deployment snapshot. Export settings have their own narrow save operation. Show unresolved demand and mapping errors beside the relevant control, focus the first error, and retain settings on failure. Keep XML download separate from online save and publication. Label this as a draft export until tested in the installed aSc version. Dense preview tables scroll horizontally within their own region on phones.

Calendar places Update birthdays from Contacts in a compact Admin action row below Refresh. It creates, updates and removes only owned birthday events in the selected year. Existing Sync Staff remains the separate external calendar action. Keep publisher controls readable on one line and let the header wrap. One ResizeObserver maintains the normal-page sticky navigation offset; the bounded Calendar layout retains its own static header geometry.

Stapler shows an imported relief cover as a separate removable and reassignable tile. Removing the cover keeps its underlying lesson. Review existing relief previews recoverable covers before changing the local draft. Verified imported covers can be reassigned before the first save; unsupported or inconsistent provenance requires review. Refreshing the selected day's absences preserves the local plan, filters and focus and uses inline status.

Roster opens a saved full-day absence editor from its saved period snapshot. Date or period edits load only the required timetable. Request-local indexes and immutable timetable projections must preserve the complete ranking and timetable results. Exact absence-row tokens permit unrelated saved records to change, while a changed target row still requires conflict handling. Cached display data never replaces server authority or write receipts.

Delivery review status reports file creation and verified settlement, not email delivery. Archive one frozen daily issue snapshot after 08:00 Singapore time. Retain a failed report and its retry identity; clear only the exact issue versions verified in the saved file. Show safe failure classifications without staff details, raw exceptions or private links.

The ownership setup page is a narrow administrator tool, served as `edge-setup.html` by Roster and Deploy. `shared/edge-setup.css` reuses the established system font, blue action, white panel, muted text and border values for this isolated route. Keep one document scroller, 44px controls, explicit numbered migration steps, visible focus and a cancel-first confirmation dialog. The shared HTML/JS/CSS are canonical; the two app copies differ only in the declared domain. Do not add credential fields or render staff export bodies on the page.
