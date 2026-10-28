# v0.8.2 full suite scope

Based on v0.8.1d, incorporating v0.8.1b and v0.8.1c. The 21 October instruction authorises a full release, not a component-only patch.

| Area | Release work |
| --- | --- |
| Roster planning | Local edits, explicit Save to online, three-way conflict comparison, durable retry, local Excel, manual allocation ownership including cleared cells |
| Publication | Let teachers see releases saved online data; Send WhatsApp remains separate; publication success is distinct from notification failures |
| Acknowledgement dashboard | Daily Notify shows current eligible teacher totals, acknowledged/pending counts and progress at top right, independently of card filtering |
| Private timetable | Reusable seven-day access, current published data, acknowledgement in the top action row, prepared two-button template |
| Notification reliability | Just-in-time claims, isolated job errors, delivery status reconciliation, duplicate-safe uncertainty; timetable notices exclude full-day absence and qualify partial absence only by present-period changes/corrections, checked again before dispatch |
| Daily employment email settings | Settings-specific concurrency checks retain recipient edits across unrelated operations; real competing settings changes require review; uncertain saves retain the exact request across same-tab reloads when browser storage is available |
| Audit | Human-readable daily allocation decisions and confirmed SMC changes in one dated Drive text file |
| Teacher views | Frozen confirmed upcoming Stapler preview; published Daily Update by absent/relief teacher; SMC/Admin-only Relief Load; baseline visible below published suspended day |
| Contacts | Add to Google Contacts icon before TTb name, user consent and duplicate protection |
| Inbox | Efficient thread refresh and protected incoming images using the existing media pipeline |

Five frontend ZIPs, three complete Apps Script backends and the separate notification Worker are included. Existing deployment URLs, secrets, workbook identities and saved school data must be retained. This build does not execute a production deployment, send messages, alter live timetable data or create Google contacts.

The WhatsApp button template remains subject to Meta approval and exact contract verification. Google Contacts requires People API and OAuth scope configuration. Image retention requires the existing private media binding. See activation documentation for deployment dependencies and VALIDATION.md for actual verification results.
