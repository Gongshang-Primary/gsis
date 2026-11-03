# roster-home-banner-wording: "No suspended timetable" and the user's own relief duties on Home (changelog)

- Status: authorised (owner 3 Nov 2026: "codex work"); target v0.9.9j with the peer-quota fix
- Owner/model: Codex (lane R frontend)
- Branch: codex/roster-home-banner-wording
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
3. Rename the existing SMC line (owner ruling 3 Nov): "Relief duty today:" → **"SMC doing Relief Allocation:"**, e.g. "SMC doing Relief Allocation: Jannie, Fadzillah, … Visit contacts.gsps.edu.sg for their contact numbers." Empty state: "No SMC assigned to Relief Allocation today."
4. Same on Google and D1. Tests for each wording and for none/some/failed duty states.

## Owner ruling
"SMC doing Relief Allocation: ...." (3 Nov 2026). Spelling corrected from "doign".

## Follow-up before merge (owner 3 Nov ~11:00: "let codex work to cut down the non-blocking trade off")
Claude's review of #65 (head d1173aa): Home makes one extra `operations read view:'duties'` per teacher on every Home load. On Google this adds read load at the 06:30-07:30 peak (timeouts seen 3 Nov). Change in the same PR:
1. Reuse duty data already loaded on the page (e.g. My relief duties / current-duty preload / timetable preload) when it covers today.
2. Otherwise fetch at most once per teacher per day: cache the verified result for today (memory plus sessionStorage, keyed by staff and date and revision if available); refresh only on explicit Refresh, on a known change signal, or after 10 minutes.
3. Never block or delay the Home render on this call; start it after the main Home data has loaded.
4. Tests: second Home visit the same day makes no new duties request; Refresh does; failure still shows the retry text.
