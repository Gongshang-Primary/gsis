# STAPLER cap and browser recovery diagnosis

25 October 2026. Read-only source investigation against v0.9.1 and current `f1069a1`. No production data read or live action. Findings are separated from unverified live causes.

## Known cap hidden by the warning text

The supplied screenshot shows two `weekly-cap-unverified` warnings and one `weekly-cap-exceeded` warning. `roster-update/public/roster-stapler-ui.js::drawPlanningNotes` (lines 170–171) prints `periodCap` only in the exceeded branch. Its unverified branch discards an available numeric cap.

`shared/roster-operations.js::validateStaplerCaps` (lines 548–556) first requires `balance.capConfigured`, then emits `{code,staffId,name,periodCap,weeklyTotal}`. An unverified total is deliberately null; the cap is retained if finite. The screenshot does not prove that Kavitha or Fazdriel lacks a cap. Ahyoung's result proves that the relevant saved warning contained a verified weekly total of 29 and cap of 26.

`shared/teaching-rules.js` defaults UT to 26 total actual workload periods, including non-teaching. A saved configuration can change this cap. Do not infer a value from the visible `(UT)` name.

### Exact verification failure paths

| Source | Failure | Current result |
| --- | --- | --- |
| `backend/Relief.gs::reliefRosterQuota_` line 118 | `r.quota === null` in published Deploy analysis | `capVerified:false`; the detailed `r.reason` is not exported. |
| `shared/relief.js::analyse` lines 71–84 | Invalid relief settings, orphan/inactive/ineligible person, unknown employment, unavailable average, missing offload, incomplete workload, invalid cap, or invalid calculation | Null quota and a source reason. Existing wire drops that reason. |
| `backend/RosterOperations.gs::rosterOperationsWeekCells_` lines 125–127 | Any Monday–Friday date has no active baseline, or selected week has zero/multiple matching blocks for timetableName | Returns null with no date/identity reason. |
| `backend/RosterOperations.gs::rosterOperationsQuotaTeacher_` lines 129–132 | Unsupported capBasis; upstream capVerified not true; invalid cap; missing cells; non-finite computed workload | `capVerified:false`, detailed failed condition omitted. |
| `shared/roster-stapler.js::capWorkload` lines 214–225 | No cell array; unsupported basis; missing/invalid total-basis nonTeachingPeriods; unknown activity anywhere in the week | Returns null without the activity or failed field. |
| `shared/roster-operations.js::composeStaplerContext` line 511 | Existing verification false; unknown activity in a confirmed plan's baseline/current cards; non-finite or negative adjusted workload | Verification becomes false; unknownActivities is available in accounting but not retained on the teacher. |
| `shared/roster-allocation.js::balances` line 182 | Carries those flags into balance | `validateStaplerCaps` selects its generic unverified warning. |

Local fixtures include the person's name in synthetic UT examples, not the live data needed to identify which path affected this screenshot. No person-specific missing input is proven.

Smallest correction: retain a finite configured cap in the unverified message and include a specific server-owned verification reason. Example: `Weekly workload could not be verified. Configured cap: 26 periods. Unclassified activity: <code>.` If cap itself is invalid, explicitly say so. Preserve conservative allocation limits and the existing imported-plan warning policy. Do not turn unknown total into zero or treat unknown as verified.

Regression checks completed successfully: `tests/stapler718c-warning-ui.cjs`, `tests/stapler718c-import-policy.cjs`, and all eight tests in `tests/release086-ut-cap.cjs`. The existing UI fixture demonstrates a known numeric cap omitted in the unverified warning.

## Save stopped before backend dispatch

User message: `Save was not sent because this browser cannot retain its recovery record...`

The exact branch is `roster-stapler-ui.js::mutate`, line 417: a new request is prepared, `persistDraft(s)` fails, pending is cleared, and the function returns **before** `s.ctx.api`. This is a local recovery-storage failure, not an Apps Script rejection or timetable structural-validation failure.

`persistDraft`, lines 50–54, serialises a complete basePlan and current plan plus request metadata to localStorage. `draftPending` already uses references to avoid duplicating the plans again in pending input. The broad catch discards the original exception type, so the displayed message cannot distinguish `QuotaExceededError`, blocked storage, or a serialization error. The same code exists in tag v0.9.1; this is not a new v0.9.1c limit.

Per-tab/date recovery forks intentionally preserve another writer's changes (`raw !== s.draftRaw`), but retained forks and multiple dates can accumulate. A large pair of valid plans can exhaust the origin's localStorage quota even when device disk has space. There is no IndexedDB draft fallback in this module. Clearing all site data is unsafe because it can delete the only unsaved copy.

Recommended correction: persist large recovery snapshots asynchronously in IndexedDB, with the exact request ID and snapshot references durable before first network send; migrate valid legacy records without deleting them before successful durable transfer. Retain a small fallback only if it can prove durable persistence. Classify quota/denied/serialization failures accurately. Keep an explicit downloadable recovery JSON path and do not erase unrelated dates or uncertain pending requests to make space.

Tests required: localStorage full while IndexedDB works; both stores fail before send; real large plan; reload after accepted save with lost response recovers identical request; tab collision preserves both drafts; account/date separation; failed migration keeps legacy copy; acknowledgement removes only its own verified recovery record. Existing `tests/stapler0812-draft-recovery-browser.cjs` already exercises native localStorage pressure, exact pending recovery and zero first-send calls on forced QuotaExceededError.

The existing Chromium recovery test also passed during this investigation. Its 100-teacher fixture stores 1,342,545 characters for the dirty draft and 1,342,776 with pending metadata. It proves the current compact-pending path, retained scroll, exact retry and deliberate no-send gate; it does not establish the user's specific browser exception.
