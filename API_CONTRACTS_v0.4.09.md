# GSiS v0.4.09 API contracts

Deploy write protocol is **409**. Install matching frontend/backend files and reload. Authentication, field storage, journals and receipts are retained.

`saveDraft` adds:

- `initReporting {expected: null, value: {staff, officers: {}}}`: Admin/KP only. The server independently derives the full active snapshot from Contacts plus this version's teacher overrides and compares it with the requested snapshot. A changed source or previously initialized version returns 409. New versions already have a snapshot. Duplicates preserve the source snapshot and links.
- `setReportingOfficer {officer, value: reportingOfficerId | "", expected}`: Admin/KP only. Saves one relationship. The server checks active eligibility, self-links, cycles and compare-and-set state against the current version. Other relationship cells, teaching assignments and Contacts are not rewritten.
- `consolidateCCEEL {expected: {groups, assignments, loads}}`: explicit version migration. One TG per applicable level, stable retained TG ID where available, each teacher counted once. The original CCE EL assignment records remain in `cceELScope.previousAssignments`. Unrelated subjects and teacher records are retained. Conflicting mixed-subject groups must be reviewed first. New versions consolidate automatically; existing published data is not converted merely by reading it.

`reporting` and `cceELScope` use the existing flattened field store. RO mappings use stable staff IDs. Reporting data is excluded from basic-user version views and is not added to Contacts/public Layout exports.

Contacts `saveData` keeps its existing payload shape and Admin-only rules. Pure additions do not require the legacy value-migration backup. Empty template rows are reused only if all non-derived fields are empty; identity is reserved before values are written. Existing edits still retain the migration backup guard. Unknown outcomes retain the original request ID and payload. A definitive validation/conflict response before a pending transaction can mark the draft editable; pending or uncertain saves keep the original ID.

Contacts failure responses include a safe `reference {version, requestId, phase}`. Server diagnostics record the event, status, error type and that reference, never contact payloads, raw exception messages, stacks or credentials.

Fortnight and PD label changes are presentation filters/aliases: no stored split row or historical load is deleted.
