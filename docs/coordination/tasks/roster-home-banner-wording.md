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

## Follow-up before merge (owner 3 Nov ~11:00: "let codex work to cut down the non-blocking trade off")
Claude's review of #65 (head d1173aa): Home makes one extra `operations read view:'duties'` per teacher on every Home load. On Google this adds read load at the 06:30-07:30 peak (timeouts seen 3 Nov). Change in the same PR:
1. Reuse duty data already loaded on the page (e.g. My relief duties / current-duty preload / timetable preload) when it covers today.
2. Otherwise fetch at most once per teacher per day: cache the verified result for today (memory plus sessionStorage, keyed by staff and date and revision if available); refresh only on explicit Refresh, on a known change signal, or after 10 minutes.
3. Never block or delay the Home render on this call; start it after the main Home data has loaded.
4. Tests: second Home visit the same day makes no new duties request; Refresh does; failure still shows the retry text.

## Follow-up implementation, 3 November 2026

Model: Codex. Same PR #65, based on d1173aa45d583c558a79936426e82ff6d2dc5c93. Integrated main 29a04a47738d08d216fd314c4c3e3bcf577bab4d and retained its owner follow-up above.

The own-duty summary reuses the authenticated full My Relief Duties response, including when that view selected another date. Only today's validated personal periods are cached. The cache uses memory plus sessionStorage, keyed by verified account/staff/roles, Singapore date and profile revision, with a ten-minute expiry. Explicit Refresh, local writes and known affected-date invalidation discard the result. Existing profile freshness checks reuse it until expiry; there is no new timer. Failed checks retain the retry sentence and a bounded failure marker so navigation does not repeat failed requests.

Home renders and unlocks before the optional background duty check. The check starts after the main current-duty request settles. Account, revision, date, request generation and Home-mount guards fence delayed replies. Stored summaries contain period numbers only, not raw duty details or other staff records. Logout clears the current summary. No backend, production authority, configuration, school record or messaging change.

Regression evidence: the new real-shell jsdom test first failed because a duties request started while main Home data was held. After the change it passes deferred start, usable Home, second visit after two minutes, sessionStorage reload, staff/date/revision separation, malformed cache rejection, full-duty-list reuse, explicit Refresh, ten-minute expiry, known changes, failed-check throttling/retry and pre-Refresh response races. The existing cache fixture now supplies the unrelated Home invalidator while retaining all its timetable invalidation assertions.

Local checks passed: tests/roster-home-relief-cache.cjs, tests/roster089-cache.cjs, tests/roster093a-client-cache.cjs, tests/roster093-calendar-cache-ui.cjs, tests/roster093a-home-report-warm.cjs, tests/roster702-memory-ui.cjs, tests/roster609-ui.cjs and node --check roster-update/public/roster.js. This workspace has only the relevant source files; the complete build, all Node programs, Chromium checks and LORD are verified by the exact-head PR workflow. Local Chromium installation failed because the download was truncated; no local browser pass is claimed. Claude must review the new exact head before owner merge. Rollback is the follow-up commit; no stored server data changes.

The follow-up race check also held a duties response across an affected-date change. Before the correction, Home attached to that old in-flight request; the new test failed waiting for a second request. A known change now advances the API read generation and removes in-flight sharing before clearing the summary. The test releases the newer response first and confirms the older response cannot replace it. The seven focused programs and syntax check were rerun after this correction.
