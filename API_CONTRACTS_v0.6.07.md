# API contracts v0.6.07

Write protocol 500, relief schema 3 and whole-week-v3 integer R remain unchanged. The existing Roster upload/update request shapes, request receipts, model schema, storage folders, revision checks, signed school identity and current Contacts SMC authorization are retained. Calendar's rosterDate contract remains as documented in API_CONTRACTS_v0.6.06.md; its release version is now 0.6.07 and its stored schema remains v2 RC1.9.

Transient Roster backend failures return `{ok:false,status:503,error,diagnosticId}`. The reference comes from the signed gateway trace ID and is logged with the backend phase, version and exception. The gateway returns a neutral read or unconfirmed-save message and that reference; it does not forward exception details. Existing explicit authorization/validation failures retain their status and message. Calendar failure still leaves a valid timetable available with unknown context.

Upload review is local and does not call a mutation endpoint. One parsed model and generated workbook form the pending upload. Retry sends the same payload and request ID; a pending write blocks other mutations. A confirmed save followed by a failed read remains confirmed.

The old TG demandMode field is no longer required, edited or used in demand calculation. Historical values are left inert in existing records. Each TG counts independently. The shared isFormSubject predicate defines the offered class provision for IP Deploy and workload demand; existing actual assignments remain counted. No migration or read-time write occurs.

checkRosterAccess is an editor-only owner diagnostic. It reads the three Roster folders and register, reporting version, revision and count. It does not create files, reset storage, grant access or prove archive write permission.
