# Roster 0.9.8b implementation plan

Goal: improve recovery observability and change awareness without operational migration.
Architecture: Google remains authoritative; existing Workers authenticate, transport receipts, schedule and dispatch. Existing D1 health summaries remain metadata only. All mutations retain existing receipt identity and conflict fences.

1. Add safe backend diagnostic pointers to scheduled failures and a read-only, freshly authorised recovery health view. Test unauthorised access, unavailable storage, idle versus successful work and private-data exclusion.
2. Label Assign Relief tiles by current decision owner. Test peer approval, SMC override, automatic allocation and unsaved local changes.
3. Reuse date revision probes, preserve edits on concurrent change, and avoid minute/global-revision redraws. Test unchanged/future dates, period transitions, conflict review and stale response rejection.
4. Cache compact Google revision projections for at most 30 seconds, invalidate after attempted operational writes, and continue fresh access/reference checks. No cache may authorise a mutation. Test cache loss, failed marker update, uncertain save and expiry.
5. Run receipt, peer, allocation and packaging regressions. Review final patch, commit cumulative 098/098a/098b recovery changes and produce three matched deployment components.

Review focus: auth revocation; expired/missed cache invalidation; lost write responses; local edits while polling; notification processing versus actual delivery. No live deployment or sends.
