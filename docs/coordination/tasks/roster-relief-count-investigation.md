# roster-relief-count-investigation: completed relief shows 0 for a teacher who did relief

- Status: approved (#46 at 72f1406); merge held by owner
- Owner/model: Codex
- Reviewer/model: Claude
- Branch: codex/roster-relief-count
- Lane: R (serial)
- Last updated (Asia/Singapore): 1 Nov 2026 20:17
- Base SHA: b8f1fa307ee596ca7e31fb99d19d83255bf9e295 before this claim
- Current head: see the eventual PR exact head
- PR: not opened
- User-authorised scope: investigate the five stated hypotheses, align counts only if wrong, fix zero-quota wording and add D1-path coverage.
- Out of scope: cutover, freeze, import, activation and live record changes.
- Files/domains (expected): `shared/roster-allocation.js` (`reliefCompleted`, `accounted`, `corrected`), `shared/roster-operations.js` (calculations payload), `roster-update/public/roster-calculations.js`, generated bundles, tests.

## Evidence (owner screenshot, v0.9.9g, 1 Nov ~20:30)
My Calculations for the owner (ngiam.song.wee@gsps.edu.sg): Wi 83.85, R = 0, "cumulative relief done is Unavailable". Box: "1 Jan 2026 to 1 Nov 2026. Completed relief: 0 periods. Recorded accumulated quota through the week of 26 Oct 2026: 0 periods… 2 recorded weeks, from 19 Oct to 26 Oct… Counting began from zero on 18 Oct 2026." Owner: "i have definitely done some relief".

## Hypotheses (check each; report which is true)
1. Relief arranged but never published: `reliefCompleted` counts only `completed`, or `published` with the period ended; drafts never count.
2. Identity mismatch: relief recorded under another staff ID or a name bridge, not the owner's Contacts identity.
3. Before tracking: relief before 18 Oct not counted unless entered as imported relief.
4. Two definitions: the allocator's fairness history (`accounted`) and the displayed completed count (`reliefCompleted`) may differ. If so, the display and the allocator disagree about fairness.
5. R = 0 for the owner: confirm whether the Deploy/SRE basis gives this teacher no quota by design (role, daily roster) or by a settings gap.

## Deliverables
1. A short finding in this record: which hypothesis, with record IDs/dates (no staff personal data beyond names already in the app).
2. If the count is wrong: fix it so the displayed count and the allocator use one definition; test with published, draft, completed, corrected, imported and name-bridged relief.
3. Display fix: when accumulated quota is 0, show the done count and "no relief quota recorded, so no percentage" instead of "Unavailable".
4. D1-path test: the same counts when D1 is the record.
5. No change to the cutover, freeze, import or activation code.

## Finding: source, display and five hypotheses

The owner confirmed that published assignments are canonical: an ended published period counts as done automatically, without an SMC confirmation step. Drafts and future published work are not completed relief. Existing explicit corrections remain authoritative; this work adds no confirmation UI and changes no live records.

Read-only Roster observations on 1 November 2026, v0.9.9g, signed-in owner:

* My Calculations reproduces completed 0, accumulated quota 0, two recorded weeks starting 19 and 26 October, and the zero-start marker dated 18 October.
* My Relief Duties reports no past duties. Statistics filtered to Song Wee reports 0 relief and 0 Combine for both 18 October–1 November and 1 January–1 November. Missing history is not evidence that the owner did no relief.
* Published Deploy source is `2026 T4 post-PSLE`, revision 8, effective 14 October–20 November, model `whole-week-v6`. The shown inputs are Ti 22, FTT 5, PD 2, duties/other 0, OF 30%, T_avg about 29.13, SIUE 150%, budget 84 and timetable factor 5/7. Wi is 83.8475; the balance gives about 0.1089 periods and floors to R = 0. This is a confirmed arithmetic result, not an unavailable source or a daily-roster exclusion. The existing owner-shaped worked-example test reproduces it.

| Hypothesis | Finding |
| --- | --- |
| 1. Drafts never published | Code/test confirms drafts never enter the completed count. No owner published relief appears in the read-only views. Whether the owner's actual work remained draft or was never retained is not established. |
| 2. Identity mismatch | The signed-in account resolves to Song Wee and the correct own Deploy calculation. Explicit name bridges resolve timetable names to Contacts IDs. Historical assignments under a former/different ID cannot be ruled out from the UI's filtered summaries. No IDs are merged by name or guessed. |
| 3. Before 18 October | The zero-start date is descriptive metadata, not a date filter in `accounted` or `reliefCompleted`. Retained published/completed/imported work before that date still counts. A 12 October imported record is covered by the regression. Missing earlier records are never reconstructed as facts. |
| 4. Allocator/display definitions differ | Both My Calculations adapters and the allocator use `accounted` plus `reliefCompleted`. Real D1 and Google return identical completed counts in the regression. Fairness additionally reserves committed work; that is distinct from completed work, not a second completed-count formula. No count-definition change is justified by the evidence collected. |
| 5. R = 0 | Confirmed by the published formula and settings above. Both recorded quota weeks are zero. R = 0 does not itself erase relief done. |

No live owner relief record IDs were exposed by these read-only views. The fixture IDs `published`, `draft`, `completed`, `imported-before-tracking`, `not-done` and `transferred` are synthetic regression evidence, not school records. An exact historical cause/record-level audit remains open. Automatic approval review rejected Cloudflare account-dashboard access because it is a separate privileged destination; it was not retried or bypassed. Further privileged inspection requires the owner's explicit authorization.

## Changes

The zero-quota greeting now shows the completed count and `no relief quota recorded, so no percentage`. Unknown history remains unavailable. A real SQLite/D1 test executes the production `calculations` route with active Roster, references and Deploy stores, blocks Google network calls, compares Google/D1 counts and proves the read changes no saved state. Published, draft, completed, corrected, imported, duplicate and explicitly name-bridged records are covered.

## Verification

The wording test failed first on `Unavailable`. `TZ=Asia/Singapore npm run build` and six focused programs pass: `roster-relief-count.mjs`, `roster-relief-count-ui.cjs`, `roster099a-relief-auto-complete.cjs`, `roster716-calculations.cjs`, `roster717-calculations.cjs`, and `roster-sre-fajt-r-calc.cjs`. The last two test groups include ten passing completion/SRE subtests. The current local full suite lacks Chromium and historical Git baselines, so its environment failures are not counted as passes; full exact-head CI is required before opening the draft.

## Review

Reviewer: Claude, exact PR head. No approval is claimed. Merge held by owner.

## Deployment

Not deployed. No authority, live data, configuration or notification changes.

## Refresh claim, 6 November 2026

Model: Codex. Refresh on main 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Preserve current fresh-start opening balances and archive coverage. Carry only the display fix and accounting parity tests; earlier live observations above remain historical evidence, not a new live audit. Build and full CI required. Owner merges.

## Backlog rebase (Model: Codex, 13 Nov)

Reviewer: Muse at the new exact PR head. Rebased original `c1b29487e61136ff55a1f578c51893ff733b0e2e` onto fetched main `69dcc20`. The original net tree `9ccd78d72d4661829f3504e6001255aae745f363` was preserved before consolidation/rebase; there were no conflicts. No relief-count facts are fabricated and no accounting/ranking policy changes are added.

Build passed with no diff. Five current programs passed: relief-count UI and native D1 accounting, fresh-start accounting, opening-balances browser and statistics contrast. Merge-tree is clean. Fresh CI will be recorded in the PR body; earlier approval does not approve this head. #47 must rebase onto this branch's new CI-green head and remain stacked. No live data, main push, merge or deployment.
