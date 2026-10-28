# v0.7.13 performance evidence

Controlled v0.7.13 regressions passed. These are local browser and backend-fixture results, not production latency claims.

| Check | Observed result |
| --- | --- |
| IndexedDB baseline reuse, 150 teachers | One cold model download; zero downloads on verified warm reload |
| Local date, teacher and class flow | 368 ms in this Chromium fixture run; device and service latency are not represented |
| Single-cell no-cover acknowledgement | 1,367 bytes; no quota, full reconciliation, accounting or health projection in that fixture |
| Independent absence reports | All 30 stale-revision new reports retained under sequential current-state lock simulation; exact retries made zero additional writes |
| Local candidate filtering | Existing operations-speed browser check passed; one ranking computation reused while filtering |
| Summary preflight history access | After one batch index build, a 5,000-unrelated-row fixture records zero unrelated-row reads; same-batch sending/uncertain/failed changes remain visible |

The notification cleanup reuses the existing index and original row references. It introduces no separate cache or lifecycle state. Display-period selection and Name Bridge search remain local. Automatic eligibility uses one shared policy; manual overrides still perform fresh server checks.

Evidence: verification/713-node-results.json, verification/713-operations-speed-browser.log, verification/713-summary-followup.log and verification/713-thermonuclear-quality.md. Initial broad results and targeted final reruns are preserved. No payload ratio is presented as a latency speedup.

Apps Script startup, verified Contacts and Calendar reads, protected Drive I/O and provider requests remain service costs. Installed morning-rush traces are required to establish actual response times. The user's successful 05:45 WhatsApp delivery proves that specific reported receipt only.
