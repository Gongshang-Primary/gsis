# v0.8.4 full suite scope

The user authorised v0.8.4 from the full v0.8.3 baseline. This package implements queued items 088–094 and retains the prior suite behavior.

| Item | Included change | Boundary |
| --- | --- | --- |
| 088 | Teacher list of today's and upcoming confirmed suspension dates; main-screen Timetable help; distinct account, error and empty states | Legacy dates can be listed without exposing an unsafe draft preview. |
| 089 | Responsive Report Absence refresh with retained input, period selection and instructions | Saving still requires verified dates, source, permissions and current overlap checks. |
| 090 | Immediate pending feedback and a mobile period/colleague chooser for Own arrangements | Selection waits for confirmed save; Submit requests is explicit; uncertain saves keep exact recovery. |
| 091 | Scoped gzip timetable snapshots, bounded client RAM reuse and changed-cell instruction patches | Dynamic operational records remain fresh; conflicting edits are rejected; storage is still one Drive document. |
| 093 | Standalone Roster Apps Script artifact with fixed routing and disabled-by-default sole-owner gates | Preserve original data IDs; disable and drain old owners before cutover. |
| 094 | IP Deploy position/focus preservation during editing | Existing save and publication rules remain. |
| 092 | Configurable same-teacher consecutive subject blocks, default PAL × 3 | Automatic coverage remains subject to full-block eligibility; manual choices stay protected. |

The full package includes all five frontends, Contacts/Calendar/Deploy/Roster complete backends and the notification Worker. Roster moves to a separate Apps Script project; Layout remains with Deploy. No data-store split is required. Preserve the existing data IDs, service secrets and required scopes. Existing identifiers, settings and records must be retained.

Retained behavior includes Contacts VCF export; class-field arrows; local drafts and Excel; save/publication/notification separation; private links and acknowledgements; absence-aware recipient checks; daily employment email settings; audit export; and private WhatsApp Inbox media. Current source contracts are in `API_CONTRACTS_v0.8.4.md` and `API_ROSTER_OPERATIONS_v0.8.4.md`.

Historical docs remain in source. The v0.8.4 manual retains all 36 embedded figures, with earlier screenshots labelled as inherited. Current text describes the changed screens.

Extract the outer deployment ZIP before uploading each inner frontend ZIP to its matching existing Pages project. Packaging does not install production code, publish a school timetable, create device contacts or send messages. The optional button template requires exact approval and deliberate activation. `VALIDATION.md` and `RELEASE_SUMMARY.json` record release checks; `PERFORMANCE_v0.8.4.md` distinguishes local measurements from production limits.
