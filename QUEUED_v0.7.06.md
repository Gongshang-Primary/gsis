# v0.7.06 change disposition

Status: implementation authorised on 16 October 2026 at 06:08, Asia/Singapore. Implementation and local verification are complete. Final package integrity is recorded in RELEASE_SUMMARY.json.

| ID | Request | Implementation scope | Verification |
| --- | --- | --- | --- |
| Q706-01 | Report Absence loads slowly. | Use cached baseline data and narrow the form response. | Passed local checks. |
| Q706-02 | Manage reported absences loads slowly. | Record-only read without schoolwide reconciliation. | Passed local checks. |
| Q706-03 | Roster reads and saves remain slow. | Remove unrelated work while retaining atomic commits and exact retries. | Passed local checks. |
| Q706-04 | Own Arrangements loads slowly. | Immediate local matrix with separate current eligibility and durable save acknowledgement. | Passed local checks. |
| Q706-05 | Loading and saving pulse instead of spin. | Constant-opacity rotation in both motion modes. | Passed local checks. |
| Q706-06 | Assign Relief loads slowly. | Reuse cached data and request-local calculation results. | Passed local checks. |
| Q706-07 | WhatsApp Readiness needs its own SMC Home function. | Dedicated compact view; remove embedded readiness and delivery review. | Passed local checks. |
| Q706-08 | Availability teacher names load slowly. | Source names from cached timetable and keep selection local. | Passed local checks. |
| Q706-09 | Timetable-only operations should not await server reads. | Shared immutable model with separate operational freshness and current save checks. | Passed local checks. |
| Q706-10 | Generate named virtual recess rows and activate by dates and levels. | Actual class suffix groups, configurable base label and unique class/date/period demand. | Passed local checks. |

The full source investigation remains in GSiS_Queued_Changes_After_v0.7.05.md. Activation leaves recess demand unassigned for explicit review and Auto-allocate. This is the announced conservative build choice, not a claim that the user answered the final clarification question.

WhatsApp and scheduled automation stay paused. No live deployment, school-data reset, message, provider submission or Git commit is included. The earlier startup incident and historical absence cleanup remain unresolved operational items.
