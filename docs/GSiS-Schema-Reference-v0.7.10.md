# GSiS v0.7.10 schema reference

This is the storage contract found in the source package. GSiS uses Google Sheets and JSON files, not a SQL database. Column order below is the code-defined order for newly created tables. Existing header-based readers can accept compatible column order. Never rename columns, sort journal rows or edit JSON storage directly. A relationship in the diagrams is an application reference, not a database foreign-key constraint.

## Ownership and keys

| Store | Owner | Stable references |
| --- | --- | --- |
| Contacts workbook | Contacts Apps Script | Staff ID; Google subject binding; application access email |
| Deploy workbook | Deploy Apps Script | Version ID; commit; field path; request ID |
| Venue register | Deploy / Layout controlled workflow | Unit number, with controlled rename recovery |
| Calendar workbook | Calendar Apps Script | Year, EventID, LaneID, mutation OperationID |
| Roster register and models | Deploy Apps Script | Baseline entry ID and immutable model/workbook file IDs |
| Roster operations JSON | Deploy Apps Script | Stable staff IDs, dated demands, assignment/request/publication IDs |

## Contacts physical sheets

Source: `Contacts_Code.gs: DATA_FIELDS, MEMBERSHIP_FLAGS, setupBlankContacts, access_, ownStaff_`.

### contacts

| Column | Header |
| --- | --- |
| 1 | `TTb Name` |
| 2 | `Basic Name` |
| 3 | `Statutory Name` |
| 4 | `iCON Alias (@moe.edu.sg)` |
| 5 | `CES Alias (@schools.gov.sg)` |
| 6 | `GSPS Alias (@gsps.edu.sg)` |
| 7 | `Mobile No` |
| 8 | `EXT` |
| 9 | `Day of Birth` |
| 10 | `Month of birth` |
| 11 | `Role` |
| 12 | `EO Appt Level` |
| 13 | `Appointment Status` |
| 14 | `Employment Modifier` |
| 15 | `Subject Modifier` |
| 16 | `Active` |
| 17 | `MK Modifier` |
| 18 | `Staff ID` |

### roles

| Column | Header |
| --- | --- |
| 1 | `Role Shortform` |
| 2 | `Formal Role Name` |
| 3 | `EO Appt Level` |
| 4 | `SL` |
| 5 | `SC` |
| 6 | `SMC` |
| 7 | `KP` |
| 8 | `TL` |
| 9 | `SDT` |
| 10 | `CMT` |
| 11 | `SAT` |
| 12 | `Support` |
| 13 | `MK` |

### admin_users

| Column | Header |
| --- | --- |
| 1 | `Email` |
| 2 | `Role` |
| 3 | `Active` |
| 4 | `Updated At` |
| 5 | `Admin ID` |

### sys_fields

| Column | Header |
| --- | --- |
| 1 | `Field` |
| 2 | `Value` |

### offload

| Column | Header |
| --- | --- |
| 1 | `Tags` |
| 2 | `Offload Factor` |
| 3 | `Notes` |

### contact_identity_bindings

| Column | Header |
| --- | --- |
| 1 | `Subject` |
| 2 | `Staff ID` |
| 3 | `Original email` |

## Contacts journals and recovery sheets

Source: `Contacts_Code.gs: contactJournal_, catalogueJournal_, recalculate helpers`.

### contact_save_journal

| Column | Header |
| --- | --- |
| 1 | `Request ID` |
| 2 | `Actor` |
| 3 | `Kind` |
| 4 | `Digest` |
| 5 | `Status` |
| 6 | `At` |
| 7 | `Payload` |

### contact_deploy_approvals

| Column | Header |
| --- | --- |
| 1 | `Request ID` |
| 2 | `Actor` |
| 3 | `Version` |
| 4 | `Payload` |
| 5 | `Status` |
| 6 | `At` |

### catalogue_journal

| Column | Header |
| --- | --- |
| 1 | `Commit` |
| 2 | `Part` |
| 3 | `JSON` |

### contact_recalculate_journal

