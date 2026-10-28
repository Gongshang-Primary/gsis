# GSiS v0.7.18

Baseline: v0.7.17 at `2ba81ff1a09d8e146da1987139b5a5980ab74ab1`. The user authorised this release on 20 October 2026, Singapore time. The scope is Roster response time and reliability, restoration of the date and period absence form, and Stapler plan management.

## Report Absence

Start and End dates are directly visible again. Individual period buttons show their times, with Select All and Clear. Periods begin unselected so the teacher explicitly chooses the absence periods. The Today, Tomorrow, Both, Full day and Partial day controls are removed.

Submit absence remains a direct save. Relief instructions and own arrangements remain available through the existing optional editor. Current identity, date eligibility, absence type, allowed periods and overlap checks remain on the server. An uncertain save keeps its original request identity.

The loading work targets response time. Profile and the initial own-report data can arrive in one authenticated request. Unused Home warmups are deferred, identical in-flight reads are shared, and repeated visibility checks are coalesced. A missing or incompatible combined response falls back to the normal report read. If the combined report itself fails, the verified session stays open with an explicit Retry; saved records are never replaced with an empty result.

## Roster service work

Contacts reads retain current authority checks while removing sheet metadata work from the Roster directory path. No cross-request authority cache is introduced. The immutable baseline cache receives the gzip metadata needed for reliable cache decoding; a cache miss still reads and validates the source.

An accepted absence save can be checked through its exact request receipt without rebuilding the full report context. An absent receipt remains unconfirmed. It is not evidence that the original request failed or permission to send a new request ID.

Shared writes retain current-state validation, revision checks, exact retry receipts and bounded locking. Work that does not need the write lock is kept outside it where its dependencies can be checked again before commit. Local request-count and concurrency evidence belongs in PERFORMANCE_v0.7.18.md and VALIDATION.md; this release makes no unmeasured production speed claim.

## Stapler

Saved plans gain separate actions for their display name, planning date and recoverable deletion. Changing a name preserves the date and timetable. Changing a date preserves the final tiles while checking the destination date and baseline; it cannot overwrite another saved plan. Deleted plans remain recoverable through the supported restore action. Current authority, plan revision and editing ownership still apply.

Past or published history is protected. Management actions are not a way to overwrite historical relief or publication records. Save, Confirm and daily publication remain separate actions. A lost acknowledgement keeps the original management request for safe retry.

## Installation and remaining checks

The targeted update uses the complete Contacts backend, complete Deploy backend and Roster frontend. Retain the existing Apps Script deployments, URLs, properties, workbooks and operational files. The full package also contains the complete suite. See DEPLOYMENT.md for the exact installation steps.

The school's earlier baseline save/switch and existing 21 October Revision 1 plan still need installed readback. A visible date-list row is not proof that its plan contents opened. Keep that record and its pending save identity; do not delete or reimport it to diagnose a read failure.

Preparing this release does not deploy code, reset records, migrate school data, change live settings, publish a timetable or send staff messages.
