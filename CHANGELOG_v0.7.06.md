# GSiS v0.7.06 changes

Authorised on 16 October 2026, Singapore time, from v0.7.05. Implementation and local verification are complete. This release produces deployment files. It does not create a Git commit or deploy a live service.

## Roster uses the loaded timetable

The release addresses delays in Report Absence, Manage reported absences, Own Arrangements, Check Availability and Assign Relief. The immutable staff timetable and current operational records have separate lifetimes. A loaded timetable can supply names, lessons and baseline free periods before current operational checks finish.

Check Availability uses cached timetable names so name search, selection and baseline comparison do not wait for a directory response. Current absences, relief assignments and other eligibility rules remain separate. A blank timetable cell is a baseline preview, not confirmed live availability. Unmatched names cannot become verified staff identities through a name guess.

Report Absence and Own Arrangements use the loaded baseline for period choices and initial matrix display. Current checks still govern saved absences and colleague requests. Manage reported absences uses a record-only list read. Ordinary record changes do not need to discard every loaded timetable or unrelated view.

The implementation narrows unnecessary backend reads and calculations while preserving the existing atomic save and exact request receipt. API_ROSTER_OPERATIONS_v0.7.06.md records the contracts. PERFORMANCE_v0.7.06.md records the measured local behavior.

## Progress remains visible

The loading and saving wheel rotates at constant opacity. Reduced-motion mode uses slower rotation instead of an opacity pulse. The existing single progress overlay, blurred background and readable status remain.

## WhatsApp Readiness moves to Home

WhatsApp Readiness is a separate SMC-only Home function. Manage Ad-hoc relief no longer includes the readiness and delivery-review panels. The new page reports configuration and cached approval state. Opening it does not request a new Meta scan, send a message or activate automation.

## Recess Regression uses generated supervision rows

Roster generates virtual supervision rows from actual classes. Matching class suffixes share a row across existing levels. With Haze Recess as the base name, Haze Recess P contains existing P classes, while Haze Recess Gt contains only the levels where Gt exists. The base name is configurable and does not define internal demand identity.

These rows represent supervision demand. They do not add real staff to Contacts or workload denominators. The supervising teachers retain the normal relief and accounting rules.

SMC selects dates and affected levels once. Activation creates unassigned slots. SMC reviews them, clicks Auto-allocate explicitly and publishes separately. This is the announced conservative build default because the final allocation question was unanswered. Repeated or overlapping activation must not duplicate the same class, date and period demand. Existing valid assignments remain protected under the established rules.

## Retained behavior and limits

Current R, suitability tiers, annual accounting, publication and private-recipient access retain their existing rules. WhatsApp and scheduled automation remain paused. The privacy page and its assets remain unchanged. Evening v1 stays selected, evening v2 stays on Meta, and the conditional template submission remains prepared only.

Install the matching backends before the Roster frontend. Final local checks are recorded in VALIDATION.md and RELEASE_SUMMARY.json. They do not establish live Apps Script latency. The earlier startup incident and historical absence cleanup remain separate operational checks.
