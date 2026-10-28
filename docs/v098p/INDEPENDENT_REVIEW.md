# Revision P independent integration review

Reviewed on 28 October 2026 against O commit `edcb6b4c4d43b2d2af7eaa4f2d4f220e2adb7cfc` and the P working tree. Scope: export contract, Calendar recovery and pacing, production authority boundaries, installation guidance, and suite/source verification. The reviewer made no runtime edits, live calls, deployments, source migrations or provider submissions.

**Result:** no material open finding in the reviewed P implementation after the corrections below. Proceed with the final generated-artifact, full-suite and archive verification. This review does not certify a live deployment or timetable authority handover.

## Export and diagnostic boundary

The browser removes only top-level transport `timing` before constructing the downloaded file. The native timetable strings and every other field remain unchanged. Unsupported fields still reach the strict importer and are refused. This also keeps nested transport diagnostics about Contacts out of the private timetable bundle without removing normal backend diagnostics.

The contract test traverses the native export handler, the actual production `out_` serializer, the actual export page JavaScript in JSDOM, and the unchanged preparation Worker validators. It compares all exported objects to their pre-serializer values, including native text containing the word `timing`. This directly tests the operator-reported O defect; it is more than a handwritten response fixture. Authentication and dispatch routing are separately checked by retained routing tests; this test alone does not execute a deployed Google web app.

The diagnostic build helper derives its label from the compiled backend version. It is present in the combined source used by Deploy and Roster. No operation-routing or authorization side effect was found. The preparation Worker, manifest protocol, schema and exact native hashes retain O compatibility; P does not force a data upgrade or a preparation redeployment.

## Calendar recovery and pacing

Healthy sync keeps the five-record batch bound and provider-write spacing while reducing its deliberate between-batch delay to one second. Wipe pacing and genuine source/provider cooldowns remain separate. The retained quota, cold-start, concurrent-edit, unknown-save and year-publication tests pass.

Large checkpoints use bounded gzip/base64 properties. New chunks are written and verified before replacing the head. Failed staging retains the previous head; missing, corrupt or unknown checkpoint formats fail closed. Capacity is reserved before provider dispatch. Pruning is restricted to unreachable keys in the exact checkpoint namespace.

The bounded settlement journal persists provider outcomes before acknowledging source rows. Interrupted source or final-checkpoint writes therefore settle the saved outcomes without dispatching them again. Recovery rechecks year-publication fences and respects source-read cooldowns. Finalization saves stable detail and summary identities before clearing its checkpoint; retries verify the existing records.

The independent probe exercised 405 actual mocked provider outcomes, comprising 400 validation failures and five creates. It interrupted the first committed final-detail acknowledgement, started a cold execution, and recovered all 400 unique failures with matching content digest, one summary, one completion audit and no additional provider call. Every dispatched batch retained the five-record bound. A separate post-source-acknowledgement checkpoint failure recovered six total creates without replay or count drift. Escaped Unicode history reconstructed exact bytes and remained below the cell limit.

These tests use synthetic Google services. Their elapsed values do not include network, Apps Script startup, real Sheet service or lock latency. The existing source reads remain substantial; this release does not promise a live school-year completion time.

## Authority and incoming absences

The canonical preparation Worker, native exporter protocol, Roster recovery profile, absence transport, Operations entrypoint and notification entrypoint have no O-to-P functional diff. Generated component versions are harmonised separately.

Roster's existing Pages Worker still authenticates and forwards operations to the Google backend. Where configured, D1 transport receipts retain the received report until forwarding. Received remains distinct from applied. The Roster recovery profile disables historical full-D1 delegation and its migration route; it does not clear persisted Google fences. Deploy preserves its own existing configured authority. The broader Operations Worker is supplied for existing installations and is not activated by packaging.

No new frontend binding is required for incoming absences. The preparation service has no absence-saving endpoint. `TIMETABLE_HANDOVER_STATUS.md` separates the operator's successful O import/readback from unproven dated parity, current staff mapping, current source freshness, scoped access and all-writer ownership. Those remain prerequisites for a later production adapter and cutover.

## Review findings addressed

