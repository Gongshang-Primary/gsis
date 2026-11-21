# v1 Roster `statisticsCalendar` Term/Semester presets & Ad Hoc Relief mobile update (`CI01`, `C12`–`C14`)

- Task ID: `v1-roster-statistics-and-adhoc-mobile`
- Model: `Antigravity`
- Branch: `antigravity/v1-roster-statistics-and-adhoc-mobile`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-roster-statistics-and-adhoc-mobile.md`
- `v1/services/calendar/service.mjs`
- `v1/services/contacts/service.mjs`
- `v1/services/roster/service.mjs`
- `v1/services/roster/contact-create.mjs`
- `tests/v1-product-roster-statistics-and-adhoc-mobile.mjs`

## Scope
1. **Calendar `/internal/year-structure` & Roster `statisticsCalendar` (`CI01`)**:
   - Add `/internal/year-structure` in `v1/services/calendar/service.mjs` that derives Term (`T1`–`T4`) and Semester (`S1` = `T1..T2`, `S2` = `T3..T4`) date ranges from authoritative `calendar_metadata` `yearStructure` (`TERM_WEEK`) records without ever guessing dates when structure is absent.
   - Update `statisticsCalendar` in `v1/services/roster/service.mjs` to query Calendar `/internal/year-structure` for `[year - 1, year]` and return `{ year, terms, semesters, basis, semesterBasis, revision }` matching `GSISRosterStatistics.preset("term" | "semester", today, calendar)`.
2. **Contacts `/internal/roster-update-mobile` & Roster `adHocUpdateMobile` (`C12`–`C14`)**:
   - Add `/internal/roster-update-mobile` in `v1/services/contacts/service.mjs` so Roster (`roster.write` / `roster.admin`) can enter or correct `mobile` on an existing Contacts staff record while keeping `basic_name`, `ttb_name`, and all other identity fields strictly read-only, enforcing the mandatory 8-digit Singapore mobile gate and duplicate-mobile check with idempotent operation receipts.
   - Add `adHocUpdateMobile` (and `existingStaffId` mobile-update support) in `v1/services/roster/service.mjs` and `v1/services/roster/contact-create.mjs`.
3. **Regression Test (`tests/v1-product-roster-statistics-and-adhoc-mobile.mjs`)**:
   - End-to-end isolated Miniflare/D1 verification of `statisticsCalendar` (with and without Calendar `yearStructure`, verifying `GSISRosterStatistics.preset('term')` and `preset('semester')`), plus `adHocUpdateMobile` (mandatory mobile validation, duplicate-mobile rejection, read-only `basicName`/`ttbName` preservation, idempotent retry, and unauthorized caller denial).
