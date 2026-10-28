# v0.8.5c validation

All 43 targeted source scripts pass across the related-settings run, the three corrected fixture reruns, the 21-script focused gate and the final three-script date/recovery check. The initial run passed 33 of 36 scripts. Three inherited settings-browser fixtures omitted PAL from their synthetic baseline subject metadata while retaining the PAL default; those fixtures now include PAL and all three pass with their original assertions retained. Production validation was not weakened.

The final focused gate covers the integrated changes and adjacent allocation, notification, acknowledgement and recipient policies. It includes nine consecutive-subject catalogue cases, four real-backend validation/receipt cases, picker DOM and mobile/desktop browser checks, ten ongoing-custom-rule model cases, three backend concurrency/receipt cases, no-Calendar gateway routing, and custom toggle DOM/mobile browser checks.

The Calendar gateway tests verify one authoritative batch, closed-day and holiday skipping, failure on an earlier unknown day, trusted date derivation, authentication and same-origin enforcement. The actual Roster shell DOM test verifies the Singapore 14:00 cutoff, explicit dates, inline progress, no allocation read for an unverified default date, late-response navigation protection and manual fallback. The implementation keeps pending/recoverable work and prevents background refresh from bypassing failed date resolution.

The syntax gate parses 87 Apps Script files as ES2020 and rejects the known logical-assignment regression. Independent correctness and quality reviews cover fresh locked validation, global rule dependencies, pruning, immutable publication history, pending editor protection and date-selection races. The pending-editor issue found during review was corrected by preventing new edits until an uncertain command is confirmed. Final date checks also cover retained local drafts and ensure remembered manual dates take precedence without changing Report Absence quick-entry behaviour.

Evidence files in the source patch and repository bundle:

- `verification/085c-targeted-results.json`
- `verification/085c-fixture-rerun.json`
- `verification/085c-final-focused-results.json`
- `verification/085c-date-rerun.json`

Package verification checks exact two-component scope, source parity, fixed Roster backend role and component version, retained assets, ZIP integrity, SHA-256 hashes and committed Git bundle identity. The final archive is built again after the release commit and tag.

These are local fixture and Chromium checks. Native iOS Safari, live Calendar availability and live WhatsApp delivery were not tested. No production deployment, school-data change or staff message was performed.
