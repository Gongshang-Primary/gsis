# Calendar Q: continue an existing sync reliably

## Evidence and scope

Baseline: revision P, commit `a8ce50ef47afe5a57270d440c2cd18b34121c59a`. Change only Calendar frontend and backend behavior. Google Sheets and Google Calendar remain authoritative. Preserve the current run, provider event identities, source-save receipts, publication fences and all role checks.

The supplied 28 October diagnostic showed a five-item batch taking approximately 49 seconds against a 45-second browser deadline. It also retained 30 earlier schema errors; a fresh read of the workbook headers confirmed the required columns are present. These are separate issues.

## Implementation and verification

1. Reproduce the 49-second boundary with the real frontend and an AbortSignal-aware fake clock. Apply a 90-second deadline only to starting and advancing sync.
2. Recover uncertain batch responses through a read-only, administrator-only exact-run status endpoint. Observe an active claim, a resumable checkpoint or the deterministic completion audit. Never automatically start a new run to retry historical failures.
3. Bound status polling and repeated no-progress recovery. Allow the user to stop waiting locally; late results must not affect a newer operation.
4. Combine adjacent requested Sheet columns and omit flush only from audited scopes that read Sheets and coordinate through Properties. Keep normal mutation flushes, fresh permission checks, leases and source/year fences.
5. Test malformed completion records, lost final responses, permission changes, pending source saves, genuine quota delays, retained historical failures, interrupted requests and existing concurrency behavior. Compare service-call counts against the retained P source; label modeled timing as synthetic.
6. Review independently, run the full project suite and disclose inherited failures. Build and verify a matched Calendar-only patch and a lean source/evidence package. Commit and save the artifacts; live installation and a successful school-data run remain separate acceptance steps.

## Acceptance limits

Local simulations cannot establish live Google service latency or restore the historical 885-event throughput by assertion. The optional Calendar jobs Worker remains P. No source receipt may be cleared merely because it is old. No automatic retry may replace an unknown outcome with a fresh run.
