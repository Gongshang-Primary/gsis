# GSiS v0.9.8 Roster recovery scope

User instruction on 26 October 2026: restore critical Roster operations quickly, using Workers for Report Absence, Assign Relief and scheduled allocation, including the previously requested WhatsApp restoration. Pause the unfinished v0.9.7 migration.

## Architecture decision

Keep the current Google operational records authoritative. The Roster Pages Worker authenticates and forwards school requests. The notification Worker processes durable captured reports, runs the existing allocation schedule, and dispatches notifications. The old D1 receipt transport and notification Queue remain in use; they are not the migrated operational database.

The recovery runtime does not delegate to the private operations Worker or start paid background jobs. Google migration fences still protect any already active D1 installation. This package is for the school installation whose Roster migration remained in legacy mode; it is not a data rollback from an active D1 store.

## Delivery

Three updated components: Roster Apps Script, Roster Pages ZIP and the notification Worker. Existing authentication, Calendar reads, Contacts authority, allocation rules, quiet hours, manual assignments and saved records remain applicable. The recovery scheduler prioritises the critical lanes and suspends unrelated scheduled jobs.

## Confirmed incident

Two retained absence reports cover 26 October to 2 December. The current primary store already contains five records on 26–30 October. Both reports fail overlap validation. Reports needing review remain unresolved and block allocation and timetable notifications for their dates. This logic is identical in the v0.9.4/v0.9.5 packages and v0.9.7; a code rollback cannot remove persisted blockers.

The patch exposes safe rejection categories and adds an SMC review view of the original report and current saved coverage. Operators save missing attendance, verify existing coverage, and explicitly withdraw superseded receipts. It does not silently treat every overlap as an approved duplicate, remove valid reports, or bypass the pending-attendance gate.

## Acceptance

1. Leftover private service bindings and paid background settings do not route this recovery build away from Google.
2. Active Google migration fences continue to reject legacy writes.
3. Valid absence reports reach saved records through the existing signed Worker path.
4. Manual relief edits and the allocator retain their existing validation and receipts.
5. A pending report is reported as a blocker, not successful allocation or an unexplained error.
6. Existing queued notices, delivery callbacks, inbox messages and peer mail retain durable processing.
7. Review reads require current SMC or Admin access and make no record changes.
8. Production recovery is claimed only after saved absences, a completed allocation cycle and intended notification delivery are observed.

## Deployment boundary

Local builds and checks are authorised by the recovery request. No live deployment or sending from the assistant is performed. The user installs the three components in the existing projects. There is no database migration, storage reset or new secret in this release.
