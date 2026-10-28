# v0.7.09 requirement reconciliation

Authoritative inputs are GSiS_Queued_Changes_After_v0.7.05.md version 31, the four exact submitted contracts recorded in GSiS_WhatsApp_Four_Template_Drafts.json version 1, and the explicit next-build instruction on 17 October 2026. The delivered v0.7.08 source is the baseline. Earlier requests already reconciled in the baseline are retained rather than reopened.

| Accepted request | Release behaviour |
| --- | --- |
| Publish is for that workday only | Roster Relief and Stapler require the current Singapore date and a verified Calendar school day, in UI and backend |
| Retain future planning | Future drafts and date-specific sponsorship request/decision flows remain available |
| Morning publication releases today's changes | Publication remains explicit; no timer automatically publishes; later same-day changes preserve duplicate suppression |
| Seven-field relief instructions | Exact submitted text with absent teacher name and Contacts mobile link, school email fallback |
| Today's timetable wording | Exact submitted text and private comparison link, without a school-name line |
| Sponsorship request wording | Exact submitted request text with requester identity and planning date |
| One outcome body for both recipients | Field 1 remains the requesting teacher's name, including the SMC copy |
| Use approved evening v1 | V1 retained; no deletion of Meta v2 |
| WhatsApp-ready package | Matching runtime, mappings and Worker artifacts; approval and live setup remain separate prerequisites |
| Production testing with own absence | No recipient allowlist added; no test message or activation performed in this build |
| Ponytail, Pstack, Thermonuclear review | Focused implementation review and independent final correctness/quality passes, recorded in release evidence |

The four revised templates were successfully submitted and read back before this build. Their last observed state was Pending, Utility, en_GB. The other 17 mapped routes were observed Approved. These observations are not delivery tests and do not enable sending.

No live deployment, platform configuration change, data cleanup, baseline activation or in-force Deploy publication is part of the build. Existing school identities, secrets, service URLs, privacy material, records and audit history remain. Final results are authoritative in VALIDATION.md and RELEASE_SUMMARY.json.
