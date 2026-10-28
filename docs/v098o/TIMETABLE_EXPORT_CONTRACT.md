# Native timetable preparation export, revision O

This contract copies **timetable sources into an isolated preparation service**. Google remains production authority. The export and import do not change a baseline, Stapler plan, absence, relief assignment, notification, receipt, source-ownership flag or production consumer. There is no timetable cutover endpoint in this release.

## Source access

The existing authenticated Roster service routes these three read operations to `rosterTimetablePreparationDispatch_(req,c)`. Contacts must have verified `c.user.rosterAdmin === true` before any source read. SMC membership alone does not grant access. The source's existing Google/edge ownership guard remains in force. A fenced Google backend cannot export itself as current authority.

| Operation | Exact request input fields | Result |
| --- | --- | --- |
| `timetablePreparationManifest` | `operation` | Current native timetable manifest |
| `timetablePreparationPart` | `operation`, `sourceKey`, `partId` | One canonical native part |
| `timetablePreparationCheck` | `operation`, `sourceKey` | Fresh source observation matching the export |

Extra input fields are rejected. This is not a service-token-only bulk migration API. The isolated Worker receives a manually uploaded file and has no Google backend credentials.

The window is the Singapore current date through date +30 inclusive: **31 dates**. Every operation captures the current window explicitly. Crossing Singapore midnight invalidates the old source key and requires a new export. No Calendar data is exported; odd/even dated parity, school days and current Calendar freshness remain unproved. Baseline verification covers every stored week and weekday instead.

## Canonical representation and bounds

`stable(value)` recursively sorts object keys using JavaScript `.sort()`, preserves array order, and uses ordinary JSON encoding for strings, booleans, null and finite numbers. Undefined and nonfinite values are unsupported. `sha256` is lowercase hex SHA-256 over the canonical UTF-8 bytes. `bytes` counts UTF-8 bytes, not JavaScript characters. Source and destination use the same exact algorithm.

| Bound | Maximum |
| --- | --- |
| Native part | 4 MiB uncompressed |
| Source baseline file | 4 MiB before parsing |
| All part bytes | 64 MiB |
| Manifest | 256 KiB |
| Part descriptors | 62 |
| Date mappings | Exactly 31, consecutive and ordered |

Oversized input fails explicitly. It is never truncated or partly certified.

## Manifest

```json
{
  "schema": "gsis.timetable.preparation.manifest",
  "version": 1,
  "release": "0.9.8o",
  "mode": "shadow-only",
  "capturedAt": "2026-10-28T00:00:00.000Z",
  "from": "2026-10-28",
  "to": "2026-11-27",
  "timeZone": "Asia/Singapore",
  "calendar": {"status": "not-exported", "verified": false},
  "baselineMap": [{"date": "2026-10-28", "baselineId": "EXAMPLE_BASELINE"}],
  "parts": [{"id": "baseline:EXAMPLE_BASELINE", "kind": "baseline", "sha256": "64_LOWERCASE_HEX_CHARACTERS", "bytes": 1234}],
  "sourceKey": "64_LOWERCASE_HEX_CHARACTERS"
}
```

The shortened example shows one mapping; real exports contain exactly 31. Each `baselineId` is the baseline selected by the production `GSISRoster.active` rule, or null. A missing baseline does not prevent exporting a confirmed standalone suspended timetable. Only baselines used by the window are included.

Compute `sourceKey` from the canonical representation of exactly:

```text
{schema:"gsis.timetable.preparation.source",version:1,from,to,baselineMap,parts}
```

`capturedAt` is an observation time, outside source identity. Unrelated register revisions, absence submissions, notification work and unconfirmed planner edits do not invalidate unchanged timetable content. Relevant baseline names/validity/priority, normalized model content, date mappings, and confirmed plan metadata/content do invalidate it.

## Part wrapper

```text
{
  schema:"gsis.timetable.preparation.part", version:1,
  sourceKey, id, kind, sha256, bytes,
  data:<canonical JSON string of the native payload>
}
```

The descriptor's hash, byte count, kind and ID must agree with this wrapper and decoded payload. Baseline part IDs are `baseline:BASELINE_ID`; suspended part IDs are `suspended:YYYY-MM-DD`.

### Native baseline payload

Exactly:

```text
{
  schema:"gsis.timetable.preparation.baseline", version:1, id,
  entry:{id,name,from,to,priority},
  model:<GSISRoster.validate output>,
  expectedProjectionHashes:{single:[five hashes]}
}
```

Odd/even models instead use exactly `odd` and `even`, with five hashes each, in Monday through Friday order. Normalize the complete source with the production `GSISRoster.validate` rules. Unknown source extensions, Drive file IDs and editor/account details are excluded. The destination normalizes again and requires exact structural equality.

For each stored week and weekday, the source hashes:

```text
{
  periods:[{period,startMinutes,endMinutes}],
  teachers:[{name,cells:<that weekday's four-string cells>}]
}
```

Period timings come from the native model. The destination reconstructs each projection independently using the shared pure production rules and compares the hash. This proves copied source/model projection agreement; it does not infer the Calendar parity for a date or map timetable names to live staff identities.

### Native suspended payload

