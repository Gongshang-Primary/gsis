# Roster 31-day timetable preload implementation plan

Goal: After the Roster home icons render, preload today through today plus 30 days in Singapore time, in two complete stages: baselines, then authorised suspended plans.

Authority: User explicitly requested implementation. No release commit, version bump, deployment or staff message is authorised. Item 096 remains queued and is not part of this change.

Architecture: A read-only timetableBatch operation returns version-bound gzip JSON envelopes. Stage one deduplicates immutable baseline models; stage two binds the selected suspended records to the same baseline register identity. Each client stage becomes usable only after full validation. Changing source identity invalidates the dependent stage. Existing foreground reads remain the fallback, and saves retain online validation.

Decisions: 31 calendar dates inclusive; home remains usable; baseline first. Draft preload is limited to SMC/Admin and authorised planners. Teachers receive confirmed snapshots only. The user chose latest confirmed first in Timetable, even when an older publication exists. Label that view Confirmed; WhatsApp and private published-duty pages continue to use publication snapshots. Baseline remains visible below.

Tasks:
1. Add and test backend batch envelopes, source consistency checks, role filtering and the fixed Singapore date window.
2. Add and test endpoint decoding, atomic stage installation, cancellation, scope isolation and bounded memory/fallback.
3. Integrate startup after icons, baseline/date cache reads and safe invalidation without blocking navigation.
4. Expose the latest confirmed timetable to ordinary teacher browsing; preserve published notification semantics.
5. Reuse preloaded confirmed dates in Stapler while refreshing authoritative metadata and obtaining fresh edit leases.
6. Verify native browser staging, next-baseline selection, stale and malformed responses, logout/permission changes, confirmed/draft separation and existing regressions.
7. Record source-only results and update the wider changelog; retain all source changes uncommitted.

Review focus: changing baseline between stages; midnight during a transfer; withdrawn confirmations or access; incomplete/corrupt stage two; ordinary teachers receiving later draft content.

Files: backend/RosterTimetableBatch.gs; backend/RosterOperations.gs; shared/roster-operations.js; roster-update/public/roster-timetable-preload.js; roster.js; roster-stapler-ui.js; index.html; _worker.js; scripts/build-release.py; focused tests and generated runtime copies.