| Finding | Resolution checked |
| --- | --- |
| Global archive authority wording could imply Deploy is forcibly Google. | Metadata and guides distinguish Google Roster/Calendar, unchanged configured Deploy, and shadow-only preparation. |
| Main guide paths did not match archive layout. | Handover references use `Docs/`; optional Calendar setup uses the actual flat schema/configuration/guide filenames. |
| Source verifier could accept a rehashed incomplete manifest. | Trusted-checkout verification compares the full included-plus-omitted inventory with Git and checks omitted hashes/sizes. Recovered non-Git verification explicitly reports its limited manifest-only assurance. Eight packaging tests pass, including the deletion case. |
| Calendar completion and source acknowledgement could outlive their checkpoint acknowledgement. | Stable completion identities and persisted bounded settlement retain failures, avoid provider replay and retain source cooldown/year fences. Independent and consultant fault probes pass. |
| Unknown checkpoint schemas could be treated as legacy JSON. | Explicit unknown schemas and malformed legacy states are refused. |
| Older Calendar test harness lacked the newly used Blob/gzip/base64 APIs. | The shared harness now implements real Node zlib and byte semantics; retained cooldown and concurrency regressions pass. |
| Generic rollback instructions could downgrade over an active P chunked session. | Main setup explicitly requires finishing or preserving/reconciling that P run before pre-P rollback. No instruction to clear the checkpoint is given. |

## Commands independently run

All Node commands below used `TZ=Asia/Singapore`. The final Calendar probes ran against the frozen runtime. The test evidence is local and synthetic.

| Command | Result |
| --- | --- |
| `node tests/roster098p-export-contract.cjs` | 4/4 |
| `node tests/roster098o-preparation-routing.cjs` | 2/2 |
| `node tests/roster098-recovery-worker.mjs` | 8/8 |
| `node tests/paid097-backend-gateway.mjs` | Pass; existing Node module-type warning |
| `node tests/paid097-jobs-worker.cjs` | Pass |
| `node tests/release098p-metadata.cjs` | Pass |
| `python3 tests/release098p-packaging.py` | 8/8 |
| `node tests/calendar098p-throughput-checkpoints.cjs` | 11/11 |
| `node tests/calendar093-provider-cooldown.cjs` | 13/13 after shared-harness correction |
| `node tests/calendar089-sync-concurrency.cjs` | 9/9 |
| `node tests/calendar098o-sync-isolation.cjs` | 9/9 |
| `node verification/v098p/calendar-independent-review.cjs` | 3/3 |
| Four `verification/v098p/review/checkpoint-*.cjs` consultant probes | 4/4 |
| `git diff --check` | Pass |

The separate `VALIDATION.md` records the release owner's full-suite, generated-artifact and archive checks. A mistyped attempt to run a nonexistent `calendar097-concurrency.cjs` was corrected to the existing `calendar089-sync-concurrency.cjs`; it was not a product failure.

Calendar source reviewed: SHA-256 `d90cfc109a8b15780482dc7fe3358a8e119bf1f9073c13e3a3ef09db1029b9d9` for `calendar-backend/Code.gs` at review. Raw independent probe results accompany the review package under `Validation/`.

## Remaining operational limits

- The O live report proves the recorded import/readback after its manual export workaround. Local P tests prove the corrected contract; they do not prove P is installed or that a new live import completed.
- Two existing uncertain Calendar source-save receipts are not resolved or deleted by this release. Per-event isolation and year-level protection remain enforced.
- An active P chunked Calendar checkpoint must be completed or reconciled before restoring pre-P code. Storage remains deliberately bounded and can pause for administrator attention before another dispatch.
- Optional Calendar background continuation is not enabled by packaging. Without an already configured continuation owner, the browser must continue the saved run.
- Archive hashes establish consistency with their trusted comparison source, not publisher identity. Source-history pruning applies to delivery artifacts, not school records or production storage.
- Production timetable reads, writer ownership, relief-ledger migration, live provider delivery and school-scale latency are outside this release's proof.

## Addendum: regenerated frontend ZIP comparison

Final clean-room recovery exposed different ZIP timestamps despite identical installed files. The verifier now permits ZIP container metadata to differ only when the comparison source is a recovered non-Git tree. It still requires the complete same entry inventory and identical bytes for every entry, rejects duplicate/unsafe entries and checks CRC. Trusted Git comparison remains byte-exact, as do non-ZIP components in both modes.

The suite/review archive manifests still hash the exact archive contents; the companion review archive hash, source inventory/content checks, and all eighteen canonical runtime comparisons are unchanged. The non-Git completeness limit remains explicit. This correction does not make a recovered manifest equivalent to a trusted Git inventory.

Independently reran `python3 tests/release098p-packaging.py`: 9/9 pass. `python3 verification/v098p/zip-recovery-independent-review.py` also passed against the real 48-entry Contacts frontend: reordered/retimestamped equivalent entries pass only recovered mode; changed, missing or extra content and a changed backend are refused. Substituting even a metadata-only changed inner ZIP without changing the outer manifest is refused. Evidence is retained under `Validation/zip-recovery-independent-review.*`. No runtime change or new material finding arose from this verifier correction. Final regenerated archive checks remain recorded by the release owner.
