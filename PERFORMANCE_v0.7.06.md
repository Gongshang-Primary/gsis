# GSiS v0.7.06 performance checks

The release removes waits that do not determine the data being displayed. It does not treat cached timetable gaps as current availability or remove server validation to reduce time.

| Screen or action | Intended local work | Current server check |
| --- | --- | --- |
| Check Availability | Show cached timetable names, search, selection chips and baseline cells. | Identity, date context and operational eligibility. |
| Timetable | Draw loaded teacher, class or TG cells and apply display filters. | Fetch a model only if missing; verify dated context separately. |
| Report Absence | Show the form and cached baseline periods. | Current rules, authority, conflicts and authoritative save. |
| Own Arrangements | Open and filter the baseline matrix. | Saved absence identity and current candidate eligibility before submission. |
| Manage reported absences | Reuse a recent list. | Read recorded entries without unrelated reconciliation. |
| Assign Relief | Reuse loaded baseline cells and candidate rows for period selection and filtering. | Current allocations, quota, accounting, health and write validation. |
| WhatsApp Readiness | Render returned configuration and cached provider status. | SMC authority and the compact readiness projection. |
| Recess Regression | Group actual classes into virtual rows. | Dates, active model, demand uniqueness, authority and save revision. |

The full timetable stays in bounded browser memory. Account changes, logout and denied access clear the appropriate data. This release does not add staff data to localStorage or IndexedDB. Timetable, Calendar context, staff mapping and mutable operational records have separate freshness rules.

Atomic saves keep the same request ID, actor and payload on an uncertain retry. A saved confirmation means the durable operation completed. Optional colleague planning must not turn an already committed absence into an uncertain save.

## Evidence

Nine Chromium suites passed. The new cached-read suite confirms one complete availability request, no separate directory wait, local subset changes, cached baseline exports and safe expiry or permission denial. The operations suite confirms a warm Own Arrangements matrix within its 200 ms synthetic target while save and candidate responses are delayed. It also confirms fresh Manage and Assign revisits use the cached view without another request.

All 289 selected Node regression scripts passed. Package results are recorded in verification/706-package-integrity.log. The Node and browser reports are verification/706-node-results.json and verification/706-browser-summary.json. Local rendering tests use synthetic data and intercepted responses.

The warm-browser target is 200 ms to useful cached content. The passing synthetic Own Arrangements case is not a production service guarantee. Record cold and warm end-to-end timings with comparable data, including median and slow-tail results, after installation.

The Worker records calendarMs, backendMs, totalMs and Server-Timing. Deploy diagnostics distinguish Contacts, state, context, quota, reconciliation, apply, commit and projection. Retain diagnostic IDs and timing metadata without exposing staff records or secrets. More local tests cannot substitute for live service timing.

The v0.7.05 quota cache remains scoped to Singapore day and published source. Fresh source checks still run. Each entry has a six-hour maximum and can expire earlier.
