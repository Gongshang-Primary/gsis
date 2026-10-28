# v0.7.12 requirement reconciliation

All accepted source requirements are implemented and locally verified in v0.7.12. Historical request logs are retained; this disposition is authoritative. Deployment archive integrity passed; see VALIDATION.md.

| Accepted requirement | Source owner | Release disposition |
| --- | --- | --- |
| Verified IndexedDB baseline cache and local timetable views | roster-baseline-cache.js, roster.js | Included |
| Compact No Relief Needed saves, source checks, safe exact retry | RosterOperations.gs, roster-operations-ui.js | Included |
| Concurrent independent absence reporting | RosterOperations.gs | Included |
| Persistent No relief instructions needed action | roster-operations-ui.js | Included |
| Manage my absences and Manage school-wide absences labels | roster-operations-ui.js, roster.js | Included |
| Precise Report Absence staff exclusions | Contacts projection, roster-operations.js, roster-operations-ui.js | Included |
| Default shared Form lesson rule and Admin subject configuration | roster-operations.js, roster-settings-ui.js | Included |
| Wildcard then specific exclusions and resulting population | roster-settings-ui.js | Included |
| Upward health bars with paired green and red teacher markers | roster-allocation.js, roster-operations-ui.js, roster-operations.css | Included |
| Named scheduled duty lists with immediate Activate | roster-operations.js, roster-duty-ui.js | Included |
| Exclusive dated Stapler editor and expiry/Admin recovery | StaplerLeases.gs, RosterOperations.gs, roster-stapler-ui.js | Included |
| Level recess block swaps and Card Pit displacement | roster-stapler.js, roster-stapler-ui.js | Included |
| Stapler toolbar Export Excel using offline workbook format | roster-stapler-export.js | Included; duplicate project-chat request reconciled |
| SMC/Admin WhatsApp Inbox with voice/reply/history and duty alerts | RosterInbox.gs, roster-inbox.js, roster-inbox-ui.js, workers | Included; activation separate |
| First menu item Report Absence linking to current relief system | Roster Pages worker, roster-operations.js | Included |
| Safe Meta error diagnostics and regenerated Worker | Roster Pages worker, build-notification-worker.py | Already in v0.7.11; retained and rechecked |
| Courtyard geometry and System Config gear icon | landmark.html, system-config.svg | Included |

The older v0.7.04 and earlier queues already have completed release dispositions. The latest v0.7.05 queue was reread from its current saved version; its new entries are the four Worker diagnostics and the two duplicate/orphaned requests above. No pending source request is inferred solely from an old historical word such as queued.

## Operating checks that source changes cannot close

1. The installed Auto-allocate error with diagnostic reference 490496f0-7ab8-4a7d-8f78-82e6dc290e7b still needs its Worker log to establish the specific production cause.
2. Historical startup loading incidents and actual morning-rush latency require installed-service traces. Controlled payload/work measurements are not live response-time guarantees.
3. Historical live absence cleanup and pruning remain explicit operational actions. This release does not change live school records.
4. WhatsApp Inbox activation needs private audio storage, matching installed components and a separately approved duty-alert template. No provider delivery or live message was tested by the release build.
5. Subject exclusion changes retain each saved absence's captured policy. This is the retained product behavior, not an omitted implementation of retroactive changes.

The user asked to complete the two existing changelog reviews before the release. The two quoted updates concern the same No Relief Needed cell-save optimisation. Its reviews and checks completed before changelog commit 4daf4d6 and reviewed-source checkpoint 931a6a2.
