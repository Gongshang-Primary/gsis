# GSiS v0.5.01 performance notes

Contacts compact fitting runs once per result render on the reused table, measures controls using the final font, and leaves row text to the browser's intrinsic table layout. It does not resize through a feedback loop or trigger backend writes. Existing table viewport scheduling coalesces frame updates. Font readiness and breakpoint changes keep the normal viewport refresh behavior.

Layout reads its owned head and bounded JSON chunk ranges. It serves the verified local revision independently of Deploy/source availability. All three Layout pages share one fetched snapshot and use local filtering/search. Publication copies are outside normal draft saves. Failed native projection writes do not advance the public head; immutable history supports repair and retry.

The initial source seed contains 143 venues, 40 classes, 59 TGs, 99 allocations and 394 pupil breakdown rows. Those figures describe the authorized 2026 import, not the currently published 2027 Deploy document. No live school-network latency, Google cold-start duration or hardware performance claim is made.

The v0.5.0 scoped-save, receipt, authorization and batching behavior remains. Installation should measure actual cold/steady loads and publication handoffs with the existing backend phase logs.