| Column | Header |
| --- | --- |
| 1 | `Request ID` |
| 2 | `Actor` |
| 3 | `Kind` |
| 4 | `Digest` |
| 5 | `Status` |
| 6 | `At` |
| 7 | `Plan` |
| 8 | `Recovery actor` |
| 9 | `Recovery at` |

### contact_recalculations

| Column | Header |
| --- | --- |
| 1 | `At` |
| 2 | `Actor` |
| 3 | `Records` |
| 4 | `Rules` |

### contact_recalculate_parts

| Column | Header |
| --- | --- |
| 1 | `Request ID` |
| 2 | `Part` |
| 3 | `JSON` |

## Deploy physical sheets

Source: `backend/Code.gs: setupDeploy; backend/FieldStore.gs: fieldPersist_, receiptSheet_, fieldJournal_`.

### deploy_index

| Column | Header |
| --- | --- |
| 1 | `Key` |
| 2 | `JSON` |

### deploy_documents

| Column | Header |
| --- | --- |
| 1 | `Version ID` |
| 2 | `Commit ID` |
| 3 | `Part` |
| 4 | `JSON` |

### fields_<version hash>

| Column | Header |
| --- | --- |
| 1 | `Field` |
| 2 | `JSON` |

### editidx_<version hash>

| Column | Header |
| --- | --- |
| 1 | `Field` |
| 2 | `Row` |

### fastidx_<version hash>

| Column | Header |
| --- | --- |
| 1 | `Field` |
| 2 | `Row` |
| 3 | `JSON` |

### viewidx_<commit hash>

| Column | Header |
| --- | --- |
| 1 | `Field` |
| 2 | `JSON` |

### auditidx_<version hash>

| Column | Header |
| --- | --- |
| 1 | `ID` |
| 2 | `At` |
| 3 | `Actor` |
| 4 | `Action` |
| 5 | `First` |
| 6 | `Last` |

### deploy_field_journal

| Column | Header |
| --- | --- |
| 1 | `Commit` |
| 2 | `Part` |
| 3 | `JSON` |

### deploy_save_receipts

| Column | Header |
| --- | --- |
| 1 | `Request ID` |
| 2 | `Version ID` |
| 3 | `Actor` |
| 4 | `Parts` |
| 5 | `JSON` |

## Venue register

Source: `backend/Code.gs: readLandmarkRegistry_`.

### Venues

| Column | Header |
| --- | --- |
| 1 | `Unit number` |
| 2 | `Venue name` |
| 3 | `Short name` |
| 4 | `Block` |
| 5 | `Level` |
| 6 | `Capacity` |
| 7 | `Capacity basis` |
| 8 | `Notes` |

## Calendar physical sheets

Source: `calendar-backend/Code.gs: CALV2.HEADERS`.

### Settings

| Column | Header |
| --- | --- |
| 1 | `Key` |
| 2 | `Value` |
| 3 | `Description` |

### Years

| Column | Header |
| --- | --- |
| 1 | `Year` |
| 2 | `Status` |
| 3 | `ReleasedToTeachers` |
| 4 | `RamadanStart` |
| 5 | `RamadanEnd` |
| 6 | `MOEPressReleaseURL` |
| 7 | `MOECalendarURL` |
| 8 | `MUISCalendarURL` |
| 9 | `CreatedAt` |
| 10 | `CreatedBy` |
| 11 | `UpdatedAt` |
| 12 | `UpdatedBy` |
| 13 | `ArchivedAt` |
| 14 | `ArchiveSpreadsheetFileId` |
| 15 | `ArchivePdfFileId` |
| 16 | `ArchiveStatsFileId` |

### Lanes

| Column | Header |
| --- | --- |
| 1 | `LaneID` |
| 2 | `Header` |
| 3 | `SortOrder` |
| 4 | `Active` |
| 5 | `SupportsShift` |
| 6 | `ShiftALabel` |
| 7 | `ShiftBLabel` |
| 8 | `DefaultWeekday` |
| 9 | `DefaultEventType` |
| 10 | `DefaultStartTime` |
| 11 | `DefaultEndTime` |
| 12 | `ShiftADefaultStartTime` |
| 13 | `ShiftADefaultEndTime` |
| 14 | `ShiftBDefaultStartTime` |
| 15 | `ShiftBDefaultEndTime` |
| 16 | `SyncToStaffCalendar` |
| 17 | `Notes` |

