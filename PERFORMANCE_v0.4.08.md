# v0.4.08 performance and write scope

All workload figures, modal selection, quotas, pills and explanations use the version already loaded in the browser. No new per-teacher, per-subject, PD or duty read requests. No computed totals are written back.

PLT edits retain cell-diff patches. Workload settings and TG scope changes use the existing field store, compact projection, durable transaction journal and exact receipt. Settings conflicts and stale reconnect destinations reject instead of overwriting another editor. Structural TG edits preserve sequence in a save batch; they do not add separate network calls.

Verified locally: targeted PLT slot patches; preservation of unrelated assignments/teacher records; replay idempotence; published snapshot isolation; 20 independent editors; recovery after uncertain reads/saves. Existing Contacts behavior is unchanged apart from release labels.

These are operation/behavior checks, not production latency measurements. No claim is made about live Apps Script or Sheets response time.
