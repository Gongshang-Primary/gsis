# v0.8.1 build scope

Full suite based on v0.8.00a; user-authorised commit for items 050, 051 and 052. Preserve all prior features and data contracts except the compatible scoped concurrency additions.

| Item | Scope |
| --- | --- |
| 049 | Carry forward the immediate No relief instructions save shortcut. |
| 050 | Day-specific publish/notify/allocation checks, date-owned pending requests, short final commit critical sections, independent notification scheduling and truthful conflict messages. |
| 051 | Compact inline absent names without periods, explicitly selected by the user; exact bullet template remains queued. |
| 052 | API latency review, fewer Calendar round trips, bounded service batch, reuse existing projections/local rendering and assess compression rather than add an unmeasured protocol. |

Changed deployment components: Calendar Apps Script backend; Deploy Apps Script backend (which owns Roster state); Roster Cloudflare Pages; separate notification Worker. Other component version labels are normalized in the full package, with no intended feature changes there.

Not included: live deployment, data reset, policy bypass, live WhatsApp testing, template submission, external database migration or speculative broad cache of authority data. Production latency needs a deployed measurement.
