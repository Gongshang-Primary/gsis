# v0.7.16 performance evidence

This release removes repeated suspended-plan structural validation and shortens the common own-absence reporting path. The stable evidence is validation work, user actions and request counts. Timings below are local measurements with synthetic services. They are not Google, Cloudflare or school production timings.

## Own absence reporting

The comparison runs the actual Roster shell and report UI against the same synthetic authenticated API, with 80 ms added to every API call. It compares v0.7.15 at commit `3b5bc82` with the v0.7.16 absence change. Each version/session combination has three runs. The common case uses the default reason, Today, Full day and no relief instructions.

| Measure | v0.7.15 | v0.7.16 |
| --- | ---: | ---: |
| User actions after sign-in | 3 | 1 |
| Requests in a cold sign-in flow | 8 | 6 |
| Requests with an existing session | 7 | 5 |
| Cold sign-in to usable form, median | 559 ms | 479 ms |
| Existing session to usable form, median | 370 ms | 355 ms |
| Cold sign-in to confirmed save, median | 857 ms | 735 ms |
| Existing session to confirmed save, median | 585 ms | 541 ms |

The old actions are Open Report Absence, Select All and No relief instructions needed. The new direct `#reportAbsence` route preserves the destination through authentication, selects Full day and requires one Submit absence action. Choosing Tomorrow, Both, another reason or Partial day adds the corresponding deliberate selection. Google sign-in itself is simulated; these figures do not measure provider login time or the user's typing time.

The two removed requests are an unrelated whole-baseline read and a post-save colleague-candidate preload. A compact report read, current profile/authority checks and the real save remain. Colleague data loads when the optional arrangements workflow needs it. Existing report preloads still serve ordinary Home entry.

The three-run medians are descriptive, not a release speed threshold. Individual runs varied substantially on the shared host. The action and request reductions are repeatable assertions; the wall-time differences do not establish a production latency gain. Source and individual runs: `tests/roster716-absence-fast-browser.cjs` and `verification/716-absence-fast-comparison.json`.

## Suspended timetable validation

The backend now persists structural validation bound to the saved content, date, baseline, schema/rule version and plan revision. A client-supplied marker does not establish trust. Current authentication, editing ownership, revision and operational conflict checks remain live.

| Operation on an accepted plan | Verified structural work in v0.7.16 |
| --- | --- |
| First acceptance | Full structural validation |
| Fresh-runtime reopen with matching saved proof | 0 full validations, 0 incremental validations, 0 cards checked |
| Save one changed venue | 0 full validations, 1 incremental validation, 1 changed card checked, plus affected occupancy |
| Confirm the saved revision | 0 repeated full or incremental structural validations; current operational checks remain |
| Legacy plan without current proof | Full validation on the fresh runtime; the next successful Save or Confirm persists the proof |

These counts are asserted in `tests/stapler716-canonical.cjs`. Skipping repeated structural validation does not eliminate storage reads, digest verification, projections, serialization, lease handling or current absence/cap/published-cover checks. Reopen time can therefore still vary or regress on an individual run.

The signed-request comparison uses all five supplied offline JSON plans, with 100 to 104 teachers and 1,275 to 1,545 stored tiles, including the planner's stored non-final tiles. Each request uses a fresh Apps Script VM and a disk-backed Drive adapter. No production network or Google service latency is included. The ranges below cover the five fixtures; they are not confidence intervals.

| Local operation | v0.7.15 range | v0.7.16 range |
| --- | ---: | ---: |
| Initial accepted save | 450.6 to 725.8 ms | 334.3 to 502.0 ms |
| Fresh-runtime reopen | 175.7 to 268.8 ms | 86.0 to 381.7 ms |
| Local edit | 27.9 to 60.5 ms | 22.6 to 27.2 ms |
| 15 model projections | 114.0 to 215.1 ms | 59.8 to 76.7 ms |
| Save the edited plan | 424.8 to 722.2 ms | 284.0 to 518.5 ms |
| Confirm | 539.8 to 775.6 ms | 303.6 to 443.9 ms |

The 15 projections are five repeated passes through effective-day, accounting and changes projections. Exact paired fixture results are in `verification/716-suspension-before.json` and `verification/716-suspension-after.json`.

A separate real Chromium comparison runs each supplied plan three times per version with an in-page API adapter and no network delay. Rendering results are mixed: some fixture medians improve and others regress. This release makes no universal browser-render speed claim. Raw measurements and recovery assertions are retained in `verification/716-stapler-browser-comparison.json`.

## Allocator and live-system limits

No allocator speed improvement is claimed. Its existing synthetic solver regression and correctness oracle remain release checks; the new business rules change the work being scored, so an isolated elapsed time is not a like-for-like performance comparison with v0.7.15.

No live school data, provider messages or production performance experiments were used. Local verification does not establish the cause of the previously reported live Save/Confirm timeout or prove that the installed frontend, worker and backend match. The release preserves distinct Save/Confirm diagnostics and exact request retry so an unresolved live failure can be traced without assuming that a failed acknowledgement means a failed write.
