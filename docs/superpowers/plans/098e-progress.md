# SDD ledger — plan: docs/superpowers/plans/2026-10-27-098e.md
Baseline af8fd4ea231aa8981611d199fc89a5265bee82f9. Existing clean feature checkout; new branch patch/v0.9.8e. User commit authorizes execution without another approval round.
Pre-flight: frontend run correlation consumes backend public requestId. Retry consumes existing original-receipt API. Deleted view preferences remain owner-scoped and fingerprint-bound.

Task 1: complete. Management history preferences and allocation popup regression tests pass. RED on missing close control; GREEN after implementation. Backend public run status exposes only manual request identity for exact correlation.
Task 2: complete. SMC controls reuse original journal routes on receipt pages. Review/apply requests processing and current validations, with status confirmation required.
Task 3: complete. Past-only and mixed-date obsolete follow-ons reproduced RED, then GREEN; original evidence retained, current/future checks unchanged.
Final review: independent gpt-6-astra review. No Critical findings. Three Important findings fixed with RED/GREEN reproductions: mixed-date past follow-ons, stale selected retry objects after status refresh, and malformed retry confirmation continuing a batch.
Final: minor (deferred): pending-message recovery is outside an open modal; close the dialog to reach Show details.
Final: minor (deferred): say() dismissal selector also names pending controls; its fresh HTML contains only its own dismissal button, so this has no user-visible effect.
Task 4: final validation and packaging in progress. No live deployment or messages.

Task 4: focused verification 19/19 after final fixes and source sync. Wider suite is not a full completion claim; partial results retained separately. Generated package parity and recovery verification are release checks. No infrastructure migration or production deployment.
