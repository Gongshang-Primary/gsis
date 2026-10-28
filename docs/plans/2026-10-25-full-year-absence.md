# Full-school-year Report Absence

User requirement: remove the 62-day Report Absence restriction and permit a full school year. Preserve existing short cross-year ranges and multi-teacher submissions.

Implementation boundary: use an absence-specific inclusive range of up to 366 dates. Other operations keep their existing bounds. Calendar remains authoritative for the dates/years covered; do not infer holidays or teaching coverage from the client clock. Keep the existing batched Calendar transport and atomic operation commit. Do not split a request into partially saved absences.

- [x] Trace shared, UI, Worker and backend range limits and the 300 teacher-date record admission cap.
- [x] Add absence-specific bounds and update the actual preview/create/readback paths.
- [x] Admit long multi-teacher requests within the existing document-size guard; verify before durable writes.
- [x] Preserve exact-request retry, source checks and instructional edit behaviour.
- [x] Keep long-range feedback compact and instruction rendering limited to the selected teacher/date.
- [x] Verify leap-year boundaries, cross-year compatibility, over-limit rejection, long-range UI, Calendar batch count, multi-teacher commit/failure/retry and unrelated operations.
- [x] Independent review, sync generated copies, release checks, component archive, commit and tag v0.9.1c.

Venues requirements are documented separately in the reviewed product design. No Venues runtime is included in this Roster patch. The separate product backlog remains outside Git.

Final evidence: 363 related programs passed; 141 Apps Script sources parsed. The 732-record leap-year fixture commits once, preserves replay/conflict semantics, and uses six bounded Calendar batches. Chromium covers a non-school first day, dated instructions and explicit skipped-record feedback. The source design and deployment artifact remain distinct.
