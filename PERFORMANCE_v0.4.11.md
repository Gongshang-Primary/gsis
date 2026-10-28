# GSiS v0.4.11 performance and resilience

The release fixes recovery access after a browser draft is lost; it does not claim measured production speed or concurrency capacity.

- Normal Contacts saves retain targeted dirty-cell writes. An Active-only edit no longer reformats an unrelated phone cell.
- Recovery status is loaded only when a recovery block is encountered or the Admin presses Check again. No idle polling or automatic write replay is added.
- Recovery uses one existing durable request under the writer lock. It reuses validation and write logic rather than bypassing conflict checks.
- Shared short data caches, fresh roles, indexed Audit summaries and direct Deploy delta acknowledgements from v0.4.10 remain.
- Distinct error messages expose the failure category. A random gateway reference is still a correlation ID, not a diagnosis.

Live first-save/first-load/Audit timings and two-real-user tests remain necessary. The initial full-version read and shared writer-lock throughput are unchanged. The original failed Contacts execution and Deploy reference 78316f65 have not been correlated with live logs.
