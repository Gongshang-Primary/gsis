# GSiS v0.9.8c

Google remains the authoritative Roster store. This patch advances only Roster Pages, Roster Apps Script and the notification Worker from 098b.

- Preserve safe backend code, reference, operation and stage through browser failures, background jobs and System Health. Store compact diagnostic metadata alongside existing health records.
- Keep the active Stapler planner mounted during background checks, whether saved or unsaved. Continue access verification; preserve recovery when access expires. Ignore replies from an older planner instance.
- Save only changed Stapler fields with original-value conflict checks and stable request receipts. Merge independent changes without replacing unrelated SMC work. Keep legacy full-save compatibility.
- Move recess in time within its original class row, individually or as a cohort block. Allow Pit placement into its own class and retain displaced lessons for review. Undo, redo, duration and conflict checks remain.
- Cache independently compressed baseline and suspended timetable parts privately in R2 for today plus the next 30 dates. Verify current school authority and source before reuse. Reuse unchanged parts; prepare after confirmed saves/uploads and recover cache failures on demand. Prune only the new cache's unreferenced objects using bounded daily maintenance.
- Match System Health's header link to adjacent buttons and show it only to Admin. Existing authorized status access remains available to SMC; detailed uncertain colleague email review requires current Admin authority.
- Add “Mark reviewed, do not resend” for uncertain colleague emails. Keep the uncertain delivery evidence and same-ID review receipt. Distinguish reviewed history from unresolved issues so old reviewed rows do not keep failing every idle beat.

Absence receipt recovery, Received versus Saved states, surgical Assign Relief conflict handling, peer/SMC source indicators, durable alert intent, provider cooldown retries and accepted-versus-delivered reporting remain in the established recovery paths and are regression checked. An uncertain provider send is not automatically repeated. This patch does not reintroduce the 097 operational ownership migration.
