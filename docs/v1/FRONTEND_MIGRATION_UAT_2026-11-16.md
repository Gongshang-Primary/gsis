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

## 2026-11-16 19:39:26 SGT recheck

### Contacts Edit Info

Matched all 182 rows one to one using unique statutory name, GSPS alias, timetable name or basic name in that order. Compared the displayed control values across all 17 shared fields. After normalizing case, whitespace, month abbreviations, and punctuation and list formatting in role and modifier fields, no differences remained. This establishes frontend value parity for the shared grid fields. v1-only facts and separate authority acceptance still need review.

| Field | Raw differences | v0.9 input | v1.01 input |
| --- | ---: | --- | --- |
| Appointment Status | 0 | Dropdown: blank or Acting | Free-text input |
| Employment Modifier | 2 | Dropdown: blank or 4/5, UT, BT, FAJT, SRE, SC, SENO, Dentist, Library, DE, Sci Lab, Security, Recep, AE, OSO | Free-text area |
| Subject Modifier | 0 | Dropdown: blank or MTL, PE, Art, EL, Music | Free-text area |
| MK Modifier | 0 | Dropdown: blank or MK | Free-text area |
| Basic Name / Statutory Name / GSPS Alias | 1 / 2 / 1 | Case or spacing | Case or spacing |
| Role / EO Appointment Level | 35 / 15 | Legacy labels | Reformatted labels |
| Birth month | 131 | Abbreviations | Numbers |
| Active, CES alias, day of birth, extension, mobile, timetable name, iCON alias | 0 each | Value match | Value match |

Verify that the free-text controls provide equivalent validation, permitted values and multi-value entry. No Contacts edits were needed for the shared fields.

### Deploy

| Draft | IP grid rows v0.9 / v1 | Assignment controls v0.9 / v1 | Relief findings |
| --- | --- | --- | --- |
| 2026 T4 post-PSLE | 168 / 168 | 515 / 515 | Eight visible numeric inputs and ten checkbox states match. Relief output has 99 source rows and zero destination rows. |
| 2027 Term 1 | 200 / 200 | 552 / 552 | Four budgets and ten checkbox states match. Source SIUE is 150% for general preparation, PE, Art and Music. Destination showed 190%, 90%, 90%, 90%. Relief output has 99 source rows and zero destination rows. |

Entered the four 2027 SIUE values through the destination frontend and clicked Apply settings. Save to online stayed disabled because Deploy found a duplicate timetable name involving an inactive teacher in the existing dataset. The blocker prevents saving unrelated relief settings. No save succeeded. Discard was attempted and its result could not be verified because browser control timed out while checking the confirmation. Check for that pending dialog or unsaved draft before the next edit.

Version switch UX: the selected label updated before its grid did during the 2026 switch. Wait for matching grid contents before comparing or editing. Matching IP counts do not establish cell-by-cell parity. Remaining Deploy panels, exact assignments and later viewports still need frontend checks. Roster remains last.
