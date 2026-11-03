# roster-home-banner-wording: "No suspended timetable" and the user's own relief duties on Home (changelog)

- Status: proposed (owner 3 Nov 2026 08:50); not yet assigned
- Owner/model: unassigned (Codex; lane R frontend)
- Reviewer/model: Claude

## Evidence
Staff WhatsApp (Bee San, 08:49-08:50) with Home screenshot: "Roster · Normal timetable today Tue, 3 Nov 2026 · Relief duty today: Jannie, Fadzillah, Shirley, Song Wee, Zafran, Nurathirah, Yusri." Staff read "normal" as misleading.

## Owner request (verbatim)
"change to "No suspended timetable" instead of "normal timetable." include here whether the user has relief duties or not."

## Requirement
1. `roster-update/public/roster.js` `showHomeTimetable()`: replace "Normal timetable today " with **"No suspended timetable today "** (keep "Suspended timetable in effect today", "No timetable active today" and the verify/refresh messages unchanged).
2. In the same Home banner, add the signed-in user's **own** relief duties for today, using data the app already loads (My relief duties / current duty), no new backend call if avoidable:
   - none: "You have no relief duty today."
   - some: "Your relief duty today: P3, P4." (periods in order; link to My relief duties).
   - unavailable/loading: "Checking your relief duty…" then the result; on failure "Your relief duty could not be checked. Refresh to retry."
3. Clarify the existing SMC line so it is not read as the teacher's own duty: "Relief duty today:" → **"Duty SMC today:"** (owner to confirm).
4. Same on Google and D1. Tests for each wording and for none/some/failed duty states.

## Open question for the owner
Rename "Relief duty today:" (the SMC list) to "Duty SMC today:"? It currently lists SMCs on duty, and staff may confuse it with their own relief duty.
