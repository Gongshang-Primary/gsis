# v0.7.19 performance evidence

Baseline: tagged v0.7.018e at `30558e7`, carrying the complete v0.7.18 suite. These measurements count work in controlled local adapters. They do not measure the school's deployed Apps Script, Contacts, Drive or Cloudflare response times.

| Path | Before | v0.7.19 | Retained boundary |
| --- | --- | --- | --- |
| Compact absence verification on a confirmed suspended day, 150-teacher fixture | 150 teacher rows hydrated | 1 selected teacher row hydrated | Same canonical suspended lesson, date, baseline and plan revision |
| Unrelated same-week suspended plans when no applicable workload cap needs them | Weekly cap accounting can unpack unrelated plans | Unrelated plan stays unopened | Cap accounting still runs when required |
| Roster module configuration per execution | 12 property reads through 3 PropertiesService handles | 4 property reads through 1 handle | Validate all configured folders; no persistent authority cache |
| Ordinary unpublished draft cover removal | Full quota/reconciliation/allocation response path | Atomic command and durable receipt, followed by a separate budget read | Current revision, timetable/plan source, permission, clock and demand source guards |

## Relief edit acknowledgement

The focused adapter for an ordinary draft Clear assignment or No relief required edit counts one state read, one register read, one baseline-model load and one durable commit. The write path performs no quota, reconciliation, history capture, health or manual-candidate model construction. A separate authoritative candidate refresh performs the required quota and allocation work after acknowledgement. Total budget work has not disappeared; it no longer delays the saved result or holds up the write response.

The browser applies the accepted cell patch and shows the save result, then refreshes workload and candidates. Users can inspect other periods during that refresh. Assignment mutations wait for current budgets. A failed refresh retries only the read, and a delayed response must not overwrite a newer date, page or selection. An uncertain mutation retains the original request ID and payload; exact replay causes no second write.

Published, replacement, corrected, combined or otherwise special cover retains the full authoritative pipeline. Dates with an active recorded low-capacity warning episode also retain that pipeline so capacity recovery is recorded before a later shortage can trigger a new alert. This release does not invent a second store, bypass notifications or locally estimate annual/weekly relief usage. The persisted operation remains one whole-document commit; logical batching is not partial Drive I/O.

## Stapler dates and import

The date-list path already performs a narrow metadata read: one current operations-document read and one register read. It does not load the timetable model, compute quotas, unpack every plan or query Calendar. The release removes repeated module configuration reads on that path while preserving fresh Contacts authority and fresh list metadata. It does not claim to eliminate remote service latency.

Import name resolution now uses the complete eligible Contacts pool and no longer requires a recurring baseline row. Local search and mapping use loaded data. Contact creation and permitted approval retain their existing server workflow; this change is not a new asynchronous contact store.

## Measurement limits

The release's `719-*` verification reports and `VALIDATION.md` identify the exact checks completed. Fixture work counts are separate from production timing and simultaneous multi-user throughput. Shared store serialization, fresh authority checks and required remote services remain real limits.

After installation, compare first and returning loads, suspended-day absence readiness, Stapler date listing, and clear/no-relief acknowledgement plus subsequent candidate refresh. Match errors by timestamp, backend version and request reference. The retained 21 October Revision 1 plan and uncertain baseline save remain live readback checks; a locally passing fixture does not close those incidents.