### LaneSchedule

| Column | Header |
| --- | --- |
| 1 | `LaneID` |
| 2 | `Weekday` |
| 3 | `Enabled` |
| 4 | `DefaultStartTime` |
| 5 | `DefaultEndTime` |
| 6 | `ShiftADefaultStartTime` |
| 7 | `ShiftADefaultEndTime` |
| 8 | `ShiftBDefaultStartTime` |
| 9 | `ShiftBDefaultEndTime` |

### Tags

| Column | Header |
| --- | --- |
| 1 | `Tag` |
| 2 | `Meaning` |
| 3 | `Active` |
| 4 | `SortOrder` |
| 5 | `CreatedAt` |
| 6 | `CreatedBy` |
| 7 | `UpdatedAt` |
| 8 | `UpdatedBy` |

### Users

| Column | Header |
| --- | --- |
| 1 | `UserAlias` |
| 2 | `DisplayName` |
| 3 | `IsAdmin` |
| 4 | `IsParentPublisher` |
| 5 | `Active` |
| 6 | `AddedAt` |
| 7 | `AddedBy` |
| 8 | `Notes` |

### Events

| Column | Header |
| --- | --- |
| 1 | `EventID` |
| 2 | `Year` |
| 3 | `Status` |
| 4 | `LaneID` |
| 5 | `ShiftSpan` |
| 6 | `OwnerTag` |
| 7 | `StaffTitle` |
| 8 | `StaffDescription` |
| 9 | `Location` |
| 10 | `EventType` |
| 11 | `StartDate` |
| 12 | `EndDate` |
| 13 | `StartTime` |
| 14 | `EndTime` |
| 15 | `ParentEnabled` |
| 16 | `ParentTitle` |
| 17 | `ParentDescription` |
| 18 | `StaffCalendarEventId` |
| 19 | `StaffSyncHash` |
| 20 | `StaffSyncState` |
| 21 | `ParentCalendarEventId` |
| 22 | `ParentSyncHash` |
| 23 | `ParentSyncState` |
| 24 | `LastSyncedAt` |
| 25 | `CreatedAt` |
| 26 | `CreatedBy` |
| 27 | `UpdatedAt` |
| 28 | `UpdatedBy` |
| 29 | `DeletedAt` |
| 30 | `LastMutationID` |

### MutationLog

| Column | Header |
| --- | --- |
| 1 | `OperationID` |
| 2 | `UserAlias` |
| 3 | `Action` |
| 4 | `PayloadHash` |
| 5 | `State` |
| 6 | `EventID` |
| 7 | `ResultJSON` |
| 8 | `ErrorJSON` |
| 9 | `CreatedAt` |
| 10 | `UpdatedAt` |

### YearStructure

| Column | Header |
| --- | --- |
| 1 | `StructureID` |
| 2 | `Year` |
| 3 | `Kind` |
| 4 | `Label` |
| 5 | `Term` |
| 6 | `Week` |
| 7 | `StartDate` |
| 8 | `EndDate` |
| 9 | `SyncToStaffCalendar` |
| 10 | `SourceURL` |
| 11 | `Notes` |
| 12 | `CreatedAt` |
| 13 | `CreatedBy` |
| 14 | `UpdatedAt` |
| 15 | `UpdatedBy` |
| 16 | `DeletedAt` |

### ColourRules

| Column | Header |
| --- | --- |
| 1 | `RuleID` |
| 2 | `Priority` |
| 3 | `RuleType` |
| 4 | `Field` |
| 5 | `Operator` |
| 6 | `Value` |
| 7 | `FillColour` |
| 8 | `TextColour` |
| 9 | `BorderColour` |
| 10 | `Active` |
| 11 | `Locked` |
| 12 | `Notes` |

### MigrationReview

