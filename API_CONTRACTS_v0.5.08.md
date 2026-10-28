# GSiS v0.5.08 API contracts

Relief advances to response schema 3. Deploy write protocol remains 500. Use authenticated `GET /api/relief` or the existing server-signed Apps Script `relief` action. Current school identity and SMC/KP or Admin authority are checked for every request. Secrets remain server side. No new receiving app or cross-origin grant is configured.

| Query | Meaning |
| --- | --- |
| `versionId` | Read a permitted editable version; omit for the frozen publication. |
| `teacherId` | Filter a stable teacher ID; this is not an authorization grant. Omit for all teachers. |
| `year` | 2000 to 2099; the selected version must have valid dates overlapping that year. |

The success envelope remains `{ "ok": true, "data": ... }`. Schema 3 data includes `schemaVersion`, `calculationVersion`, `backendVersion`, `units:"periods/week"`, `version`, `reference`, `teachers`, `planningQuota:true`, `timetableAvailability:false` and `blockSource:"external"`.

`version` contains `id`, `name`, `revision`, `commit`, `published`, `from` and `to`. Preserve these with imported results. A frozen publication can share a version ID with a later draft; its commit and store identity differ.

| Field | Units and meaning |
| --- | --- |
| `calculationVersion` | `whole-week-v1`, or `legacy-retained-v2` for retained older settings. Independent of API and product versions. |
| `reference.siuePercent` | Percentage, normally 150. Multiplier = 1 + this value / 100. |
| `reference.T_avg` | Total actual teaching periods / eligible active full-time teacher count. |
| `reference.teachingPeriodTotal` | Actual weekly teacher-periods, including FAJT and 4/5 teaching. |
| `reference.fullTimeTeacherCount` | Active eligible full-time headcount; FAJT and 4/5 excluded. |
| `reference.available`, `reason` | Whether this reference can be calculated and why it cannot. |
| `teachers[].teacherId`, `name`, `active`, `eligible` | Identity and status in this version. |
| `teachers[].R` | Estimated weekly capacity before external Blocks, with fractional precision. |
| `teachers[].OF` | Composed nonemployment offload fraction, e.g. 0.3 for 30%, not 30. |
| `teachers[].Ti` | Actual individual weekly teaching periods. |
| `teachers[].available`, `reason` | Valid zero is available. Unavailable R is null, never spare capacity. |
| `teachers[].breakdown` | Employment, FTT, PD, duties, weeklyBudget, timetableFactor, Wi, rawR, offloadAllowance, siuePeriods, offloadComponents, available and reason. |

For `whole-week-v1`:

```text
offloadAllowance = OF * T_avg
siuePeriods = (Ti + offloadAllowance) * siuePercent / 100
Wi = FTT + PD + duties + (1 + siuePercent / 100) * (Ti + offloadAllowance)
rawR = timetableFactor * (weeklyBudget - Wi)
R = max(0, rawR)
```

Defaults: full-time budget 84; 4/5 budget 84 × 0.8 = 67.2; FAJT budget 65. The full-time and 4/5 timetable factor is 60/84; FAJT uses 1. OF composes applicable nonemployment percentages multiplicatively, retains explicit-role replacement and acting rules, and excludes 4/5 and FAJT employment reductions. Caps remain caps rather than invented percentages. Unresolved rules or demand give unavailable R. Lunch duty counts through the roster; personal lunch is not subtracted.

For example, Ti=20, OF=0.3, T_avg=25, FTT=5, PD=2, duties=1 and SIUE=150% gives offloadAllowance=7.5, Wi=76.75 and full-time R=5.178571428571429 periods/week. The receiving app applies its own weekly Block value B once as `max(0, R - B)`, retaining unavailable status when R is null. R does not identify free timetable slots or assign lessons.

Both Admin and SMC/KP receive the fields above. Only Admin also receives `admin` with normalized editable settings, upgrade defaults, formula, detailed rows and any separate Expected comparison. `admin.settings.blocks` is omitted from the API. Historical row Block values are compatibility information, never a deduction from exported R. Ordinary teachers remain denied even with a teacherId filter. A future teacher portal must enforce own-record access server side.

Older settings remain readable without storage mutation. They return `calculationVersion:"legacy-retained-v2"`, `reference:null` and unavailable new-model-only values such as OF and Wi. Their R remains the legacy result. Consumers must check model identity before reconstructing a result with the new formula.

## Settings, snapshots and deltas

Admin adopts or edits the new model through the existing `setReliefSettings` draft operation with expected-value checks:

```json
{
  "schema": 3,
  "calculationVersion": "whole-week-v1",
  "mode": "actual",
  "weeklyPeriods": 84,
  "fourFifthsFraction": 0.8,
  "fajtWeeklyPeriods": 65,
  "timetablePeriods": 60,
  "siuePercent": 150,
  "blocks": {}
}
```

Budgets are finite and positive; timetable periods cannot exceed full-time budget; the part-time fraction is in (0,1]; SIUE is finite and nonnegative. Unknown settings are rejected. `mode:"expected"` adds an Admin comparison without changing authoritative R. Legacy settings are retained in `reliefLegacy` on adoption. New blank versions use schema 3; duplicates retain their source model.

`setPAL` accepts `{schema:1,auto:boolean}` and requires Admin, including mixed saves and retries. Auto reconciliation and FT changes share one commit. Manual preserves copied assignments, editable under ordinary assignment permissions.

Snapshots carry `reliefResults` schema 3. SMC receives applied breakdowns; stored `relief`, `reliefLegacy`, Admin editing detail, audit and private rule values remain role-filtered. The calculation engine and its private catalogue are not embedded into public frontend code.

A saved field delta can include `reliefProjection` with `versionId`, `revision`, `commit`, `reliefResults` and optional Admin detail. Version and revision must match the delta. When inputs are unchanged from the client's immediately preceding revision, it instead has `unchanged:true`; retain the existing calculation and clear pending display status. Do not reuse this across versions or absent baselines. Old cursors, changed authority and unsupported paths still require a coherent reload.

Pending edits hide authoritative R until save completes. A durable save remains confirmed if later display work fails; do not resubmit it as a new write. Current roles are checked before cached data is projected. Cache keys include workbook, version, store, commit, revision and model code. Missing, corrupt or evicted chunks rebuild from stored inputs. Caller-specific authorized responses are not cached.

Pending commits and changing source markers return 503. Invalid parameters return 400; missing versions, teachers or years return 404; unauthorized roles return 403. Existing gateway authentication failures remain. Read-only relief requests do not recover or mutate pending commits.
