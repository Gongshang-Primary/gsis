# GSiS v0.9.5 implementation and release plan

Authorized 26 October 2026. Baseline: v0.9.4, with queued scope captured in ACCEPTED_SCOPE.md.

1. Restore verified LORD administrator booking identity; preserve acting-user audit and recipient notifications. Remove the obsolete navigation link.
2. Correct OVERLORD notice flow and settings layout; remove obsolete individual-consent UI without disabling school-managed alerts.
3. Use period selectors for both Roster absence-management views; preserve saved time coverage until an explicit period edit.
4. Make the live physical Venues register authoritative across Apps Script and Worker consumers; version its content independently from published timetable scope.
5. Add authorized room metadata editing and checkbox owner selection. Preserve stable unit identities, grants, bookings and source freshness boundaries.
6. Preserve safe source diagnostics through actual response envelopes.
7. Review changed authorization, caching, concurrency and notification boundaries. Run focused regression and browser checks, then full suite and packaging checks.
8. Synchronize component labels to 0.9.5, update the first-deployer documentation and architecture, commit and tag verified source, build and verify the committed deployment, and package the full suite.

Production deployment, live identity verification, real notification sends and data migration are outside this local release operation. Report them as deployment acceptance steps rather than local test outcomes.
