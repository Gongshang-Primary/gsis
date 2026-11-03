# roster-import-duplicate-audit-id: retained audit identity investigation

Model: Codex. Lane R, read-only investigation.

## Claim

Status: findings ready for review; owner decision pending. Owner/model: Codex. Reviewer/model: Claude. Updated: 4 November 2026, Asia/Singapore.

Branch: `codex/roster-import-duplicate-audit-id`. Base: main `a38b17464d4cb8d75183569d9c7cc5219fb7da88`, tree `8eaaa41c09eedd93f9c4eb8662849bc56949c27a`. The local base materializes that exact tree; publication uses the actual main commit as parent.

The owner requested a separate read-only task after Claude's review of #69 at `2c0c17c`. Only this task file is owned. No overlap with #69's implementation files. The task claim is published on this separate branch; the default branch remains for the owner's merge.

Scope: identify both retained audit rows using dates, kinds, IDs and timestamps only; trace the writer and retry/export paths; compare three repair rules for owner approval; propose a guard against new collisions. No staff names, actor identities, comments or record payloads enter the report.

Out of scope: product changes, scripts, live Google/Drive/D1 writes, data repair, import execution, freeze, restart, deployment and authority changes.

Acceptance: verify the retained source digest, identify both rows without private content, reproduce the cause with synthetic data, cite the code and assess #61, explain parity/history effects, record a recommendation and guard, and post the findings to Claude.

## Findings

The retained collision is a Stapler request followed by its decision. Both are distinct events in `roster.audit`. Their shared planning-request ID overwrites the new audit-event UUID. A normal request/decision sequence reproduces the failure without a retry.

### Retained evidence

Source: session `ab0d91fc…`, checkpoint ordinal 140 (displayed step 141). Its 20,228,544-byte packed source has SHA-256 `83e30bcc6f9b55730d5b8a50c2ba4bb37a813225ee52f9e63ec1e9315f07d845`, matching the retained checkpoint. The original source remains unchanged and outside Git.

There are 3,634 audit rows and one repeated audit ID, used by these two rows. Positions are zero-based. All times below are Singapore time.

Shared ID: `3202a57b-1965-4341-b556-adbe2bf1f785`.

| Position | Audit kind / operation | Event date | Recorded creation time (`at`, SGT) | Saved revision | Domain writer |
| --- | --- | --- | --- | ---: | --- |
| 3485 | Stapler planning request, `requestStapler` | 2026-11-06 | 2026-11-03 06:53:20.256 | 1090 | `GSISRosterOperations.staplerApply`, request branch |
| 3486 | Stapler decision, `decideStapler` | 2026-11-06 | 2026-11-03 06:55:06.033 | 1091 | `GSISRosterOperations.staplerApply`, decision branch |

UTC equivalents are `2026-11-02T22:53:20.256Z` and `2026-11-02T22:55:06.033Z`, 105.777 seconds apart. Audit rows use `at`; they have no separate `createdAt` field. The matching `staplerRequests` record has this ID, `createdAt` equal to the first timestamp and `decidedAt` equal to the second. Two retained command receipts have different request IDs and digests, the corresponding timestamps, revisions 1090/1091 and the same saved business ID. No actor identity, decision value, comment or staff record is reproduced here.

The source establishes the domain operations and the accepted saves. Its inline receipts match the Google structured-transaction writer. Original HTTP/execution logs and the exact deployed execution instance were not inspected.

### Cause and code references

References below are pinned to main `a38b17464d4cb8d75183569d9c7cc5219fb7da88`.