Exactly:

```text
{
  schema:"gsis.timetable.preparation.suspended", version:1,
  date,name,baselineId,revision,confirmedAt,independentBaseline:true,
  plan:<schedule-only native Stapler plan>,
  expectedProjectionHash
}
```

`name` may be empty. `confirmedAt` is a UTC timestamp with milliseconds or null. `baselineId` is the historical identity in the intended plan; it need not be selected by the current baseline map. `revision` is the proven confirmation/publication revision, and the exported `plan.revision` is set to the same value. `status:"draft"` inside this portable native plan is the domain editing representation, **not a loss of confirmation**; confirmation evidence is held in the outer fields.

Select content with `GSISRosterOperations.confirmedStaplerSnapshot`, which also supports the existing proven published/legacy confirmation fallbacks. Never export a later unconfirmed draft. A record marked confirmed without provable contents fails with `TIMETABLE_PREPARATION_CONFIRMATION`; it is not silently dropped. Duplicate saved dates fail explicitly.

Apply the existing confirmed-view privacy projection, then allow only these schedule fields:

- Plan: `schema,date,baselineId,parity,endOfDayMinutes,venues,status,revision,nextId,periods,teachers,classes,subjectCategories,tiles,mats,warnings,recessDefaults,baseline`.
- Period: `period,startMinutes,endMinutes`.
- Teacher: `staffId,name,timetableName`.
- Class: `id,name,level,traditional,venue`.
- Tile: `id,kind,teacherId,classIds,period,location,subject,venue,group,baselineId,source`, and optional `durationMinutes`.
- Tile source: `teacherId,classIds,period,subject,venue,group`.
- Suspension marker: `target,targetId,fromPeriod,toPeriod,reason`, with reason fixed to `Suspended`.
- Baseline subobject: `parity,endOfDayMinutes,venues,tiles,teachers,classes,periods,subjectCategories,recessDefaults`, using the same nested shapes.
- Recess default: `level,startMinutes,endMinutes`.

Warnings are an empty array. Subject categories accept the existing values `Teaching`, `FTT`, `Non-teaching`, `Unclassified`. Private reasons, contacts, editor identities, arbitrary imported extensions, offline source annotations and relief-import provenance are excluded. Schedule cells are preserved with the existing confirmed-view redaction of absence subjects. This is a portable **schedule** contract, not a lossless full operational archive or relief-ledger export. The original Google source remains intact.

The expected projection is built by `GSISRosterStapler.effectiveDay(plan)` **without a current baseline**, then hashes exactly:

```text
{
  date,baselineId:effective.id,parity,endOfDayMinutes,
  periods:[{period,startMinutes,endMinutes}],
  teachers:[{staffId,name,timetableName,cells}],
  classes:[{id,name,level,traditional,venue}],
  recesses:[{classId,periods}]
}
```

This avoids the absence/relief overlays in `timetableDay` and `dailyPublicationStates`. New baseline uploads cannot change the confirmed intended outcome.

Native domain detail: legacy recess validation compares JSON object insertion order. After parsing canonical wire JSON, the destination restores tile source keys to native order `teacherId,classIds,period,subject,venue,group` before calling native validation. This changes no canonical content or digest.

## Consistency and final check

Every handler reads the relevant register/confirmed source, directly reads and validates each model, directly rereads the model content, then rereads the narrow relevant source selection. Work grows with the selected model count; this is an on-demand preparation tool, not a cron task or faster production viewer. A changed model, metadata, confirmed plan or date window fails with HTTP 409 `TIMETABLE_PREPARATION_CHANGED`. No writer lock, intake drain, persistent cache write or source mutation is taken. The final check repeats these source reads and verifies the full manifest source hash.

Successful check shape:

```text
{
  schema:"gsis.timetable.preparation.check",version:1,
  sourceKey,checkedAt,unchanged:true,readOnly:true,calendarVerified:false
}
```

The browser downloads one file with exactly:

```text
{
  schema:"gsis.timetable.preparation.bundle",version:1,
  manifest,parts:[<full part wrappers>],sourceCheck
}
```

The administrator requests a manifest, fetches every listed part with that source key, then requests the final check. Any source-change error discards this export attempt and starts from a fresh manifest. The Worker accepts the observed file for shadow storage only. It independently verifies schemas, hashes, native structure and expected projections, writes compressed immutable objects, verifies readback, and advances only its isolated D1 preparation pointer using CAS and a durable request receipt.

A source check is an observation in an administrator-supplied file. It is **not signed production provenance, a continuing freshness guarantee or permission to activate Cloudflare ownership**. Source writes can occur after the final observation. The future cutover still needs a trusted final source comparison and single-writer handover.

## Later production handover

Preparation does not implement the following: fencing every baseline upload/edit/activate/delete and Stapler save/confirm/import/reset/move/restore path; a final current-source import; verified current Contacts staff-ID/Name Bridge mappings and Calendar school-day/parity; production consumer routing and staff/venue-specific authorization; source-change-driven updates and failed-sync repair; Singapore daily rollover; recovery retention/pruning; or asynchronous Google backup. The relief-assignment ledger remains on the existing Google production pipeline.
