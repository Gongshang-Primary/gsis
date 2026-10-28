# API contracts v0.6.09

Write protocol 500, relief schema 3 and calculationVersion `whole-week-v3` remain unchanged. Calendar retains workbook schema `v2 RC1.9`. Existing Contacts, Deploy and Calendar authentication, signed identity, role checks and shared secrets remain authoritative.

## Roster model and reads

The parsed Roster model accepts `recesses`, an array of `{level, period}` records. Level is an integer from 1 through 6 and appears at most once. Period is an integer within the imported source's period range. An older model without this field remains valid and is treated as having no recorded recess definition. Defaults are applied only to a new import: P1 period 3 through P6 period 8. A new import's editable last normal period starts at 16 and is capped by the source range.

The authenticated `rosterProfile` read accepts `preload:true` with the selected date. It returns the actual `active` entry, `upcoming` when no timetable is active, `selected`, `selection` (`current`, `upcoming` or null), and the selected parsed `model`. It also returns the register revision and verified user capability. Without preload, the profile omits the model. Management entries remain limited to current SMC users.

An implicit timetable read uses the current entry or, when absent, the next upcoming entry. It does not rewrite the register. An explicit archived entry read remains an SMC operation. A teacher cannot select arbitrary stored IDs to bypass that boundary. An upcoming response is labelled as upcoming and never represented as active for the requested date.

Browser memory holds parsed timetable data for navigation and export. Register changes, date changes and explicit refresh invalidate the relevant selection. Memory is not a cached access grant. Every backend request continues to verify current Contacts authority. Calendar date context retains the `rosterDate` contract from API_CONTRACTS_v0.6.06.md and is independent of whether a future Roster model has been prepared.

One account-scoped last displayed period preference is shared by Teacher, Class and Export and stored locally in that browser. Without a saved preference it uses the timetable's normal last period. The effective value is capped by the imported range without overwriting the preference. It affects the displayed and exported grid only; it does not remove imported periods or change the saved model, timetable validity or workload calculations. PDF and XLSX use the same timetable projection; no export writes to a school workbook or calendar.

## Roster storage and diagnostics

Storage uses Drive v3 requests with Shared Drive support. Immutable model and workbook writes precede the register update. The register remains the visibility boundary. A failure before that boundary can leave reusable orphan files, but cannot expose a partially saved timetable. Request IDs, request content checks, actor binding, stale revision checks and the existing lock remain in use.

Diagnostic metadata includes release/build, action, phase, elapsed time, reference, safe Drive operation, HTTP status and allowlisted reason codes. Tokens, file contents and provider response bodies are not included. `showRosterDiagnostics` reads temporary diagnostic cache. `checkRosterAccess` checks folders, register reads and the executing account's full Drive authorization status without creating a timetable.

## Calendar publication

Individual Published Staff events are eligible for sync without releasing their whole year. Teacher access to the Calendar planning year remains governed by the existing year release rule.

The authenticated `publishVersion` operation requires Admin and receives `{year, operationId}`. It releases the chosen year, publishes its live Hidden events and marks eligible Staff work for synchronization. The existing durable mutation receipt and atomic Sheets batch protect the publication. Repeating the same operation ID returns its original result and does not publish later Hidden events. An unresolved publication fences conflicting edits until its outcome is resolved. Parent publication choices are retained and no Parent sync starts implicitly.

After confirmed publication, the frontend refreshes the selected year's snapshot and uses the existing `startSyncYear` and `syncYearBatch` flow for Staff. A confirmed Sheet publication followed by an external Calendar failure remains published, with retryable sync work.

## Calendar API links

Ordinary Staff and Parent sync uses Calendar API v3 in the existing Calendar Apps Script project. Events sheet fields that currently hold CalendarApp `getId()` values remain iCalUID fields. API event IDs are tracked separately in durable MutationLog entries with Action `calendarLink`; the two identifier formats are never assumed to be interchangeable. Eligibility and pending removal also consult those durable records, so a lost Events row acknowledgement cannot hide remaining provider work. Client link flags affect display only; server eligibility and provider ownership are checked independently.

Legacy links are resolved through their iCalUID. Ambiguous or conflicting matches fail safely. New event IDs and private ownership metadata support recovery after an uncertain create. Linked events are checked before mutation. Conditional updates use the current provider ETag. On a conflict, sync rereads the event, preserves unrelated writable fields and reapplies the current GSiS fields. GSiS remains authoritative for the fields it owns. Staff and Parent calendars remain separate targets. Parent all-day behavior and existing time-zone and date semantics remain in force.

The existing Calendar access preflight uses API reads by default. An explicit write probe remains a separate deliberate action. A missing Calendar service or denied permission is a visible sync failure, with no silent fallback to a second writer. Existing explicit cleanup tools can retain CalendarApp operations. Incremental sync tokens and external edits imported into GSiS are outside this release.
