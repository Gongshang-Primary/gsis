# GSiS v0.7.09

Prepared from v0.7.08 for the authorised next build on 17 October 2026.

## Current workday publication

Roster Relief and Stapler Publish require the current Singapore date and a verified Calendar school day. The UI explains when publication is unavailable, and the backend enforces the rule within the existing write authority. Future plans remain editable drafts. Sponsorship requests and decisions can still concern future dates.

Publication remains deliberate. No scheduled task publishes a draft. Later publication on the same day updates affected teachers while unchanged content retains its duplicate suppression. The daily timetable notice is checked again before dispatch so a delayed job cannot describe another date as today. Existing historical and previously published future data is retained. A plan published early by an older release needs explicit publication again on its actual school workday before releasing the day’s notices.

## Four revised WhatsApp contracts

Use the exact bodies, fields, language and hashes submitted to Meta on 17 October 2026. All four were last verified Pending, Utility, en_GB. The other 17 current routes were verified Approved. Approval remains a runtime prerequisite, separate from activation and delivery.

| Route | Change |
| --- | --- |
| Conditional relief instructions | Seven fields, including absent teacher name and a Contacts WhatsApp link with school email fallback when mobile is unavailable |
| Today's timetable | The accepted change summary and private comparison link, without the school-name line |
| Suspended timetable request | The accepted request for sponsorship, including requesting teacher and planning date |
| Suspended timetable outcome | Requesting teacher name is field 1 for both the teacher and SMC recipient |

The evening route continues to use approved v1. V2 remains on Meta. The unused Marketing attention v1 remains unused; the current attention route uses Utility v2.

## Reliability and delivery boundary

Preserve atomic operational writes, current authority, exact-retry receipts, publication revisions and notification leases. Timetable selection and filters retain their local cache behaviour. The new rules do not introduce a new service, database or persistent browser staff cache.

The release updates generated Workers, exact contract configuration, setup guidance and deployment packages together. Keep all sending, menu, automation and diagnostic activation flags disabled. No new template submission, live send, live deployment, data reset or in-force Deploy publication is performed by this build.

See VALIDATION.md and RELEASE_SUMMARY.json for the checks actually completed and any remaining limits.

## Review fixes

Legacy early publication now excludes original assignments replaced by a pending draft, preventing old cover from being revived. Current-day cancellation snapshots preserve original publication history. Snapshot-backed SMC reminders use the same actual-day publication authority as teacher notices. Large timetable change summaries give a complete changed-period count/list and retain full detail in the linked comparison.

Packaging excludes intermediate ZIP artifacts from the source archive. The package integrity check enforces this on every build.
