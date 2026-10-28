# v0.7.15 build scope

The user authorised the full v0.7.15 commit and package on 19 October 2026. Start from v0.7.14a, not the unpatched v0.7.14 source.

| Queue item | Release scope |
| --- | --- |
| 001 to 005 | Retain the v0.7.14 exports, Name Bridge, scored allocation, import control and courtyard shelter changes |
| 006 | Carry forward v0.7.14a final suspended day import, full day blanks, name resolution and baseline fallback |
| 007 | Reduce repeated lock metadata reads and show the fresh timetable while editing access is checked |
| 008 | Fix the backend Save request limit and verify Save without Confirm survives fresh storage readback |

Canonical owners remain backend/Code.gs, backend/StaplerLeases.gs and roster-update/public/roster-stapler-ui.js. The existing release builder synchronises generated code. The release label helper now accepts an explicit component patch label so both 0.7.14 and 0.7.14a become 0.7.15.

Write protocol remains 500. Existing project URLs, properties, identities, operational document, allocation rules, authority checks, audit, request replay, date revisions and lease fences remain in use. No migration or store reset is required. Nonempty offline reliefAbsences remain a separately deferred scope.

Full packaging includes five frontend ZIPs, three complete Apps Script backend sources, notification Worker source and dashboard text, matching documentation, source, repository history and verification evidence. Tests use local service doubles and browser fixtures; live deployment and production verification remain separate.
