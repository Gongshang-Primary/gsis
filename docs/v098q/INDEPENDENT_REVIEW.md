# Independent review — Calendar 0.9.8q

Reviewed against P commit `a8ce50ef47afe5a57270d440c2cd18b34121c59a` on 28 October 2026. This review used source inspection and local synthetic fault tests. It performed no live operations, deployment, provider sends, source-data changes or migration.

No unresolved blocking finding remains in the reviewed Calendar runtime changes. Final archive creation and release verification remain the release owner's responsibility. The completed broad run and its 13 inherited limitations are classified separately in `FULL_SUITE_FAILURE_CLASSIFICATION.md`; this runtime review does not imply an all-green full suite.

## Root cause and scope

The supplied run recorded a batch lasting approximately 49 seconds. P's browser request deadline was 45 seconds, so a successful server batch could finish after its browser stopped waiting. The 30 upgrade errors in the retained run are historical outcomes; they do not establish that the currently inspected workbook headers are invalid. Q appropriately addresses the transport boundary and avoidable native Sheets overhead without changing production authority or storage infrastructure.

The new 90-second deadline applies only to sync start and batch requests. A lost batch response leads to bounded, authenticated status reads for the same run, year and target. Completion can be recovered from the exact deterministic audit receipt after its active checkpoint has been cleared. No recovery branch starts a fresh run or silently retries historical failed IDs.

## Findings addressed during review

| Finding | Resolution verified |
| --- | --- |
| Truncated HTTP 200 JSON after a committed batch bypassed recovery. | Classified as an unreadable response and reconciled through the same-run status endpoint. Authentication failures remain stopping conditions. |
| Chunked completion history could report zero errors if its compact error count was missing while blocked records remained. | Backend requires explicit error totals and consistent history references; corrupted evidence fails closed. |
| Malformed successful status envelopes could appear to show clean completion. | Frontend validates identity, boolean completion, nonnegative counters and the completed success condition before using the response. |
| Repeated uncertain batches, or repeated claimed batches followed by unchanged ready status, could restart the recovery allowance. | Both paths share a three-episode no-progress bound. Confirmed progress resets the allowance. |
| Local Stop waiting could outlive a newer operation or interrupt the stateful final refresh. | Late transport responses cannot own or release a later operation. After confirmed completion, Stop waiting is hidden before the bounded final refresh installs shared page state. |

## Verification independently rerun

| Check | Result |
| --- | --- |
| Q browser transport and recovery tests | 17 passed |
| Q status and native-cost tests | 11 passed |
| Independent adversarial status probes | 22 passed |
| Independent seeded projection-parity cases | 250 passed |
| P throughput/checkpoint fault tests | 11 passed |
| O sync isolation tests | 9 passed |
| L native storage tests | 9 passed |
| Existing O sync outcome, quota/cooldown and pre-session source-retry UI scripts | Passed |
| `git diff --check` | Passed |

The browser tests use an AbortSignal-aware fake transport and elapsed fake time. They exercise the actual 49-second failure boundary, response loss, compact historical errors, prolonged claims, cooldowns, revoked access, missing or mismatched status, local stop and delayed final refresh. They do not establish live Google performance.

The independent status probes cover exact active and completed identity, a completed old run while another run is active, malformed audit fields, missing counts, duplicate evidence, fresh administrator revocation, lock contention, archived years and unresolved year-wide publication. Status remains read-only; subsequent batches still enforce year and publication fences before provider access.

The independent projection probe compares Q with the exact retained P backend for unsorted and duplicate fields, empty projections, sparse rows and blank rows. It also checks that no unrequested columns are read. The retained P backend SHA-256 matches the baseline commit's canonical backend.

## Performance evidence and preserved boundaries

In the same synthetic 1,295-row fixture:

| Five-event batch | Native reads, P → Q | Flushes, P → Q | Locks, P → Q |
| --- | --- | --- | --- |
| Creates | 83 → 77 | 43 → 23 | 32 → 32 |
| Updates | 69 → 63 | 23 → 3 | 22 → 22 |

Read-cell counts, source writes and provider-call counts were unchanged. The modeled service-time reduction is 5.5 seconds per fixture batch; this is not a measured production speed claim.

Every changed coordination callback was inspected. Only audited Sheet-read/Properties-only callbacks omit flushing. Fresh role checks, lock acquisition, cache reset, source fences, provider leases and stable provider identities remain. Source settlement, receipts, links and history writes retain the normal flush. Pending settlement and finalisation can resume without waiting unnecessarily for a claim lease, while cooldown and publication fences still apply.

## Package review and limits

The deployment patch contains only Calendar frontend and backend artifacts. The source review retains canonical source and test dependencies, with hashes and omission accounting. Five Q packaging regressions passed. Eight identified historical live-observation JSON files are excluded from the review archive. The one dependent LORD contract test now uses an explicitly synthetic fixture; its eight checks passed independently. Older reference fixtures remain, so this review does not claim that the archive contains no historical reference evidence.

The final packager requires clean, tagged source. Following review, the standalone verifier also checks a clean trusted checkout, the exact Q release tag and the P-to-Q patch bytes for a committed archive. These checks supplement canonical artifact and archive-inventory verification.

Live validation is still required after deployment: resume the retained run, observe genuine progress and completion, then explicitly start another sync if historical failed rows should be retried. The one unresolved source-write receipt must remain blocked until its exact outcome is resolved. Stop waiting only releases the local waiting flow; already submitted work may finish.

Independent probe files and results are under `verification/v098q/review/` and `verification/v098q/review-status/`. No production repair or deployment is implied by the local results.
