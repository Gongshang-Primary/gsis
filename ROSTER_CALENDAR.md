# Roster operations in v0.7.00

Open Report Absence to record your unavailable dates and periods. SMC can select another staff member when reporting on their behalf. Log the absence first, then add date-specific relief instructions on the same page. Use the colleague-arrangement button to request partial cover; approval confirms it without SMC approval. Notifications visibly remain disabled until WhatsApp is configured.

Manage reported absences shows your own records. Today and upcoming records support edits and cancellation; past records are view only. My Relief Duties shows your published Today, Upcoming and Past assignments. Future drafts are excluded by the server.

SMC uses Absences by Date and Relief Assignments to inspect demand, select available cover, mark a reason for no relief, and publish. R is an advisory fairness target, not a hard cap. An absent or occupied teacher is not available even when R remains positive. A mutually arranged assignment has a distinct badge and requires confirmation before an SMC override.

Manage Ad-hoc relief activates known Contacts for one selected day and optional periods. A new person is created inactive after name/mobile duplicate checks. Day employment changes do not modify the permanent Contacts record. Permanent corrections require Admin review in Contacts.

Admin settings provide absence type order and timing restrictions. Prune records is last in the home menu; preview and confirm a past year or range. Ordinary record deletion retains cancellation history and reconciles cover.

Timetable views are Teacher, Class, TG and Export. Last period and field preferences apply to the matching PDF and Excel projections only. They do not truncate operational absence or relief periods. Class TG teacher names are hidden by default and can be restored with a toggle. Check availability includes real operational unavailability and published/planned commitments.

Dates use Singapore time and the format 14 Oct 2026 (Wed). Read WHATSAPP_SETUP.md for sender, approved templates, scheduled delivery and private recipient links. Building or installing the suite does not publish the prepared 2026 Deploy candidate or send messages.

---

# Roster and Calendar v0.6.09

## Roster navigation and upload review

The home screen exposes Baseline Timetable to SMC, then Timetable and Check Availability to all staff. The icon style follows the supplied flat blue calendar references. Permissions still come from Contacts on every backend call.

Baseline Timetable opens Saved timetables first. Switch to Baseline upload, select the original aSc / Edupage .xls export and review the detected teachers, week pattern and period range. The supplied converter handles MSHTML and quoted-printable exports; it is not a general binary Excel reader. Both single-week and odd/even sources, with four or five card fields, remain supported. The preview keeps blank middle fields, displays Subject/Class/Classroom/Group, and uses the period timing entered in the form. Expand a teacher preview before saving. The original annotated export guide remains available within the form.

Enter a name and inclusive validity dates. Period zero defaults to 07:00, periods to 30 minutes and the last normal period to 16 (15:30 finish); a shorter source caps the last period. All imported periods remain available. Define recesses for P1 through P6 using period numbers. New imports default to periods 3, 4, 5, 6, 7 and 8 respectively. At the default timing these run from P1 at 08:30 to 09:00 through P6 at 11:00 to 11:30. Review them before saving. Older saved models without a recess definition remain valid; they are not silently rewritten. Saving creates a genuine XLSX archive and the operational model using the existing store. A visible notice explains today's activation outcome. Preview is local, conversion happens once, and a retry reuses the complete original request. An unconfirmed save prevents a second mutation until resolved. Saving is confirmed separately from reloading the list, so a successful save followed by a failed refresh does not invite a duplicate upload.

On an initial loading failure, use Retry. Transient errors carry a reference that matches the Roster worker log and the Deploy Apps Script execution log. The Apps Script log identifies whether Contacts authority or Roster storage failed, without sending the exception to staff. Existing authorization/validation errors are preserved. Failure does not create an empty register or masquerade as “No active timetable”. The owner diagnostic `checkRosterAccess` remains read-only. Its successful editor run does not prove the deployed web app or write access.

The user confirmed a Roster save after full Drive authorization on 14 October 2026. Building this release does not install its new interface or establish its live acceptance.

## Timetable views and exports

View Timetable contains Teacher, Class and Export. Teacher opens first. Teacher and class dropdowns accept part of a name. The grid retains the source week patterns. Use Last period to choose the last visible column.

One final-period preference is shared across Teacher, Class and Export for the signed-in account in that browser. It survives a reload. The effective value is capped at the current source's final period without erasing the preference, so moving to a shorter timetable does not permanently shorten a later one. The setting changes display and export only; it never deletes imported periods.

Teacher and Class provide PDF printing and Excel output for the selected entry. Export provides a PDF or Excel format choice and two actions: All teachers and All classes. Every output uses the same grid projection and final period. Excel is a genuine XLSX workbook; PDF uses browser printing. Desktop font substitution and print settings can affect physical page size, so check the print preview.

The initial profile prepares the current parsed timetable in memory. If none is active, it prepares the next upcoming timetable and labels it Upcoming with its validity dates. It does not activate a future entry early. Switching views and exporting reuse that model. Explicit refresh, date changes and register revisions update the selection. Current Contacts authority is still checked on backend requests; memory is not a permission grant.

## Online storage

All new Roster files stay beneath the shared GSiS root `1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z`:

