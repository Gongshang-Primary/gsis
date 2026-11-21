# v1 Roster `statisticsCalendar` Term/Semester presets & Ad Hoc Relief mobile update (`CI01`, `C12`–`C14`)

- Task ID: `v1-roster-statistics-and-adhoc-mobile`
- Model: `Antigravity`
- Branch: `antigravity/v1-roster-statistics-and-adhoc-mobile`
- Status: **Ready for Muse review**
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
   - Added `/internal/year-structure` in `v1/services/calendar/service.mjs` deriving Term (`T1`–`T4`) and Semester (`S1`, `S2`) date ranges from authoritative `calendar_metadata` `yearStructure` (`TERM_WEEK`) records without guessing dates when structure is absent.
   - Updated `statisticsCalendar` in `v1/services/roster/service.mjs` to query Calendar `/internal/year-structure` and return `{ year, terms, semesters, basis, semesterBasis, revision }`.
2. **Contacts `/internal/update-mobile` & Roster `adHocUpdateMobile` (`C12`–`C14`)**:
   - Fixed `fieldRevisions` in Contacts `/internal/update-mobile` (`v1/services/contacts/service.mjs`) to omit `undefined` `mobile` revision so `canonical(intent)` succeeds when Roster does not supply a prior field revision.
   - Added `updateRosterContactMobile` (`adHocUpdateMobile` and `contactCreate` with `existingStaffId`) in `v1/services/roster/contact-create.mjs` and `v1/services/roster/service.mjs`, enforcing the mandatory 8-digit Singapore mobile gate, duplicate-mobile rejection, and read-only preservation of `Basic Name` and `TTb Name`.
3. **Regression Test (`tests/v1-product-roster-statistics-and-adhoc-mobile.mjs`)**:
   - End-to-end isolated Miniflare/D1 verification.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-roster-statistics-and-adhoc-mobile.mjs` — **PASS**
- `npm run build && git diff --exit-code -- roster-update/ public/ shared/` — **PASS** (zero v0.9 drift)
- `node scripts/v1/build.mjs && node scripts/v1/verify-build.mjs` — **PASS**
- `git diff --check` — **PASS**