| Column | Header |
| --- | --- |
| 1 | `MigrationID` |
| 2 | `SourceYear` |
| 3 | `SourceRow` |
| 4 | `SourceDate` |
| 5 | `SourceColumn` |
| 6 | `RawText` |
| 7 | `SuggestedTitle` |
| 8 | `SuggestedLaneID` |
| 9 | `SuggestedShiftSpan` |
| 10 | `SuggestedOwnerTag` |
| 11 | `Confidence` |
| 12 | `Status` |
| 13 | `ResolvedEventID` |
| 14 | `Notes` |
| 15 | `CreatedAt` |
| 16 | `ResolvedAt` |
| 17 | `ResolvedBy` |

### AuditLog

| Column | Header |
| --- | --- |
| 1 | `AuditID` |
| 2 | `Timestamp` |
| 3 | `UserAlias` |
| 4 | `Action` |
| 5 | `EntityType` |
| 6 | `EntityID` |
| 7 | `BeforeJSON` |
| 8 | `AfterJSON` |
| 9 | `RequestID` |

### SyncLog

| Column | Header |
| --- | --- |
| 1 | `SyncRunID` |
| 2 | `Timestamp` |
| 3 | `Year` |
| 4 | `UserAlias` |
| 5 | `StaffCreates` |
| 6 | `StaffUpdates` |
| 7 | `StaffDeletes` |
| 8 | `ParentCreates` |
| 9 | `ParentUpdates` |
| 10 | `ParentDeletes` |
| 11 | `Errors` |
| 12 | `DurationMs` |
| 13 | `PdfFileId` |
| 14 | `PdfDownloadURL` |
| 15 | `DetailsJSON` |

### PDFLog

| Column | Header |
| --- | --- |
| 1 | `PDFID` |
| 2 | `Year` |
| 3 | `GeneratedAt` |
| 4 | `GeneratedBy` |
| 5 | `FileName` |
| 6 | `FileId` |
| 7 | `DirectDownloadURL` |
| 8 | `DomainShared` |
| 9 | `SyncRunID` |
| 10 | `Notes` |

### DayNotes

| Column | Header |
| --- | --- |
| 1 | `NoteID` |
| 2 | `Year` |
| 3 | `Date` |
| 4 | `Text` |
| 5 | `CreatedAt` |
| 6 | `CreatedBy` |
| 7 | `UpdatedAt` |
| 8 | `UpdatedBy` |

## Deploy JSON and projections

`deploy_index!B2` contains the commit index: revision, active/planning version list, published entry, requests and recovery pointers. Each version points to its canonical field store and supported read projections. `Field` contains a JSON path; `JSON` stores that path's serialized value. The field store reconstructs the version model, including teachers, classes, groups, assignments, loads, organisations, settings, audit and receipts. It is not one sheet per business entity.

`deploy_documents` is the compatible older chunked snapshot store. New writes use the field store. Projection sheets are derived from canonical fields and are committed by the same journal. Do not rebuild or clear a projection by hand. The index marker changes only after the transaction's cells are written. A pending marker causes read/recovery handling rather than a partial successful read.

## Roster file schemas

### Roster register.json

`schema`, `revision`, `entries[]`, `receipts[]`.

### Register entry

`id`, `name`, `from`, `to`, `modelFile`, `workbookFile`, `teacherCount`, `layoutMode`, `createdAt`, `createdBy`, `pruned`, `priority`.

### Baseline model JSON

`layoutMode`, `sourceMode`, `single OR odd + even`, `timing`, `recesses[]`, `teacherCount`, `maxPeriod`.

### Week model

`days[]`, `blocks[]`, `maxPeriod`, `perDay`.

### Teacher block

`name`, `cells[][4]`.

### Period cell

`0: Subject`, `1: Class`, `2: Venue`, `3: Group`.

### Timing / recess

`startMinutes`, `periodMinutes`, `normalLastPeriod`, `endOfDayMinutes (optional)`, `recesses[].level`, `recesses[].period`.

Each baseline week has Monday through Friday. Each teacher block has exactly five times `perDay` cells. Each cell contains four strings in Subject, Class, Venue, Group order. Single-week models have `single`; odd/even models have both `odd` and `even` with the same teacher names and period counts. Source: `shared/roster.js: validate`.

