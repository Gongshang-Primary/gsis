# v0.7.11 performance

The full applicable timetable warms as soon as the signed-in profile is available, before opening a function. A future applicable baseline also warms when today has none. Immutable baseline models remain shared in browser memory. Dated operational state remains separate and is refreshed/validated at authoritative saves.

Assign Relief date revisits reuse fresh date projections; prior-date responses cannot overwrite the selected date. Compact assignment responses omit repeated cells where a cached baseline can hydrate them. Confirmed Stapler changes retain their own revision and are not mistaken for baseline cells.

Annual accounting uses indexes for corrections, absences and weekly loads. A synthetic 5,000-record/2,000-correction/1,000-absence case was measured at 141.76 ms before and 7.52 ms after, with identical output. This is a local CPU comparison, not a production network-latency promise.

Additional measurements and final regression results appear in VALIDATION.md. Authoritative permission, revision, availability and quota checks are retained.

Reconciliation now reuses immutable timetable joins per date and builds only the assignment teacher projection. The 100-teacher/40-assignment fixture drops from 4,000 to 40 teacher projections. Live balances still recompute after each cancellation. In a local run this reduced CPU time from about 86 ms to 33 ms; runtime and machine load vary.

A cached baseline register check reuses one full-model Drive read across five checks. The names response measured 1,635 bytes against 214,138 bytes for the full fixture. Compact 100-teacher assignment responses measured 137,489 to 114,748 bytes. Contacts and Calendar network calls remain material to cold production requests.
