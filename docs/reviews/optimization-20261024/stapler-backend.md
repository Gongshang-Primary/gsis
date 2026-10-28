# STAPLER backend optimization evidence

Prepared 24 October 2026. Changes are uncommitted and not deployed.

## Changes and scope

1. An exact saved Stapler revision uses existing incremental structural validation even when the client supplies `basePlan`. A genuinely stale revision retains the full three-way merge and its conflict detail. Current authority, immutable baseline/source, Contacts eligibility, absence, published relief and workload checks remain in place.
2. Replaying an accepted Save or Confirm returns a coherent current projection. The old accepted result and global revision are returned separately as `acceptedResult` and `acceptedRevision`. An old Confirm cannot mark a subsequently restored draft confirmed.
3. Accepted Stapler replays use the existing saved-plan read context, avoiding quota, teacher-profile and class-catalogue reconstruction. Current authority, baseline identity/timing and gateway Calendar checks remain. `receiptStatus` already resolves acceptance without rebuilding the timetable and remains payload/actor bound.
4. Full plan responses include a server-generated SHA-256 content tag scoped to actor and projection mode. Only Confirm may omit its plan, and only when the caller's previously received tag matches current content. Status and internal plan revision are returned explicitly because they are excluded from this transport digest. This tag is not a write-validation shortcut. A changed plan returns full content; old clients that omit the tag retain the full response.

## Measured work and transfer

The same actual Offline JSON used in the preceding study was imported with 100 synthetic staff IDs mapped to its embedded timetable names. Measurements execute signed requests in fresh Apps Script VMs with a local disk-backed Drive adapter and fixture Contacts/quota/register/model I/O. They are not live Google/Cloudflare timings.

| Measure | Previous source | Current source |
| --- | ---: | ---: |
| One-cell Save with merge base: full structural passes | 2 | 0 |
| One-cell Save with merge base: incremental passes | 2 | 1 |
| One-cell Save with merge base: tile checks | 2,778 | 1 |
| One-cell Save with merge base: JSON stringify calls | 65,954 | 9,351 |
| One-cell Save request bytes | 1,567,814 | 1,567,814 |
| One-cell Save response bytes | 792,777 | 792,918 |
| Confirm request bytes | 423 | 531 |
| Matching-tag Confirm response bytes | 792,780 | 9,258 |

Confirm response bytes fall by 98.8%. Counts exclude initial seed save. The content tag adds one serialization, but eliminates almost 784 KB of unchanged Confirm response content. Local elapsed times varied under parallel workload and are not used as latency evidence. Detailed current counters are in `stapler-backend-measure.json`; prior counters remain in the prior study's `quality/actual-measure.json`.

The new regression reproduces the former expensive Save path (2 full plus 2 incremental passes, 3,510 tile checks in the synthetic 104-person fixture) and then verifies 0 full plus 1 incremental pass, 1 tile check.

## Verification

`tests/stapler0812-backend-recovery.cjs` covers exact-revision incremental validation, stale receipt versus current revision, old Confirm after delete/restore, separate accepted metadata, no duplicate durable writes, actual saved-read context with quota/profile/catalogue failures injected, receipt payload binding, compact Confirm, compact same-command retry, unknown tag fallback and a later edit requiring full content.

Existing checks passed: `stapler716-canonical.cjs`, `082-domain-stapler-merge.cjs`, `stapler715-persistence.cjs`, `stapler717-reopen.cjs`, `stapler718c-import-policy.cjs`. These cover immutable source and proof corruption, concurrent disjoint/same-cell merge, fresh-runtime persistence, failed/lost-ack writes, current absence checks, quota checks on new writes, baseline changes and import/cap rules.

## Remaining costs

Save still sends both the local plan and merge base. A changed Save still returns its full accepted plan so normalization and concurrent merges cannot be hidden. New Save/Confirm still build their authoritative context under the shared write lock. The durable operation remains one atomic document replacement, not a physical partial Drive update. Compact Confirm still computes a full authorized projection and content digest server-side; it removes transfer and client work, not that backend projection cost. No live concurrency or network-speed claims are made.
