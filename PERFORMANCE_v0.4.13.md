# GSiS v0.4.13 performance and resilience

- Layout Excel code uses local displayed data. Its reference template loads only on export and is reused in the page. Failed template loads can be retried. It does not delay initial data loading or add backend calls.
- Position restoration is bounded to at most 12 animation frames and waits for stable cell geometry. A newer interaction supersedes the pending restoration; no timer loops or repeated network requests are introduced.
- Contacts saves, recovery, writer locks, permission checks, caches and Audit pagination retain their established behavior. No new migration is needed.

Validation uses local fixtures, parsers and Chromium. It is not a production latency benchmark. Q74 live new-contact verification, preparation completion, first-save/load/Audit timing, two-real-user conflict/recovery checks and incident attribution remain open.
