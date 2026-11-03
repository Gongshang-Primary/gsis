# roster-home-banner-wording: "No suspended timetable" and the user's own relief duties on Home (changelog)

- Status: implemented locally, 3 November 2026; exact-head CI pending. Target v0.9.9j with the peer-quota fix.
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

## Implementation claim

Model: Codex. Base main 6540d97183f91a885e57b10c4f7e6efdb140e08f. Scope: roster-update/public/roster.js, Home browser tests and this record/CHANGELOG. Use the existing own-account read view=duties, reuse current loaded results, and preserve account, date and navigation guards. No backend or authority change. Keep the claim on the feature branch under the already established safe alternative to direct main edits. Claude reviews the exact head; owner merges.

## Implementation and checks

Model: Codex. Built from main 6540d97183f91a885e57b10c4f7e6efdb140e08f in an isolated branch. Only the Home frontend, task/changelog and relevant tests change. The normal-timetable sentence now says "No suspended timetable today "; suspended, no-active-timetable and verification messages retain their existing behavior. The former SMC duty line now names Relief Allocation explicitly, including its empty state.

The own-duty line uses the existing authenticated operations read with view=duties. It filters the signed-in staff ID and today's published/completed, valid relief only, removes duplicate periods and sorts numerically. The positive sentence links to My Relief Duties. Empty, loading and failure states use the owner's exact wording. A recent same-account, same-date loaded duties result is reused for up to 60 seconds; writes, Refresh, logout and date changes invalidate reuse. Response guards prevent a stale account or Home mount from updating the banner. No backend endpoint, authority setting, cross-user data or periodic polling is added.

The new browser test failed first because the own-duty line was absent. It now passes none/some/loading/failure, ordered duplicate-free periods, exclusion of other staff and dates, actual My Relief Duties navigation, reuse without another Home request, and account-change isolation. All seven focused programs pass: new Home banner, existing SMC duty, timetable status, Home navigation, report warm, memory UI and full Roster UI. npm run build regenerates all 18 components; LORD passes 39/39. Full exact-head CI remains the publishing gate.

## First CI follow-up

The initial full CI exposed browser fixtures that classified any new Home operations read as a mutation or working-Stapler read. Their adapters now allow only the existing read/view=duties query; mutation and draft-plan assertions stay strict. The report-warm performance assertion still permits exactly one report read and separately checks exactly one own-duty read. The generic API helper now captures own-duty identity context only for own-duty queries, preserving its standalone/background-read contract. No production query is removed to satisfy a fixture. A fresh full CI is required.

The corrected source passes 16 focused programs, including all seven initial Home checks and all failed browser/transport cases from the first CI. Report warming still performs one report read; Home makes exactly one separate own-duty read when no reusable result exists. No test was disabled or broadened to permit arbitrary operations.

## Rebase after peer-quota merge

Peer-quota PR #64 merged while Home CI ran. Rebased the Home-only delta on current main 6fa0d82ce8c0abfbd80e445526b06aa6c32df45a, preserving the peer fix and both changelog entries. All generated output comes from a fresh npm run build. All 20 combined focused programs pass, including Home browser cases, the peer approval regression, exact automatic-ranking parity and the real D1 path. LORD passes 39/39. The final head requires fresh combined full CI.
