# Install GSiS 0.9.8o

Use SETUP.html or SETUP.md. To enable native timetable preparation, install the matched `Roster_Backend_v0.9.8o.gs` and `Roster_Frontend_v0.9.8o.zip`. Deploy a **New version** of the existing Apps Script web app first, then upload the frontend to the existing Roster Pages project. Preserve properties, secrets, URLs, bindings and schedules. N's absence-intake repair remains included.

As an administrator, open **System Health → Prepare timetable migration → Download timetable snapshot**. Keep the JSON private. Follow `TIMETABLE_PREPARATION_SETUP.html` and the separate `GSiS_v0.9.8o_Timetable_Preparation.zip` to reuse the tested rehearsal Worker/D1/R2. This verifies imported timetable copies; it does not change Google authority or move the relief ledger. Notification and Operations Workers remain N.

For the separate Calendar sync repair, optionally install its matched O backend/frontend pair. The live missing VenueID header has been repaired; event data and unknown receipts were preserved. After any old sync pass finishes, click **Sync Staff** again explicitly to retry its earlier errors. Blocked events remain outstanding. Preserve unknown outcomes for investigation. The O Calendar code has not been deployed here or verified by a complete live sync.
