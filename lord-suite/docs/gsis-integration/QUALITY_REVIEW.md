# Independent source and snapshot review

24 October 2026. Reviewed the staged LORD integration and its GSiS source endpoints. No product code, deployment, live data or provider message was changed by this reviewer.

## Outcome and scope

No remaining material blocker was established in the reviewed source authentication, publication identity, snapshot installation, freshness and general-reference privacy paths. The review covered LORD's backend bridge and relevant readers, GSiS `LordBridge.gs`, `LordDeploy.gs`, `Contacts_Lord.gs`, their actual request entry paths, and the relevant Deploy publication and Contacts transaction boundaries.

The design retains one LORD-owned immutable snapshot and an authoritative local pointer. A short single-flight lease is acquired before upstream work. Both pointer installation and failure reporting check the attempt identity; publication also checks the original pointer and lease expiry. Upstream HTTP calls and candidate file creation occur outside the writer lock. Ordinary readers use the local snapshot. Local Drive/Sheet reads can still occur on a cache miss inside existing booking transactions; this is not a claim that all storage I/O was removed from the lock.

Deploy keys identify the frozen published version, revision and commit. Unpublished draft changes do not invalidate LORD's published references. Contacts computes its own minimal projection digest from a fresh source read, including direct phone/name changes. Source transaction markers are checked before and after the Contacts read. The two components are independently observed; they are not one atomic transaction across applications.

General reference selectors expose IDs and names, plus source status/publication metadata. Private contacts remain in the server snapshot and existing authorised contact consumers. LORD administration and booking ownership are not delegated to imported GSiS roles. Existing booking/session labels and ownership columns remain historical evidence. The separate correctness review owns the detailed identity, history and retained-form cases.

## Findings resolved during implementation

- Initial sync sent an empty `knownKey`, which the real source authenticator rejected. First requests now omit it; strict and actual cross-application tests cover the contract.
- Snapshot-only comparison could let an older failure overwrite a newer unchanged check, or let old success erase newer failure. The single-flight attempt lease fences both success and failure paths, including expired attempts replaced by a successor.
- Whole-sync completion time could make an older Contacts observation appear fresh after a slow second source. Freshness now uses the Contacts request's own start boundary and rejects invalid or future timestamps.
- Source and local snapshot tags were initially accepted without verification. The reader now validates exact source keys, the local version vector, and the pointer's complete file digest.
- Invalid optional cached bytes initially blocked access to a valid durable file. They are now evicted and the immutable file is validated once. Durable-file corruption still fails closed.
- Legacy classes without stored refs initially received name-derived identities, and labels underwent a second normalisation. Missing stable refs now fail with review/republish guidance; labels follow GSiS's canonical class-key convention.

A snapshot-pointer write whose acknowledgement is lost keeps the immutable candidate available. Its changed pointer prevents the old failure path from marking the previous generation failed. The new generation remains unavailable for WhatsApp recipient use until a successful check confirms it. Lost check acknowledgements also fail closed until an idempotent recheck.

## Independent verification

Executed successfully against the frozen working source:

- `tests/run_gsis_bridge_checks.cjs`: 22 cases, including local reads, unchanged-file reuse, exact source tags, stale booking references, phone changes, optional-cache recovery, single-flight ownership, expired attempts, timestamp validation, lost pointer/check acknowledgements, initial activity classification, explicit custom activities/purposes, bounded dashboard work and fresh provider-send guards.
- `tests/run_gsis_contract_checks.cjs`: 8 cases connecting the unmodified LORD consumer to the actual signed GSiS request handlers in offline fixtures. Covered first sync, unchanged reads, direct Contacts edits, unpublished draft isolation, publication changes, source-read races and signature/freshness rejection. Reported zero live calls.
- GSiS `tests/lord-source-bridges.cjs`: 14 source contracts, including field allowlists, pending-state guards, expected-key validation, publication-only reads, stable class refs, exact labels and rejection of the Deploy source from a Roster-role backend.

## Final bounded performance change

Reviewed the later per-execution enabled flag and staff ID/email indexes. The people index is bound to the pinned snapshot object. The booking-to-staff index is bound to the existing event-row array, so the existing event invalidation after a surgical commit also rebuilds that index. Partial binding edits retain the last explicit staff identity. No persistent cache or new storage mechanism was added by this optimization.

The provider boundary deliberately bypasses the memoized enabled flag: each send rereads the live enabled flag, snapshot pointer and check record. Both enabled-to-disabled and disabled-to-enabled transitions after recipient resolution reject the old-mode recipient. Failed check state and changed snapshot pointers remain send blockers. The independent 22-case bridge rerun and eight-case signed cross-application rerun passed after this change.

The recorded `backend-work-counts.json` matches reviewed source SHA-256 `ed64b59f3461142d35aeeb180cd7717a2e7f103c8cb43e58c905899314b8c760`. For its 100-row movement fixture with 100 contacts, it records Script Properties reads falling from 101 to 1 and email-property accesses from 20,100 to 200. Overdue reads fall from 104 to 4, and 100 booking lookups visit 100 binding rows instead of 5,050. The regression suite independently verifies bounded work at 30 and 100 rows and exactly three fresh property reads at the provider guard. These are simulated service/work counts, not measured production response times.

## Limits

These are deterministic fixtures and source traces, not a production latency, quota or simultaneous Apps Script execution benchmark. Trigger installation, configured private-folder access, current live source records, browser/device acceptance and WhatsApp delivery need installation/UAT. Known failed checks, a mismatched local generation, or Contacts verification older than five minutes block provider sends. Validity during the provider call itself is not a cross-service transaction.

This was a scoped integration review, not an exhaustive audit of every LORD or GSiS line. The parent owns full-suite, generated-package and deployment checks. No live credentials were printed or changed in this review.
