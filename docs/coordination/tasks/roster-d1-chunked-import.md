# roster-d1-chunked-import: import the Roster into D1 in pieces

- Status: post-#10/#11 integration verified; Claude current-head review pending
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 17:27
- Branch: codex/roster-d1-chunked-import
- Base SHA: 7b0d54bdb853e419ebc7ff7c98fc752d6ad9639f (accepted claim)
- Current head SHA (or PR head; avoid self-referential commit hashes): the PR description records the exact final review head; any new commit requires another head-specific review
- PR: [#8 — Resume Roster D1 imports from immutable chunks](https://github.com/helper-gsps/gsis/pull/8)
- User-authorised scope: Song Wee, 29 Oct 2026: review Claude PRs #2–#6, build roster-allocation-run-once first, then claim and build this task as priority 2. No ROSTER_EDGE_AUTHORITY switch.
- Files/domains owned (include generated outputs): backend/RosterEdgeMigration.gs and the Roster dispatch allowlist (export side); canonical shared edge-store/import helpers and shared/edge-setup.js; roster-update/public/edge-roster.js; builders and generated backend/browser/Worker copies; focused tests, runtime profiling evidence, task/changelog/roadmap records.
- Out of scope: activation (edgeFence), notification Worker behavior (generated bundle refresh only), quiet mode (PR #5), absence policy.
- Acceptance checks: see below.

## Problem (evidence, 29 Oct 2026)
- Production import from `roster.gsps.edu.sg/edge-setup` fails with "The response could not be read" (~05:05 SGT). D1 heads stayed `legacy`, revision 0 (verified by query). Likely cause: the Pages Worker holds the whole export (`Roster operations.json` 13.7 MB plus notification transport 2.2 MB, inbox, intake) as text, parsed object and packed copy at once, over the 128 MB Worker memory limit and possibly CPU time.
- `rosterEdgeSnapshot_` (`backend/RosterEdgeMigration.gs`) returns everything in one response; `edgeRosterMigration` `import` (`roster-update/public/edge-roster.js` ~line 209) parses, packs and `importState`s it in one request.
- Hard save limit: `rosterOperationsCommit_` refuses above 16,000,000 characters; the file was 13.72 MB at 04:17 SGT and grew ~383 KB in 5 hours. Weeks of headroom at most.

## Design brief (proposal; implementer decides)
1. Backend export in pieces: `edgeExportManifest` (source digest, list of parts with ids, byte sizes and digests) and `edgeExportPart` (one part by id: settings/config, absences by month, assignments by month, audit by month, outbox, receipts, transport, inbox, intake, register). Each part well under 1 MB. Parts are taken from one snapshot (one lock) and staged (for example in CacheService or a temp Drive file keyed by the digest) so later part reads do not re-read the 13.7 MB file.
2. Worker import in steps: one request per part (or a small batch), each validated against the manifest digest and written to D1 via a resumable staging area; progress recorded so a retry resumes. No request holds the whole Roster.
3. Final step assembles the head (`imported`, source digest) only when every part's digest matches the manifest.
4. Keep: admin checks, exported model/archive identity checks (PR #2), activation's exact-digest check under the writer fence.

## Acceptance checks
- Import of a fixture at production size (about 14 MB) completes within Worker memory and CPU limits, measured in a test.
- A missing, duplicated or altered part is refused; a resumed import continues from the last committed part.
- Imported D1 state equals the single-shot import on small fixtures (existing `roster094-edge-roster.mjs` cases).
- Nothing switches users; heads remain `imported`.

## Handoff
Next: publish the verified branch for Claude's exact-head review, then the owner decides integration and release. Regenerate shared outputs when combining this work with allocation PR #7 and Claude's open Roster PRs. No further task is claimed by this handoff.

## Claim and serial handoff, 29 Oct 2026
Codex completed the first task and opened allocation PR #7 for Claude at `6744cf232848089af771ed085d97bffca8f6e146`; that branch is now handed off for review. This is the only next implementation claimed in this session, following the owner's explicit chat order. The later plan adds WhatsApp summary work, which is not included here. Claude retains PRs #2/#3/#5 and their fixes. Reuse PR #2's captured model/archive identity checks, and regenerate shared bundles when the PRs are integrated. Do not merge or deploy any branch as part of this claim.

The implementation will freeze one immutable export, serve bounded verified parts, stage rows and durable part receipts, and finalize both scopes only at imported. Status/resume must avoid full-state reads; accepted progress is not completed import. Existing activation fencing and Google authority remain unchanged. Local production-size Worker measurements and failure/replay tests are required before handoff; no real school snapshot or notification will be used for testing.

## Local implementation, 29 October 2026

Model: Codex. Implementer is the sole owner of canonical backend/shared/Worker changes and focused tests. The controller owns generated copies, runtime profiling, package/test dependencies, final suite and the GitHub handoff. No merge, deployment, authority change, real school snapshot or notification is included.

### Protocol and storage

- `edgeExportManifest` reserves the actor/request before capture, reads the coherent source under the script and notification locks once, retains captured immutable file identities, then releases locks before encoding/upload. `edgeExportPart` resolves Drive IDs and exact UTF-8 byte ranges from the backend-owned manifest; clients cannot choose a file or range. Parts and bounded headers require exact `206` Content-Range, length and SHA-256.
- `shared/roster-import.js` freezes records with the existing whole-state `GSiSEdgeStore.encode` codec. Natural-key counts and positions remain global. Each scope's head keeps its original stable packed-state digest convention. Both scopes' `metadata.source.sourceDigest` identify the same original Google snapshot.
- The browser retains request/session IDs and continues server-selected `operation: import` steps. One request binds a manifest, stages one part, refreshes trusted references or finalizes. A part acknowledgement means retained preparation progress; `imported: true` is returned only after the guarded final transaction commits both scopes.
- Separate session, scope reservation, expected-part/receipt and staged-row tables prevent cross-session mixing. Duplicate IDs fail, rather than disappearing under an UPSERT. Exact retries replay durable receipts. Final SQL copies staged rows using `INSERT SELECT`, guards both legacy revisions, checks every expected receipt and record count, then publishes both heads together at imported.
- Private baseline/audit/Stapler gzip references retain the existing paths, raw JSON digest and `gzip-json-v1` encoding. Backend gzip output is segmented; R2 stores verified segments and assembles the final object using a known-length stream. The Worker never decompresses or concatenates a complete large object.
- Every migration request checks current Contacts Admin authority before D1 initialization; slow manifest capture/upload and part/object work recheck it before binding the source, retaining a failure or writing the receipt. Existing final activation's exact Google source-digest fence and import-only route gate remain intact. No import step calls `edgeFence`.

### Recovery and bounds

Preparation's 10-minute lease exceeds the Apps Script 6-minute execution limit; an expired lease is only permission to inspect retained evidence. Recovery accepts exactly one deterministic-name container whose private folder, total length, bounded header, source identity and manifest digest verify. It never trusts the filename alone. Missing bytes or a failed capture/encode stay failed under the same request; an explicit restart releases only this session's reservations and requires a new request ID. Lost part/final responses replay durable D1 outcomes. Unknown R2 writes may leave harmless retained unreferenced objects.

Ordinary record target and raw compressed segments are 196,608 bytes. A record part can exceptionally reach 1,900,000 bytes, respecting the existing 1,750,000-byte value limit. A manifest has at most 2,048 parts and 524,288 bytes. Container payload is capped at 40 MiB plus its bounded header (under the 50 MB URL Fetch upload limit); an individual raw source object is capped at 32 MiB and remains subject to the total container bound. Oversize data fails before upload/transfer. Script Properties retain small session descriptors within the account's existing quotas; no destructive retention/garbage collection is introduced.

Status reads heads and bounded session metadata. Export downloads a bounded manifest/receipt evidence file, not a reconstructed whole-state JSON blob. The immutable Drive source, D1 staging and private R2 objects remain retained. An administrator can use `operation: export`, the original `importRequestId`/`sessionId` and a manifest `partId` to retrieve one verified source part. Restart preserves staged records and receipts before resetting only matching legacy/imported heads. Active/paused heads refuse preparation and restart. Historical single-shot imports without a retained chunked session require their prior backup and a separate deliberate recovery action; this implementation never falls back to an unbounded archival read.

### Verification recorded by the implementer

All commands use `TZ=Asia/Singapore`. Meaningful red results preceded implementation: missing freeze/staging/stream APIs; the old Worker calling `edgeExport`; the browser stopping after one preparation response; head digest parity failure; and a failed capture being silently retried. Current focused results:

| Command | Result / behavior |
| --- | --- |
| `node tests/roster099-chunked-import.cjs` | PASS: 14 MB+ aggregate freeze, global IDs, UTF-8 byte boundaries, duplicate rejection; exact baseline/audit/Stapler references and packed-digest parity |
| `node tests/roster099-export-snapshot.cjs` | PASS: one locked capture, upload after unlock, verified bounded ranges, actor/session/range binding, lost upload acknowledgement recovery, failed/missing source retained without recapture |
| `node tests/roster099-import-staging.cjs` | PASS: real SQLite receipts, concurrent exact replay, changed manifest/request rejection, duplicate-row rollback, lost part/final response, both-head transaction rollback and stale-register guards, active/paused refusal, retained restart |
| `node tests/roster099-import-objects.cjs` | PASS: multi-MiB incompressible object, only bounded segment reads, unchanged gzip reference, R2 failure without a completion receipt |
| `node tests/roster099-import-worker.mjs` | PASS: actual Worker continuation, one part/request, competing import refusal, Admin revocation during object I/O, bounded status/export/replay/restart, no fence or authority flags |
| `node tests/roster099a-edge-model-fetch.cjs` | PASS: compatible PR #2 captured model/archive identity and schema checks |
| `node tests/roster094-edge-roster.mjs` | PASS: existing operations and migration parity, new atomic failure/resume contract, source check before activation fence |
| `node tests/edge094-store.cjs` | PASS: existing real SQLite store contracts |
| `node tests/edge094-setup.cjs` | PASS: stable browser retry/continuation/session identity, truthful progress, denied access, evidence review, unchanged Deploy routing and generated mirror parity |

The final local workerd/Miniflare 4.20260730.0 run used real local D1 and R2 with 14,907,897 source bytes, an 8 MiB JSON object, 15,558,256 frozen bytes, 72 parts and 75 import requests. Largest Google response: 262,400 bytes. Sampled peak application-isolate memory: 55,459,509 bytes (about 52.9 MiB). Maximum sampled active CPU: 159.78 ms; maximum wall time: 170.479 ms. This fits the tested 30-second paid CPU budget assumption; the deployment account plan was not verified and the free 10 ms budget is not certified. The profiler excludes Node fixture generation and separate D1/R2 service isolates, and samples V8, embedder and backing storage rather than guaranteeing production RSS. [Tracked runtime evidence](../review/roster-d1-chunked-import-runtime.json) identifies the measured bundle by SHA-256 `103c1d56eef83884494574f3679d2a2acba659d2d139fa1c5e1d74c08adbbeb0`. Reproduce after building with `npm run test:roster-import-runtime` on Node 22 or newer (measured here on Node 24.22.1). Node mocks are not Cloudflare limit evidence, and local workerd is not live production verification.

### Final verification, 29 October 2026

- `TZ=Asia/Singapore npm run build`: PASS, including the 86-file Apps Script syntax gate and all generated production components. Generated output is locally prepared, not deployed.
- `TZ=Asia/Singapore ROSTER_TEST_CHROMIUM=/tmp/chromium npm test`: the process exited 1 and its retained log stopped after 475 selected programs. The remaining 392 were rerun using the unchanged `tests/run.cjs` selection, timeout and exclusions, with synchronous per-result logging. Combined verified outcome: **860/867 current programs passed; seven known baseline failures**. All six new import programs and all nine focused programs above pass. Historical comparisons excluded by the standard runner remain unrun.
- `TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py`: **38/38 programs passed**, run separately because the JavaScript runner exits nonzero.
- `TZ=Asia/Singapore GSIS_IMPORT_PROFILE_OUTPUT=docs/coordination/review/roster-d1-chunked-import-runtime.json npm run test:roster-import-runtime`: PASS on the final canonical/generated sources; measured results and limitations are recorded above.
- `git diff --check`: PASS. All 32 changed code, generated and dependency files retained their verified blob hashes through the final suite. The added Miniflare dependency is pinned; no existing dependency version changed.
- Internal Codex preflight reviewed the final corrections and reported no remaining concrete findings. This is not Claude's required model review.

The seven failures also reproduce on untouched allocation claim `77dbe38ac3243362493641869ffe1dcf82d2c8ae`; the accepted import claim `7b0d54bdb853e419ebc7ff7c98fc752d6ad9639f` differs from that code only in coordination documents:

| Programs | Existing failure |
| --- | --- |
| `package.cjs` | Historical Git object `50c977d79c9756dfdbee91f2922f0cd89ab6e903` is unavailable in the checkout. |
| `roster098o-preparation-package.cjs`, `roster098o-timetable-export.cjs` | Fixed capture-window fixtures have expired. |
| `roster0811-school-absences-browser.cjs`, `roster0811-school-absences-ui.cjs`, `roster090-school-absence-pagination.cjs`, `roster702-operations-ui.cjs` | Old intake-read counts; Claude's separately reviewed PR #3 addresses these tests. |

### Remaining gates / rollback

Claude must review the exact remote head recorded in the PR. No full-suite pass is claimed. Local Apps Script mocks establish the protocol, not deployment-account quotas, execution time, Drive access or source freshness. Those need administrator-only staging with synthetic data and a verified paid Worker CPU budget before a release. All actual authority/notification handover gates remain unchanged. Regenerate shared outputs when integrating allocation PR #7 and Claude's Roster branches; do not merge generated copies by choosing one branch wholesale.

Before activation, rollback stops this preparation path and preserves sessions, private containers, staged rows, receipts and R2 objects. It does not switch authority or reset shared Deploy/reference storage. A failed/incomplete session can be explicitly restarted; the old request cannot silently capture a new source. Never delete retained evidence, change `ROSTER_EDGE_AUTHORITY`, bypass the exact-digest fence, or infer an applied absence/publication/provider outcome from an import receipt.


Retained preparation is admitted up to **eight sessions** in both Google and D1. Google checks descriptor count under its script lock before capture; D1 checks session count in the reservation transaction. Existing identities can still resume at capacity. A ninth new request fails clearly and requires reviewed archival/cleanup; no uncertain evidence is automatically deleted. This bounds repeated restart/new-request storage growth while retaining recovery evidence. Focused tests cover the cap, existing-session resume and concurrent claims for the final slot.

Internal review corrections: finite session admission is now enforced before expensive capture/reserve, including concurrent last-slot claims. A new actual-Worker regression first failed when Admin was revoked during manifest generation; the adapter now revalidates Admin before manifest binding or durable preparation-failure mutation. Authorized recovery resumes the same reserved identity and frozen source.

Further internal review regressions now pass: ready-manifest and expired-upload recovery perform immutable Drive reads without the production writer lock; the short recovery commit compares the retained descriptor and cannot overwrite a concurrently verified ready outcome. Browser status adopts the current same-Admin session after another tab restarts, clears confirmed abandoned IDs, preserves different-actor ownership and accepts the backend's 8–160-character stable import IDs. New IDs clear stale paired session IDs. Status selects the currently reserved session even when creation timestamps tie.

## Owner resume, 29 Oct 2026 17:11 SGT

Model: Codex. Song Wee's latest direct instruction resumes and claims PR #8 for Codex, superseding the pause recorded in PR #8. Current main observed at 3fb3b780f6b26c2ee1f6fa26a1ed4dda3f7f8440. The existing implementation is retained; no restart from an old release or replacement task is needed.

Bounded remaining work: integrate current main into codex/roster-d1-chunked-import without force-push, retain the merged allocator/quiet-mode/identity fixes, inspect import failure and recovery paths, address concrete findings with focused checks, rebuild canonical generated outputs, rerun import and local-runtime checks, and update PR #8 for Claude's exact-head review. This does not claim Claude's WhatsApp summary task or edit its branch. This latest owner instruction authorises import work now; shared generated outputs will be rebuilt from the integrated canonical source and checked again against main before handoff. No deployment, real school import, provider send or ROSTER_EDGE_AUTHORITY change.

## Resumed integration and verification, 29 Oct 2026
Model: Codex. Original head 55c266b was integrated with accepted resume claim/main 02a573e without rewriting or discarding the original branch. The remote integration commit has both as parents; exact review head is in PR #8. Only the changelog, chunked route and adapted captured-model test needed content reconciliation. Chunked source/part retrieval remains backend-bound, while current main's identity validations, allocator and quiet mode are retained. The latter two conflicted files retain the already-tested PR #8 implementation; no new import behavior was invented to resolve the merge.

Canonical source was rebuilt with npm run build, including the Apps Script syntax gate. All nine focused import/store/setup/identity programs passed on the combined source. Internal parallel code inspection found no concrete remaining import defect; it is not a substitute for Claude's review. Google remains authoritative and no authority setting was changed. Claude's chosen WhatsApp PR #10 is separate and not merged into this import branch.

Fresh real local workerd/Miniflare 4.20260730.0, D1 and R2 profiling passed: 14,907,897-byte synthetic source, 15,558,228 frozen bytes, 72 parts, 75 requests, maximum bridge response 262,400 bytes. Sampled peak application isolate memory 51,653,638 bytes; maximum sampled active CPU 152.175 ms; maximum wall time 194.697 ms. The updated runtime evidence identifies its generated harness bundle by SHA-256 9effccab940897d6f8bb63d7758bf7d86e38157a3524d5db7d736433bcc032da. These local samples do not certify the free 10 ms CPU plan, live Apps Script/Drive timing or production RSS.

The complete unchanged tests/run.cjs selection was partitioned across three isolated source clones, retaining the runner's exclusions and 45-second per-program timeout. Selections were checked for no overlaps or omissions: 872 programs. Initial shard results were 282/291, 283/291 and 288/290. Two package/bundle programs initially lacked the ignored build archive in their isolated clone; both passed after supplying the just-built matching archive. Final combined result: 855/872, with 17 failures retained. LORD separately passed 38/38. See roster-d1-chunked-import-resume-tests.json for every program outcome. No clean full-suite pass is claimed.

Remaining failure classification on integrated main:
1. Ten notification harness programs strip imports but do not define the merged quiet-mode readQuietMode helper: paid097-jobs-worker.cjs, roster081-notification-lanes.cjs, roster082-audit-worker-lane.cjs, roster086-delivery-review-worker.mjs, roster087-notification-worker.mjs, roster089-worker-calendar-lane.mjs, roster089-worker-durability.mjs, roster093b-notification-lanes.cjs, roster096-cleanup-lane.cjs, roster710-worker-reports.mjs. Their production notification entrypoint is byte-identical to current main, and the failure is ReferenceError in the stripped-import fixture. PR #10 separately fixes one of these harnesses; that unmerged fix is not silently included here.
2. Four old UI fixtures treat the new Quiet mode status read as a write or omit the toolbar button: release082-orphan-manual-ui.cjs, roster711-workspace-ui.cjs, roster711-workspace-browser.cjs, roster719-relief-tools-browser.cjs. Focused reruns reproduce these failures. The production UI is byte-identical to current main; this import change does not edit it.
3. package.cjs still lacks historical Q commit 50c977d; roster098o-preparation-package.cjs and roster098o-timetable-export.cjs retain the expired 28 Oct capture-window fixture failures.

The relevant current-main notification/UI/shared-domain file hashes were checked when reconciling the source. These are inherited integration test gaps; they are reported, not removed or counted as passes. No changes to those unrelated fixtures are bundled into this import PR. Current quiet-mode state/route/UI and idle-lane focused tests also pass; Codex's separate exact-head review of e0e6066 reports the remaining replay-provenance issue, which this import PR does not claim to fix.

Not run: excluded historical comparison branches, administrator staging, real school import, live delivery or production deployment. Rollback remains preparation-only and retains all immutable source containers, D1 sessions/receipts/staging and R2 objects. Owner chooses merge/release after Claude reviews the updated exact head. No other task or branch is claimed by this handoff.

## Post-PR #10 integration, 29 October 2026

Model: Codex. Song Wee explicitly wants #8 tonight, superseding the earlier defer recommendation. GitHub confirms #10 merged at 1708c3d7c8a798993fc1d39a131097993873ae5e on 29 Oct 2026 at 18:11:26 SGT, with reviewed head 94fd01576b6f631e32769ce3a52939244410f54f as its second parent. Existing #8 head was still 86c94443f7bf59c67de344679bd7db73e3a31580 and ownership remained Codex. Claude’s advisory review at that old head found no blocker; the new head needs review again.

Integrating actual main 1708c3d with a normal two-parent merge. Canonical sources merge cleanly; four generated Worker bundles conflict and will be regenerated through npm run build. The separate open #11 quiet-mode follow-up is not taken over. Existing allocator, quiet mode, immutable import identities, source/staging/receipts and uncertainty stay intact. No authority switch, live import, provider send, merge to main or deployment is authorized. Validation results will follow here before handoff.

### Post-#10 verification and handoff

All nine owner-specified programs ran with TZ=Asia/Singapore and exited 0; exact commands/results are retained in ../review/roster-d1-chunked-import-post10-tests.json. npm run build passed, including the 85-file Apps Script syntax gate. Generated-runtime verification rebuilt and compared all 18 components using verify-099-suite.py verify_runtime and installation_files against current sources: PASS. Two initial parity invocations used the wrong archive path/format; the final invocation used the packager’s canonical installation mapping and completed successfully. git diff --check and the staged check passed. The inherited roster099a-whatsapp-short-summary.cjs passed 6/6, including actual payload, countdown field 3/summary field 4, enqueue/dispatch and promoted urgent reminder paths.

No unnecessary full-suite or runtime-profile rerun was performed. Prior full-suite and performance figures above remain historical evidence at their stated source/head; they are not current-head results. PR #10 includes notification harness/UI fixture fixes; no updated broad-suite total is claimed. The separate #5 quiet-mode replay finding and #11 follow-up remain outside this task.

Handoff: Claude reviews the new full exact head posted on PR #8. The owner decides merge and deployment. Immutable Drive containers (up to eight retained), D1 staging and receipts remain recovery evidence; do not delete them mid-import. Staging/storage and production finalize limits from Claude’s old-head review remain release gates. No live school import, provider send, deployment or ROSTER_EDGE_AUTHORITY change occurred.

## Final integration after both required merges, 29 October 2026

Model: Codex. Latest owner instruction requires BOTH #10 and #11 merged before updating #8. Verified GitHub: #10 merged at 1708c3d7c8a798993fc1d39a131097993873ae5e; #11 merged at 699749fbabd4cbd0248b2655e3ff990e68b6c499 on 29 Oct at 18:49:02 SGT, with reviewed head a4aa2abe4134c9115898273d4aa74dbd4f8af779. Current main is 699749f. GitHub #8 remained at 86c94443f7bf59c67de344679bd7db73e3a31580; the earlier local post-#10 integration was never published. The unpublished local checkpoint is retained locally. The final remote update is a normal merge with the existing remote head and actual main as parents. No force-push or actor’s branch replacement.

Canonical source merged cleanly. Four conflicting generated Worker outputs were rebuilt using npm run build. All nine requested import programs PASS again with TZ=Asia/Singapore. Additional inherited WhatsApp summary (6 cases), quiet-mode state and quiet-mode route programs PASS. Generated runtime parity rebuilt and compared all 18 production components. Canonical gateway, quiet-mode module, summary domain, notification entrypoint and allocator hashes match actual main. git diff --check passes. Commands/results: ../review/roster-d1-chunked-import-post11-tests.json. No full-suite or runtime-profile rerun; prior results above remain historical.

The earlier #5 replay finding is now addressed by merged #11; it was not repaired by import code. Import source/staging/recovery identities, immutable containers, receipts, provider uncertainty and protected manual/peer work remain preserved. No real school data import, deployment, provider message or authority change. Google remains authoritative. Claude must review the new exact full head recorded in PR #8; owner chooses merge/release. Rollback and storage/production finalize gates remain as stated above.
