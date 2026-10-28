# v0.8.0 performance evidence

Baseline: v0.7.19 at `2a0fffc`. These results describe controlled local work counts and response behavior. They do not measure the school's deployed Contacts, Apps Script, Drive or Cloudflare latency.

| Path | Previous behavior | v0.8.0 work or presentation change | Retained boundary |
| --- | --- | --- | --- |
| Stapler dates Contacts response, synthetic 181-person directory | About 43,085 bytes | 837 bytes for caller and two eligible sponsors, including safe diagnostics | Fresh directory/authority/coherence and duplicate checks |
| Roster date-list preparation | General directory normalization and unrelated duty/name-bridge work | Early metadata-only context | Current register, permissions and leases |
| Date-list history/request lookup | Repeated per-date scans | Request-local metadata indexes | Equivalent visibility and lifecycle semantics; no separate authoritative store |
| Return to Stapler | Blank initial list while loading | Last verified same-session list shown provisionally during refresh | New writes disabled until verified; immutable retry remains available |
| Main Timetable | Baseline-only screen with misleading Calendar-unavailable state on a skipped lookup | Immediate baseline plus inline published-day check; complete published schedule can load without Calendar | Confirmed/private drafts remain private; current authority and source checks |
| Routine relief editing | Each edit waits behind blocking save presentation | Immediate local update, bounded background batches and one immutable in-flight request | Full server validation and one atomic commit per batch |

## What is measured

`stapler080-dates-contacts.cjs` exercises the actual signed Contacts and Roster handlers with a synthetic directory. The payload sizes include safe timing/view diagnostics; tiny differences in timing serialization can change the full response by one byte. The narrow response does not avoid the fresh canonical Contacts read and validation. Existing one-batch directory access, Calendar skip, compressed-plan retention and one lease snapshot are retained improvements, not new savings claimed by this release.

Independent date-projection review compared 500 seeded metadata states with v0.7.19 and found matching output. That is semantic evidence for the request-local indexes, not a throughput measurement.

`timetableDay` has an early read path that avoids quota calculation, reconciliation and the full allocation context. It reads the complete public saved schedule and current period/source metadata. Later refreshes retain the last verified same-date view and selection while checking; a first-load failure keeps the baseline and a later refresh failure keeps that previous dated view, each with an explicit Retry state. A no-plan result still needs Calendar for the baseline date view; a published suspended day does not infer school-date validity from its mere existence. Actual Calendar calls now record elapsed time and safe failure classifications instead of reporting a zero-duration skipped lookup as unavailable.

## Batch behavior and visible feedback

The editor sends queued commands after 300 ms idle, with a 1,500 ms maximum waiting interval when no batch is already in flight. One request carries at most 100 ordered commands; later edits wait in a separate queue. Local cells update immediately, but Saved appears only after a server acknowledgement. Network latency still affects acknowledgement time.

The server uses one lock, fresh state and one durable whole-document commit for the complete batch. It does not run independent parallel writes per cell. A rejected command leaves the whole batch unapplied. Exact replay returns the retained receipt without duplicating the commit. After acknowledgement, newer commands remain queued and are checked against current state. Conflicts and uncertain responses remain visible.

The UI's session recovery and inline spinner reduce disruption; they do not make the browser authoritative. Pending-state checks before Publish, export or leaving the page protect work that has not yet been acknowledged. Published changes remain staged until republish, so background saving does not send publication notices.

## Measurement limits

`VALIDATION.md` and the `80-*` verification records identify the exact integrated checks completed. No median, tail-latency or simultaneous-user claim is made. Fresh authorization, remote service calls, quota work where required, a shared operations document and the serialized commit remain real costs. No storage migration or speculative parallel Drive fetch was added.

After installation, compare first open, return and explicit refresh separately for Stapler dates. Measure main Timetable baseline visibility and completed published-day check separately. For Assign Relief, distinguish immediate cell feedback, durable batch acknowledgement and current candidate refresh. Retain diagnostic references and timestamps for slow/error cases. The saved 21 October Revision 1 draft and uncertain baseline save still require authoritative installed readback.
