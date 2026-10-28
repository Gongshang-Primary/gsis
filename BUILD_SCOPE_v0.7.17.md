# v0.7.17 build scope

The user authorised the next version and Stapler troubleshooting on 19 October 2026. The baseline is v0.7.16 at `60f7a92fe8b2e4604c8136ff000ae531e9c52ff6`.

| Queue item | Release scope |
| --- | --- |
| 018 | Remove unnecessary Inbox operations-store reads and the post-mutation thread request; retain drafts, audio and authoritative queue state |
| 019 | Remove the duplicate Calculations source-index read; explain actual weekly figures and configured SIUE allowance; state that KP status alone adds no queue preference |
| 020 | Home title Stapler, description Suspended Timeable Advance PLannER |
| 021, following 008 and 014 | Correct gzip Blob metadata; reduce saved-plan read dependencies; preserve the existing draft and provide useful load diagnostics |
| Earlier implemented items | Retain allocator rules, limits, absence flow, imports, exports, validation proofs, leases and publication boundaries |

The changed runtime components are the Deploy backend and Roster frontend. All five frontends and three complete Apps Script backends carry the current release label in the full package. Other components receive version-label updates only. The notification Worker's scheduled and dispatch logic is unchanged. Its generated dashboard includes updated shared gateway code, but the existing v0.7.16 Worker remains compatible and needs no redeployment for this targeted update.

Write protocol remains 500. The operations document and plans remain schema 1. The `gzip-base64-v1` storage format and validation version 1 remain compatible. Existing URLs, Staff IDs, properties, request receipts, editing leases and operational records remain in use. Opening a saved plan does not write a migration or replace the plan with baseline data.

The required production acceptance check opens the existing 21 October Revision 1 draft after deployment. The strict local gzip reproduction does not establish the cause of the live failure. No live deployment, deletion, reset, reimport, configuration change, timetable publication or staff message is part of preparing this package.
