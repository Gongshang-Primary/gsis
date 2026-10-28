# GSiS revision I changelog

Baseline: v0.9.8h, commit `69e0d74c569dfd7afb44f9e6bdd42968cc0382bf`. All 17 supplied components use v0.9.8i. The production changes are in Roster frontend, Roster backend and the notification Worker. The other components carry matching labels or embedded shared-helper parity and remain optional updates for an existing H installation.

## Suspended workload and cumulative R

Regression coverage preserves the ordinary suspended-day workload exemption for automatic eligibility and ranking. It does not remove relief history or cumulative R. Relief that counts under the existing performed/assigned accounting rules continues to count on a confirmed suspended date. H's independently configured UT hard automatic employment cap remains, including missing-capacity exclusion. SMC retains its deliberate manual override with warning and audit evidence.

## Actual FORM blocks

When the configured FORM=2 consecutive rule is enabled, FORM pairing follows the effective source timetable for the same class, group and absent teacher. The default PAL=3 rule remains unchanged. Real adjacent two-period FORM blocks keep one relief teacher across the covered block. Genuine single lessons follow normal allocation. A partial absence in a true pair is distinguished from a genuine solo lesson. The allocator never adds periods or overwrites an explicit SMC assignment. Other subjects retain their configured policy.

## Baseline comparison

Stapler labels the control **Show baseline comparison** and starts with it on. Turning it off remains available in the session. A missing, incompatible or removed baseline does not prevent planning, alter the dated plan or revoke confirmation. H's independent confirmed-plan authority and recovery rules remain.

## Daily plaintext audit export

The existing Google `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` audit export resumes through a dedicated bounded cron lane. The audit-only expression `2-57/5 * * * *` runs in UTC alongside the retained critical-work minute trigger and daily cleanup trigger. An invocation handles at most one pending day and yields to active notification work. Retained evidence can catch up without allocation or sends. Verbose off, locks, retries, source history and export receipts remain. System Health reports completion, counts and safe failure details; pending counts describe the latest check.

## Isolated admin rehearsal

A separate Worker package provides a synthetic school day and simulated relief operations using the production pure domain engine. Its dedicated D1 stores revisioned state and command receipts. Immutable compressed R2 timetable objects use D1 revision pointers. Explicit bounded snapshot import/export checks schema, version and source identity and rejects unsupported imports.

Rehearsal data operations require verified school Google identity and an explicit server-side administrator allowlist. The Worker uses its own resources and same-origin requests. It has no production activation or fence operation, live scheduler, production queue, real provider credentials or Google write capability. Missing configuration fails closed. Local checks do not establish live Cloudflare persistence. Live provisioning and remote D1/R2 verification remain blocked by unavailable Cloudflare authentication.

## Packaging and installation

The production ZIP retains the nine frontend ZIPs, six Apps Script backends and two Worker files. The separate rehearsal ZIP is a sibling artifact, identified by hash in `PATCH.json`, with `productionInstallation` set to false. It is never nested inside the production deployment ZIP. The suite carries both archives with separate installation routes, source ZIP and full reachable release history for recovery.

Production installation keeps Google authoritative. It does not activate the existing migration or timetable-cache paths. The production guide provides chronological Roster installation and the exact audit trigger change. Rehearsal setup is a separate guide inside its own archive. No live deployment or message send is part of release preparation.
