# GSiS v0.8.2

Full suite release from v0.8.1d. Implements the October 21 morning reliability work and queued implementation requirements 061–082, including Contacts, inbox and teacher views. Installation-specific forensic follow-up remains identified below.

- Timetable planning uses explicit **Save to online**. Shared saved data is released with **Let teachers see**. **Send WhatsApp** sends the current publication.
- Local drafts retain their original online base and exact uncertain save requests. Independent changes can merge; competing changes require a cell comparison.
- SMC assignment clicks, replacements, No Relief choices and cleared cells carry manual ownership. Automatic allocation leaves those decisions alone until SMC returns them to automatic allocation.
- Excel exports use the loaded local timetable, including unsaved changes, without saving or checking the network at export time.
- Teachers absent for the full school day are excluded from timetable WhatsApp and the acknowledgement population. For partial absences, only changed timetable content or a correction owed during periods they are present qualifies; absent-only changes do not. Saved attendance is checked again before dispatch without changing the published timetable.
- Daily Notify adds a top-right acknowledgement dashboard with current eligible teacher totals, acknowledged/pending counts and progress. Search and grouping do not change these totals; WhatsApp delivery remains separate.
- Private timetable links remain reusable for seven full days from issuance. The page places acknowledgement first and loads the current teacher-visible publication.
- A prepared two-button WhatsApp contract supports **View Detail** and **Acknowledge**. The existing approved template remains usable while Meta reviews the new template.
- Notification processing limits claim starvation and isolates failed jobs; delivered/read records reconcile obsolete active errors.
- Daily employment email settings compare their own saved version. Unrelated allocation or acknowledgement changes no longer invalidate recipient edits; competing settings changes still require review. An uncertain settings save retains its exact request across same-tab reloads for the same signed-in user; **Check saved settings** confirms or retries it without sending an email. A storage warning identifies when recovery is available only while the page remains open.
- A daily plain-text audit combines captured allocation decision facts and confirmed SMC online changes. Export occurs outside the planner save transaction.
- Contacts gains an accessible plus action before TTb name for adding the selected teacher to the signed-in user's Google Contacts after consent.
- WhatsApp inbox refresh reduces repeated work and supports protected incoming image previews and captions.
- Teachers can view confirmed upcoming Stapler timetables. A frozen confirmation snapshot keeps later working edits private until reconfirmed.
- Roster Timetable keeps the baseline visible below the selected day’s published suspended timetable when available.
- Teacher Daily Update offers Absent teachers and Relief teachers groups from the published snapshot. Relief Load stays restricted to SMC/Admin; absence reasons, quotas and working drafts are excluded.

The release includes source, complete deployables, verification evidence and the wider chronological changelog. Live service speed and delivery require installed-service checks; local tests do not establish production delivery.

## Requirement disposition

| Items | v0.8.2 result |
| --- | --- |
| 061, 064 | Private reads avoid planner locks/live timetable rebuilds; reusable links expire 168 hours after first issuance. |
| 062, 063, 069, 074 | Two-button contract prepared and submitted; top-page acknowledgement implemented. Meta status remains PENDING; existing approved template stays default. |
| 065–068, 073 | Explicit local planning, direct SMC replacement and protected manual choices; online merges, visible conflicts and local XLSX. |
| 070–071 | Source causes and captured forensic findings inform dispatch/private-view fixes. Historical provider delivery and the installed school's save error still require post-installation verification; no live staff message or timetable correction was made. |
| 072 | Daily readable decision/change export plus durable evidence archive and version-safe compaction. |
| 075–076 | Google Contacts plus action; five-skill code review; inbox refresh and image support; full-suite packaging. |
| 077–078 | Confirmed upcoming teacher preview and two published Daily Update groups, with Relief Load restricted to SMC/Admin. |
| 079 | Timetable retains both the published suspended day and its baseline in the page. |
| 080 | Recipient-settings saves now ignore unrelated operation revisions while detecting competing settings changes; exact retry is retained. The reported live unconfirmed-save error has no established root cause. |
| 081 | Daily Notify acknowledgement dashboard counts unique eligible teachers for the selected current publication, with acknowledged/pending totals and progress independent of search or grouping. |
| 082 | Fully absent teachers are excluded from timetable notices; partial absence qualifies only for present-period changes or relevant corrections. Attendance is rechecked before queued dispatch; published content is preserved. |

The full suite keeps the earlier v0.8.1b–d fixes, including affected-teacher comparison, explicit notification during quiet hours, parameter sanitisation and repeatable acknowledgement access. Template approval, Google consent configuration and production checks are deployment steps, not locally verified outcomes.
