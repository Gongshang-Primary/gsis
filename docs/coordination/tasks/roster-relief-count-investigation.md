# roster-relief-count-investigation: completed relief shows 0 for a teacher who did relief

- Status: claimed; implementing (Codex); merge held by owner
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

## Verification / Review / Deployment
Not started.
