# GSiS v0.8.1d component patch

Required installed baseline: v0.8.1c. Authorised by “surgical patch for item 060 too” on 21 October 2026, Singapore time.

## Item 060: reusable private teacher links

The signed capability is already reusable on the server. The private page removed the token fragment from the address bar and then relied on tab-scoped session storage. Reopening a copied or bookmarked post-open URL in a fresh browser context, or refreshing with unavailable session storage, could therefore lose access. This was not a server-side one-time-use token.

The private page retains the fragment and restores it when recovering a previously stripped link from the existing tab's session storage. Following a different fragment loads a fresh document, keeping teacher/date links and pending actions separate. Authorization failures clear displayed private content; Refresh can still ask the server to validate the complete link again.

Opening, refreshing and acknowledging do not consume the link. Existing signature, teacher/date scope, public access without school sign-in and time-based expiry remain unchanged. Expiry is the earlier of seven days after issue or 23:59:59 Singapore time on the day after the timetable date. Acknowledgement remains idempotent and independent of access. The fragment is not sent in the HTTP request URL or referrer; the API continues using its existing bearer authorization header.

## Deployment and merge

Only Roster frontend changes. Retain Deploy backend v0.8.1c and notification Worker v0.8.1b. The ZIP contains the complete Roster frontend, installation instructions, this changelog, validation, suite merge notes, a source manifest and checksums. Component packaging now supports a frontend-only patch without emitting or requiring an unchanged backend under a new version.

Items 053–059 remain carried forward in SUITE_MERGE.md. No automatic morning teacher batch, WhatsApp send or live deployment is added by this patch.

## New queued requests

Items 061 (private-link loading speed) and 062 (WhatsApp “Open timetable” URL buttons) were investigated during this patch and remain queued for the next authorised implementation. SUITE_MERGE.md records their scope. No live template change was made.

## Verification

The new browser regression failed before the fix and passes after it. The full run passed 455/456 scripts; the remaining backend-version expectation was corrected and its complete test passed on follow-up. All 456 current scripts are verified across those runs. Independent reviews, Apps Script syntax and the frontend-only archive checks passed. See VALIDATION_v0.8.1d.md and RELEASE_SUMMARY_v0.8.1d.json for exact results and limits.
