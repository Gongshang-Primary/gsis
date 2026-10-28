# GSiS v0.5.07 API contracts

This release changes the relief response to schema version 2. It retains Deploy write protocol 500 and all unrelated v0.5.06 contracts. Install the matching backends and frontends together. No new URL, identity, secret or public access grant is introduced.

## Read individual capacity

Use authenticated `GET /api/relief`, or the existing server-signed Apps Script `relief` action. The gateway and backend retain current school identity and KP or Admin checks. Bridge secrets must remain server side. This release does not configure cross-origin access or connect a receiving webapp.

Optional query parameters:

| Parameter | Meaning |
| --- | --- |
| `versionId` | Explicit current draft. Omit to read the frozen published version. |
| `teacherId` | Stable teacher identity in the selected version. Omit for every teacher. |
| `year` | 2000 to 2099. Requires the selected version's date range to overlap that year. |

The existing success envelope is `{ "ok": true, "data": ... }`. Example data for an authorized KP caller, with illustrative identifiers and values:

```json
{
  "schemaVersion": 2,
  "backendVersion": "0.5.07",
  "units": "periods/week",
  "version": {
    "id": "example-version-id",
    "name": "Example published version",
    "revision": 12,
    "commit": "example-snapshot-commit",
    "published": true,
    "from": "2027-01-01",
    "to": "2027-12-31"
  },
  "planningQuota": true,
  "timetableAvailability": false,
  "blockSource": "external",
  "teachers": [{
    "teacherId": "example-teacher-id",
    "name": "Example teacher",
    "active": true,
    "eligible": true,
    "R": 8.4,
    "available": true,
    "reason": null
  }]
}
```

`R` is actual-based estimated weekly relief capacity before Blocks. Fractional precision is retained; display rounding does not change the contract. A valid zero has `available:true`. An unavailable result has `R:null`, `available:false` and a neutral reason. Availability here means the calculation is available, not that a timetable slot is free. Never convert null to zero or spare capacity.

Preserve teacher identity and `version.id`, `revision`, `commit` and `published` when importing. The default published snapshot remains frozen until republished. An explicit draft can change between reads. If a save is pending or the index changes while calculating, the read returns 503 and does not perform recovery or mutate data. Invalid parameters return 400; missing versions, teachers or matching years return 404; unauthorized roles return 403. Existing gateway authentication failures remain unchanged.

## Blocks belong to the receiving app

Schema 2 removes top-level `basis` and `settings`, and per-teacher `inputs`, `blockPeriods` and `remainingR` from the common contract. This is an explicit breaking change from schema 1. Update consumers before installation.

The receiving app stores its own weekly Block periods B. For an available R, it computes `max(0, R - B)` once, in matching period units. For unavailable R, it retains unavailable status. Changing external B does not change Deploy R. Do not also subtract any legacy Deploy Block allowance. Operational availability, allocation and demand remain the receiving app's responsibility.

## Admin details

An Admin response additionally includes `admin`, with normalized `settings`, `weeklyPeriods`, `weeklyLunch`, `settingsError`, the formula explanation and calculation `rows`. Each row contains identity, actual teaching/FTT/PD/duties, retained fraction, SIUE periods, R, a detailed reason, an optional Expected comparison and `legacyBlockPeriods`. The API excludes `admin.settings.blocks`; legacy row values are compatibility information only. A teacher filter also limits Admin rows.

KP-only responses never include `admin`. Other workload and HR permissions are unchanged. Shared appointment/employment factors retain their existing workload access; their relief application and private relief configuration are available only in Admin detail. The access boundary does not promise protection against inference from independently visible workload data and R.

Authoritative calculation remains:

`R = max(0, q * [W - lunchPerDay * days - actualFTT - actualPD - actualDuties - (1 + SIUE/100) * actualTeaching])`

q is the existing combined retained fraction, including employment and appointment treatment, applied once outside the bracket. No alternative offload placement is introduced. `mode:'expected'` adds an Admin comparison; it never changes authoritative R. Missing or ambiguous Expected references affect only that comparison when actual workload is complete.

## Version-owned settings and app snapshots

Admin saves use the existing `setReliefSettings` draft operation, expected-value checks and durable receipts. The backend rejects KP writes before processing a mixed batch or replaying a rule receipt. Direct legacy/unsupported write paths do not grant additional access.

```json
{
  "schema": 2,
  "mode": "actual",
  "weeklyPeriods": 60,
  "daysPerWeek": 5,
  "lunchPeriodsPerDay": 2,
  "siuePercent": 150,
  "blocks": {}
}
```

The displayed defaults are unchanged policy. W must be finite and positive; days must be an integer from 1 through 7; lunch and SIUE must be finite and nonnegative; weekly lunch must not exceed W. Schema 1 remains readable and accepted for legacy Admin saves using `periodsPerDay * daysPerWeek`. Normalization outputs schema 2. Supplying both budget forms is rejected. A copy preserves the effective budget; duplicate versions retain legacy Blocks independently and blank versions keep their existing clearing behavior.

Snapshots include `reliefResults` with schema 2, period units and minimal teacher results for authorized users. Only Admin receives stored `relief` and normalized `reliefAdmin` detail. Audit remains Admin-only; private rule values are removed from non-Admin deltas, receipts and conflict notices. Private calculations/defaults are absent from public frontend code. Calculations use stored version inputs before a legacy snapshot fills unrelated UI fields from current Contacts, so Ledger and API R agree even when live catalogues differ.

The v0.5.07 app sends `reliefResults:true`. Workload-affecting deltas signal `resync:true` so the app reloads coherent calculated results after the durable save. Unrelated edits retain normal deltas. Pending local edits do not project calculated R. Ledger and Stats display saved server R; Stats retains an arithmetic category mean, valid zero handling and Unavailable for empty or incomplete categories. Overlapping categories cannot be summed as an unduplicated total.

If a confirmed save or changed-input poll requires a reload and that reload fails, R stays unavailable with a Refresh to update message. The confirmed write remains saved and is not resubmitted.
