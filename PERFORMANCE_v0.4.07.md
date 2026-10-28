# v0.4.07 performance and write scope

- Workload figures recalculate from the loaded version in memory. No per-teacher, per-subject or per-cell API reads.
- Workload settings, TG renames/remaps and scope changes use the existing field diff, durable journal, compact read projection and exact save receipt. Unrelated version records are not replaced.
- Contact creation validates the projected directory, then writes only the new contact row and required journal/identity metadata. Existing edited rows use dirty-cell runs. Derived values affected by that contact are written together.
- Routine writes remain single-attempt with explicit receipt recovery; this release does not add automatic write replay.
- Class-layout reflow is in the browser and never changes real geometry or deployment assignments.

Local tests verify write scope, retries and failure recovery. They do not measure Google Apps Script/Sheets latency. No new live service timing or speed claim is made.
