# Calendar 0.9.8q

Calendar-only patch based on P. Google Sheets and Google Calendar remain authoritative. Other product runtimes stay at P; the isolated timetable preparation package stays at O.

- Starting and advancing Calendar sync now allow 90 seconds for a response, addressing the observed 49-second batch against the earlier 45-second browser deadline.
- After an uncertain batch response, the frontend checks the exact saved run. It can wait for an active claim, continue a settled checkpoint or recover the deterministic completed result. It never automatically starts a fresh run to retry retained failures.
- Read-only status is administrator-only, rechecks permission under the existing lock and rejects missing, mismatched or malformed evidence. Compact results preserve error and blocked counts.
- Recovery is bounded. Stop waiting ends local waiting and further continuation; already submitted backend work may finish. It is unavailable during the final stateful refresh after completion is confirmed.
- Adjacent requested Sheet columns are read together. Audited Sheet-read/Properties-only coordination omits unnecessary flushes. Normal writer flushes, provider identities, fresh permission checks, leases and source/year fences are retained.
- Packaging includes only the matched Calendar frontend and backend. The review package retains current source, the P-to-Q diff, tests and selected evidence; unrelated historical production snapshots are omitted and a required catalogue test uses synthetic data.

Q does not clear uncertain source saves, reset the active session, change schema, retry old errors automatically or alter the optional Calendar jobs Worker. Actual live throughput still requires a post-installation run.
