# GSiS v0.5.05 API contracts

This document extends API_CONTRACTS_v0.5.04.md. Write protocol stays 500. Current school identity and Contacts-owned role checks, version ownership, immutable uncertain save requests, durable journals, Applied markers, receipt authorization and frozen publication semantics remain.

## Teaching groups

New `addTG` and `updateTG` requests supply `levelWide` and `classRefs`. `classRefs` contains unique stable references to existing classes at the TG's level. Selected-class scope requires at least one reference; whole-level scope requires an empty list. `venue` is independently selected. CCE EL requires whole level.

Saved groups retain `classRefs`, `associationSchema: 1`, derived `sources` labels and the existing group ID. Associations never produce extra teacher assignments. Class rename changes readable labels while preserving stable references. Class deletion or a move across levels is blocked until dependent TG associations are explicitly removed. Existing legacy associations are resolved for display without silently discarding unresolved labels or references; replacement requires `resolveLegacy: true` after user review. Modern groups require modern class-selection requests, preventing an old single-anchor request from overwriting their associations.

Unassigned modern TGs remain unassigned during Layout publication; the historical single-anchor fallback remains for untouched legacy groups. Venue moves and class selections remain separate operations.

## Version-owned relief settings

The `saveDraft` edit `setReliefSettings` uses the existing expected-value, identity, request ID, issued-at, receipt and recovery rules. Its `value` has this shape:

```json
{
  "schema": 1,
  "mode": "actual",
  "periodsPerDay": 12,
  "daysPerWeek": 5,
  "lunchPeriodsPerDay": 2,
  "siuePercent": 150,
  "blocks": {"teacher-stable-id": 3}
}
```

Mode is `actual` or `expected`. Days per week must be an integer from 1 through 7; daily timetable must be positive, lunch cannot exceed it, and all other numeric factors and teacher Blocks must be finite and nonnegative. Blocks belong to teachers in the selected version. Invalid settings fail validation; they are never interpreted as spare capacity.

Absent settings use the defaults shown with no Blocks. A duplicate version inherits a copy of settings and Blocks. A fresh version retains the factors and mode but clears Blocks. Later changes remain isolated between versions.

## Read-only relief API

The Deploy Worker accepts school-authenticated `GET /api/relief`, with optional `versionId`, `teacherId` and `year` query parameters. It uses the existing host session or Google identity. Current KP or Admin authority is checked through Contacts on every request. An ordinary school account without either role is rejected. Responses use `Cache-Control: no-store`.

```http
GET /api/relief?versionId=version-stable-id&teacherId=teacher-stable-id&year=2027
```

A trusted server can instead POST the existing signed envelope to the Deploy Apps Script `/exec` endpoint. Sign the exact JSON payload string using HMAC-SHA256 and the existing Deploy `BRIDGE_SECRET`, then send `{ "payload": "...", "signature": "hex HMAC" }`. The payload contains action `relief`, the input object, a verified school identity `{email, subject}`, current millisecond `timestamp`, and a fresh UUID `nonce`; optional `traceId` joins diagnostics. Never expose the bridge secret in a browser. Signing does not bypass the current Contacts role check.

Omitting `versionId` reads the frozen published snapshot. Supplying it reads that version's current draft. Omitted `teacherId` returns every teacher in that version. `year` filters the selected version by its explicit valid date range; it does not select another year/version automatically or derive a year from a name. Missing dates give 400, a nonmatching year gives 404. Unknown teachers or versions give 404. Unknown or invalid input fields give 400. Pending field commits give 503 without recovering or writing as a side effect of this read.

The successful wrapper is `{ok:true,data:...}`. The data has `schemaVersion:1`, `backendVersion`, units `periods/week`, a `version` object with ID, name, revision, commit, publication flag and dates, `basis`, factor `settings`, `weeklyPeriods`, `weeklyLunch`, `settingsError`, and `teachers`. Its explicit integration flags are:

```json
{
  "planningQuota": true,
  "timetableAvailability": false,
  "blockSource": "version-planning-allowance"
}
```

Each teacher result contains `teacherId`, `name`, `active`, `eligible`, `R`, `blockPeriods`, `remainingR`, `available`, `reason`, and calculation `inputs`. Unavailable `R` and `remainingR` are `null`, not zero. Inputs include the selected teaching basis, actual teaching, teaching used, actual FTT/PD/duties, SIUE periods, retained fraction and combined offload percent. The export does not include Contacts email, phone or profile fields.

Illustrative teacher result, not school data: weekly budget 60, lunch 10, actual teaching 12, actual FTT 5, PD 2, duties 1, SIUE 150%, combined offload 30%, Block 3:

```json
{
  "teacherId": "example-teacher",
  "name": "Illustrative Teacher",
  "active": true,
  "eligible": true,
  "R": 8.4,
  "blockPeriods": 3,
  "remainingR": 5.4,
  "available": true,
  "reason": null,
  "inputs": {
    "teachingBasis": "Actual teaching",
    "actualTeaching": 12,
    "teachingUsed": 12,
    "actualFTT": 5,
    "actualPD": 2,
    "actualDuties": 1,
    "siuePeriods": 18,
    "retainedFraction": 0.7,
    "offloadPercent": 30
  }
}
```

Numbers retain calculation precision; consumers may format them, but must not infer a rounded count of assignable timetable slots. This API does not assign relief, check individual timetable periods, deduplicate imported Block events or send notifications.

## Conditional catalogues and diagnostics

Read-only Deploy catalogue requests may include `knownCatalogueHash`. Contacts computes the hash from shared `sysFields`, `roleCatalogue` and people content, caches data by epoch, and always obtains current authority. A matching authoritative result can omit those catalogue fields and return `catalogueUnchanged:true`, its hash, current epoch and fresh user. Pending/degraded views do not validate this shortcut.

Deploy may hydrate content-addressed cached data only after that fresh signed confirmation. Chunk eviction, malformed metadata or checksum failure causes a full signed fetch; role revocation or a failed authority request cannot be repaired from cache. Browser snapshots omit the corresponding catalogues only when the caller supplies a matching hash; old clients still receive the full fields. Catalogue hashes are distinct from version revision and publication identity.

Trace IDs join browser attempts, gateway diagnostics and backend phases. Inner Contacts phases are retained with measured bridge time, and Deploy records lock-wait and lock-hold phases. A browser or gateway timeout does not mean Apps Script stopped executing. Mutations remain immutable until their authorized receipt establishes the outcome.

## Layout cache and storage boundaries

The Layout Worker caches canonical complete public snapshots for 45 seconds, keyed by backend connection and year. It reconstructs a caller's unchanged response from that complete snapshot rather than storing a cursor-dependent result as a whole-year cache entry. Only the existing public schema is retained; authority, request diagnostics and arbitrary extra fields are removed. Public teacher labels remain part of that existing schema. Cache failures fall back to the backend. Concurrent reads in one Worker instance share a pending fetch; this is not a global distributed lock.

Public polling uses a 60 to 75 second jittered interval and pauses hidden tabs. Publication and handoff freshness can therefore lag; manual Refresh can still use the short cache. Private Contacts deployment and Deploy active feeds keep their authenticated boundary.

New Deploy index commits warn at 35,000 characters and reject over 45,000 before writing the journal, pending marker, fields or receipts. Recovery alone can finish an already durable older transaction up to the 50,000-character storage ceiling. Final and pending index variants are both checked. Consistency re-reads and global writer locking remain.