1. The [request branch](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/shared/roster-operations.js#L763) creates a planning request, then calls `allocation().addAudit(s,ctx,op,{date:d,id:row.id})`.
2. The [decision branch](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/shared/roster-operations.js#L764) updates that same request and passes its ID to `addAudit` again.
3. The [audit helper](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/shared/roster-allocation.js#L238) builds `{id:ctx.uuid(),at:ctx.iso,date,actor:ctx.user.email,operation,...detail,...}`. JavaScript's later spread replaces `id` with `detail.id`. The helper then appends the event. A static scan finds exactly these two direct `addAudit` calls with a top-level `id` detail in `shared/roster-operations.js`.
4. The [Google adapter](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterOperations.gs#L767) applies the shared operation, appends its command receipt at line 769 and commits the structured document at line 772. That document can contain both colliding audit rows. Its general [commit function](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterOperations.gs#L52) does not enforce this audit identity invariant.
5. [Record preparation](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/shared/roster-import.js#L53) calls `Store.encode`. The [encoder](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/shared/edge-store.js#L79) rejects repeated `(collection, record_id)` values. Line 86 derives `record_id` from `entry.id`, so both become the same `audit` record key despite their different positions, kinds and times.

The event ID and the planning-request ID have been conflated. This is a producer bug, rather than evidence of a random UUID collision.

### Retry and #61 assessment

The Google [receipt lookup](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterOperations.gs#L742) returns the saved result before applying the operation again. The D1 [mutation wrapper](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/roster-update/public/edge-roster.js#L81) also checks receipts first. Even with a new request ID, the request branch returns an existing pending/approved request without adding another audit; the decision branch refuses a request that is no longer pending. A synthetic repeated request adds no audit, while the following decision produces the collision. A lost response is not needed to explain this pair. The retained evidence cannot prove whether either network response was lost.

[PR #61](https://github.com/helper-gsps/gsis/pull/61/files) changes export scheduling and D1 export handling, without changing either Stapler producer or `addAudit`. Its [catch-up loop](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/notification-worker/index.js#L70) calls the existing exporter. The Google [capture selector](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterAuditExport.gs#L3) does not select these two operations; neither row has `decisionChanges` or export-capture flags. Running that selector on an in-memory copy leaves this pair unchanged. The D1 exporter reads already stored audit records; it does not append these domain events. The producer explains the collision, with no evidence that #61 created it.

There is a further history risk: the Google [archive merge](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterAuditExport.gs#L101), Google [archived-date audit read](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/backend/RosterOperations.gs#L703) and D1 [archived-date audit read](https://github.com/helper-gsps/gsis/blob/a38b17464d4cb8d75183569d9c7cc5219fb7da88/roster-update/public/edge-roster.js#L111) use maps keyed by audit `id`. These can coalesce distinct colliding events. The retained source has an allocation-export entry for 6 November. Preserving two D1 storage rows alone would not fix every history reader.

## Repair rules for owner approval

These are proposals. No source, live state, checkpoint, archive, record or ID has been repaired.

Parity has two meanings here: decoded audit payload/order parity, and transport/manifest byte parity. They must not be treated as interchangeable.

| Option | Rule and effect on this pair | Parity | Audit history and cost |
| --- | --- | --- | --- |
| (a) Deterministic suffix on the later row, recommended | Keep the first ID. Give the second `3202a57b-1965-4341-b556-adbe2bf1f785~decideStapler~20261102T225506033Z`. Retain every other value and both positions. Validate the new ID is unused. Record the original/new ID mapping separately. | The ID change changes canonical scope/source digests and affected part/manifest digests. Comparison to the untouched snapshot requires an explicit approved mapping, then equality of all other fields and order. | Keeps both distinct events and fits existing unique-ID readers. The planning-request record keeps its own original ID. No new storage-key convention is required. |
| (b) Composite storage key, keep original payload IDs | Key these events by `(original ID, operation, at)` while keeping their payloads and positions unchanged. Define a stable occurrence discriminator for any remaining exact-key collision; do not rely on a mutable array index alone. | Decoded payload/order parity can remain exact. Physical keys and affected part/manifest hashes change. An in-memory encode/decode demonstration preserves canonical payload parity. | Keeps both events only if import, subsequent writes, backup/restore, archive merges and history readers use the same identity. Current `Store.commit` encodes state again, and current history maps still use payload `id`; changing only import keys would leave failures or coalescing. Broader implementation and compatibility work. |
| (c) Drop an exact duplicate | Eligible only after complete payload equality and evidence that both rows represent the same accepted event. This pair has different operations and timestamps, so this option is ineligible. | Removing a row changes array/count/order and canonical/transport digests, even when the removed payload equals another. | Loses an occurrence. Any approved true-duplicate cleanup needs a retained mapping/occurrence record. Dropping either current row would erase a distinct lifecycle event. |

Recommendation: approve (a) as the smallest historical identity correction, together with the producer guard below. Preserve the original source/checkpoint as evidence and review a concrete repair plan before any execution. The mapping must be deterministic from immutable metadata, check uniqueness across the full audit collection and fail if the candidate is already used. The candidate above is unused in the retained source.

An approved future repair must establish new source and parity proofs for the approved state. It must not edit an immutable retained checkpoint or silently label the changed state equal to the old digest. This task authorizes no repair, freeze or restart.

## Proposed guard against new collisions

Separate event identity from subject identity. The two Stapler calls should provide `planningRequestId` as a reference. The shared helper must own `id`, `at`, `actor` and `operation`, reject attempts to supply those reserved fields, and check that its generated event ID is absent before appending. Both lifecycle events then retain their own audit IDs and the same planning-request reference. Preserve the existing receipt-based retry behavior.

Add a transaction-bound check for newly appended audit IDs on the Google writer path and D1 commit path. Compare them against the locked pre-command IDs and other new IDs. Refuse a new collision before the durable write; never discard or silently overwrite an event. Include direct appenders such as the Google reconcile path, rather than guarding only the two current callers.

Existing historical duplicates require the separate owner decision. A guard must not turn every unrelated Google save into a failure merely because this old pair remains; validate newly introduced collisions against the pre-command state until approved historical repair is complete. The existing D1 encoder refusal remains enforced.

Future implementation acceptance: a request and its decision have distinct audit IDs but one planning-request reference; same-request retries add nothing; a deliberately repeated UUID or reserved-field override cannot persist; direct appenders cannot bypass the check; existing historical collisions are never silently repaired or deleted. Verify both Google and D1 paths and the archive/history readers for the chosen repair rule.

## Verification

The local checkout's base tree exactly matches main `a38b174…`. Only this task file changes.

| Check | Result |
| --- | --- |
| SHA-256 of the original retained source against its checkpoint | Match; raw source retained outside Git |
| Metadata-only scan of all 3,634 audit rows | Exactly the two rows and one shared ID above; payloads differ |
| Parent request and retained receipts | Creation/decision times match; separate request IDs/digests and consecutive accepted revisions |
| `TZ=Asia/Singapore node` via stdin, actual shared request/decision functions and synthetic people only | Two lifecycle events, one audit ID; `Store.encode` throws `EDGE_RECORD_ID`; repeating the pending request adds no audit |
| `TZ=Asia/Singapore node` via stdin, isolated in-memory copies of the retained pair | Suffix keeps both and changes canonical parity; composite storage metadata keeps exact decoded payload parity; exact-duplicate deletion is ineligible |
| Actual Google audit-capture selector on an in-memory state copy | Leaves both colliding rows unchanged |
| `TZ=Asia/Singapore npm run build` | All 18 components rebuilt; no generated-file differences |
| `TZ=Asia/Singapore node tests/stapler080-pending-request-retry.cjs` | Passed |
| `TZ=Asia/Singapore node tests/roster-quiet-audit-catchup.mjs` | All 21 existing Google/D1 catch-up cases passed |

The stdin investigations contain no persisted script or product patch. Full-suite CI for the final documentation head is recorded in the PR handoff. No live acceptance, complete import or applied guard is claimed. No staff names, actor values, comments or record payloads are committed.

## Review and deployment

Claude reviews the final published head. This task changes documentation only. Nothing is deployed.

## Handoff

Owner decision pending on historical rule (a), (b) or (c); (c) does not qualify for this pair. Claude should review the evidence and recommendation. Any repair or implementation needs a separate explicit instruction and reviewed plan. Google/Drive/D1 state, retained checkpoints and authority remain untouched.