- 01 Live Data / Roster: `1YTYau20Nvkj3BS-IsE4CYaJW1nIdaD91`
- Previous Timetables: `1_9CnZI2DggC0cJc1l6fU0kH0BaJr2eEl`, genuine XLSX archives.
- Operational Data: `14M4imcYdcrfiUax_LckvWwrqU83_9rlb`, parsed models and a small register.

Excel is the readable archive. Runtime data is parsed once at upload, avoiding repeated workbook interpretation. Staff never manage JSON or Drive files. Both active and previous immutable timetable files stay in these folders; activation changes register metadata. Soft prune hides a list entry and keeps its files. SMC can show pruned entries and restore them. An active entry must be replaced or have its validity changed before pruning.

Shared Drive reads and writes use Drive v3 with Shared Drive support. Each upload writes its immutable model and workbook before committing the register. That single register update is the visibility boundary, not an assertion that several Drive calls are physically atomic. A failed upload cannot become active; its immutable orphan files may remain and be reused by the same-request retry. Request receipts, actor checks, revision checks and the existing timed script lock protect mutation. No full workbook writes or repeated source conversions happen during views.

Dates are inclusive in Asia/Singapore. Latest validity start wins; ties use latest saved priority. Activate today sets From to today. When no entry covers a date, active remains empty. If a future entry exists, the view can show that upcoming timetable with an explicit Upcoming label. Every read resolves the date, so midnight trigger drift cannot select stale truth. Open teacher views recheck once per minute, or immediately through Refresh. Historical dates use the current editable register, not an immutable audit of what was once displayed at an intraday instant.

## Calendar date integration

The full RC1.9.2 package supplies the working RC1.9 Apps Script source. This release includes that source and a small authenticated `rosterDate` action. Keep the existing Calendar workbook and Apps Script deployment. No backend merge, new script, schema migration or data rewrite is needed. The stored schema remains `v2 RC1.9`; the public release version is `0.6.09`.

Roster's existing authenticated Pages worker calls Calendar using the verified school identity and the existing Calendar proxy secret. The secret stays server-side. The action returns only the selected date's context, not events or staff directories. Only released, non-archived years are visible. This rule applies to SMC too; publishing a Roster baseline does not release a Calendar planning year.

The API reads Years and the selected year's Events and YearStructure using existing bounded, batched helpers. It skips DayNotes, directory loading and settings bootstrap. It makes no writes, CalendarApp calls or calendar syncs. Roster calls it in parallel with the timetable read, with a 12-second Calendar timeout. No new cache can hide Calendar changes.

TERM_WEEK gives term and school-week number. Positive school weeks determine odd/even; opening week zero and missing or overlapping week records give unknown parity. VACATION, weekends and published all-day/multi-day `hol` events identify no-school dates. Hidden/deleted events and arbitrary meeting titles do not. Calendar does not have a separate universal school-closure flag; school closures must be represented by those existing records. If there is no valid term week and no closure, schoolDay is unknown.

Timetable view retains both week patterns for reference. Common availability uses the selected date's pattern when known, and shows both patterns when unknown. A no-school day has one notice and still shows the school's timetable availability. Calendar failure never turns into a blank timetable or an invented free period. Refresh or the existing minute poll fetches new context.

## Installation

Update the existing Calendar Apps Script deployment with the included complete source. In Roster Pages, set `CALENDAR_APPS_SCRIPT_URL` and encrypted `CALENDAR_PROXY_SECRET` to the existing Calendar values. Preserve all other IDs, properties, roles and triggers. No additional Google client or staff consent flow is introduced. For ordinary Calendar sync, add Calendar API v3 alongside Sheets API v4 in the existing Calendar Apps Script project and authorize its execution account. The Roster date action itself does not write to Google Calendar.

## Acceptance limits

Converter and UI paths are exercised with synthetic aSc HTML fixtures. A real current aSc export, Excel desktop opening, matching the desired PDF print appearance, school-screen pixel fit and live Apps Script/Pages acceptance still require installation checks. Timetable PDF and XLSX use the same projection and cutoff; the source archive retains the original converter flow. PDF uses browser printing, so pagination can vary by print settings. Live Calendar/Roster connection and source-data accuracy require acceptance after deployment.

## Calendar publication and synchronization

An individual Published event can sync to Staff even while the year is in planning. The Calendar viewport still controls staff visibility using the existing release rule. Admin can select Publish version to release the chosen year, publish its live Hidden events and start Staff synchronization. A retry uses its original operation receipt, so it cannot publish Hidden events added later. Parent synchronization remains separate.

Ordinary Staff and Parent sync uses Calendar API v3. Existing iCalUID links are resolved safely, while API event IDs are stored separately in the existing MutationLog. New creates use a stable provider identity and ownership metadata for uncertain-response recovery. Reconciliation reports changed provider content. A conditional update that finds a newer provider version rereads it, preserves unrelated fields and applies the current GSiS fields. The API does not import external changes into GSiS or turn Sheets publication and Calendar writes into a single atomic transaction.

Keep the workbook schema at v2 RC1.9. Retain IDs, existing triggers, secrets and calendar choices. The default Calendar access preflight is read-only. A missing service or denied scope must be corrected for the deployment owner; it does not trigger a silent fallback writer. See DEPLOYMENT.md and API_CONTRACTS_v0.6.09.md.
