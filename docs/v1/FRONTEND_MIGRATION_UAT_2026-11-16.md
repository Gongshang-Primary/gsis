# Frontend migration UAT

All timestamps are Singapore time (UTC+08:00). Follow-up to the run started 15 November 2026 at 09:37 SGT. Compare current and future records using the v0.9 frontend as the authority. Enter Contacts data through Edit Info. Check both Deploy drafts independently, then the remaining viewports with Roster last.

| Logged (SGT) | Area | Finding or checkpoint |
| --- | --- | --- |
| 2026-11-16 19:22 | Browser | Source Contacts and Deploy use their legacy subdomains. Destination is the Chrome window titled GSiS · Staff workspace · v1.01 on the unified domain. |
| 2026-11-16 19:22 | Contacts Edit Info | Both show 182 rows. A comparison of 173 unique statutory-name matches found matching mobile, extension, iCON and CES values. One Basic Name and one GSPS alias differ only after case or whitespace normalization is ignored. The 130 birth-month display differences map to identical months. Nine rows need an independent identity check. |
| 2026-11-16 19:22 | Contacts labels | 35 Role and 15 EO Appointment Level labels differ, including VP(EO) / VP-EO and Jnr KP / Jnr-KP. Verify their semantic mappings and compare selected modifier values. |
| 2026-11-16 19:22 | Contacts directory and import | v1 reports teaching information unavailable and disables related filters. Edit Info shows an enabled import control and 182 rows alongside a disabled generic import control with a 0 / 0 summary. Import and save remain untested. |
| 2026-11-16 19:32 | Deploy | v0.9 showed 2026 T4 post-PSLE and 2027 Term 1, both unpublished. Browser control disconnected before the v1 comparison. Both versions and all settings need a frontend comparison. |
| 2026-11-16 19:36:03 | Contacts modifier controls | Owner flagged that v0.9 provides dropdowns for Employment Modifier and related fields while v1.01 accepts free text. Compare option lists, selected values, multiple-value entry and treatment of invalid values. Verify each field separately. |

No application records were changed at this checkpoint. The ledger contains aggregate observations only.