The archived `.xlsx` workbook is stored separately in Previous Timetables. Validated model JSON is in Operational Data. The register refers to both. Pruning a register entry does not mean deleting every file. Source: `backend/Roster.gs: rosterIndex_, rosterCommit_, rosterDispatch_`.

### Roster operations.json

One schema-1 document contains the authoritative operational state. Core arrays are `types`, `absences`, `adhoc`, `assignments`, `requests`, `outbox`, `audit`, `receipts` and `deliveryEvents`. Allocation adds arrays for `entitlements`, `reliefCorrections`, `importedRelief`, `rotationEvents`, `optimisationRuns`, `smcDutyRoster`, `smcAlerts`, `publicationSnapshots`, `acknowledgements`, `customInstructions`, `recessActivations`, `inboundEvents`, `staplerPlans`, `staplerRequests` and `staplerArchives`.

Operational maps include `healthWarningState`, `dayRevisions`, `accountingProfiles`, `accountingYears`, `scheduleReceipts`, `notificationWatermarks`, `inboundSessions`, `manualAuditBaselines` and `massPublications`. Version 0.7.10 adds `systemConfig`, `dailyEmploymentSettings`, `dailyEmploymentSnapshots`, `dailyEmploymentMail` and `dailyEmploymentAutomatic` through `operationalSettings`. They are part of the same operational document and revision.

`systemConfig` contains `noReliefSubjects[]` (`type`, `value`), `allocationPreferences[]` and `scheduledAllocationEnabled`, with `updatedAt`/`updatedBy` after a save. `dailyEmploymentSettings` contains `recipients[]` (`staffId`, `emails[]`), `subject`, `time` and save metadata. A report snapshot contains `date`, `capturedAt`, `revision`, `health`, `absences[]`, `reliefTeachers[]` and `externalTeachers[]`. Each mail job carries a stable ID, automatic/manual key, date, recipient address, subject, status and lifecycle metadata. Delivery state is separate from the immutable original report content. See `shared/roster-operations.js: operationalSettings, employmentSnapshot, queueDailyEmployment` and `backend/RosterOperations.gs: rosterDailyEmploymentMailDispatch_`.

Stapler drafts and published snapshots can be stored as gzip/base64 envelopes. `encoding: gzip-base64-v1` carries `bytes` and `data`. A published snapshot identical to the draft can use `same-as-draft-v1`. A runtime reader exposes compatible logical plans after validation. Copying the JSON file preserves these bytes; editing them does not. Source: `backend/RosterOperations.gs: rosterOperationsPackPlans_ / rosterOperationsUnpackPlans_`.

### Key logical connections

| From | Reference | To |
| --- | --- | --- |
| Absence | staffId and date | Contacts Staff ID and the selected school date |
| Relief demand | absenceId, period, timetableId | Saved absence and valid baseline entry |
| Assignment | demandId, staffId, date, period | Demand, recipient and dated slot |
| Publication snapshot | assignmentId, staffId, date, revision | Exact published duty/instruction content |
| Acknowledgement | Publication/version identity | Exact recipient-visible published content |
| Outbox job | Recipient, kind and current payload/reference | Pending provider intent, not proof of delivery |
| Delivery event | Provider message ID plus expected recipient | Correlated send attempt |
| Entitlement | staffId, week, year and source | Recorded R denominator and source evidence |
| Stapler plan | date, baseline and revision | Dated draft/published overlay |
| Report snapshot | Date and original captured content | Immutable historical daily employment report |

There is no shared transaction across Contacts, Deploy, Google Calendar, Drive, MailApp and Meta. Stable IDs and receipts support explicit recovery. A staff rename must not create a new identity or change historical references.

## Source snapshot and diagram evidence

The HTML pages were authored from this release's local source snapshot. They do not use an invented Git revision and do not assert live deployment state. `architecture-source/` retains the diagram inputs. Automated renderer receipts record diagram validation, provenance and browser gates; these are separate from application tests and live service verification.
