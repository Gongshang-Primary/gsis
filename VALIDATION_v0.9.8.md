# GSiS v0.9.8 validation

748 Node test files evaluated: 744 passed and four historical comparisons remain blocked. Blocked checks are not counted as passes. No unresolved runtime test failures remain after updating fixtures for the intentional recovery scope and rerunning browser checks with the available Chromium executable.

## Critical recovery checks

Eight tests execute bundled Worker entry points and verify Google routing despite leftover migration flags, durable absence forwarding before allocation, manual assignment, pending attendance blocking with safe codes/counts, the second notice drain, pause controls, original Queue handling, retained unsupported paid wakes, separate daily cleanup and suspended Venues export without D1 access.

Authenticated Apps Script response tests verify that ABSENCE_INTAKE_PENDING and safe counts survive the real doPost error envelope. The SMC report review checks cover authority, private field exclusion, saved coverage/type/relief, missing dates, HTML escaping and no automatic save or withdrawal.

Existing notification dispatch and receipt tests verify provider claims and recorded outcomes using mocks. Large-history cron tests retain over 2.5 MB of D1 audit data while verifying no full Roster D1 loads, no R2 reads/writes and no migrated background wakes. Recovery still calls the existing Google services for critical work.

The Roster frontend and notification Worker parse and import as standalone deployment files. Package verification checks component scope, bundled source parity, assets, authentication and SHA-256 hashes. The Apps Script syntax gate parses 194 .gs files. Source patch application against the declared v0.9.7 baseline is checked separately.

## Historical comparisons unavailable

- release084-absence-browser.cjs: missing v0.8.3 Git tag.
- roster717-inbox-performance.cjs: missing v0.7.16 Git tag.
- roster718-absence-performance-browser.cjs: missing v0.7.17 Git tag.
- stapler718a-relief-import.cjs: imported historical snapshot lacks shared/roster-stapler.js.

These same historical dependencies were unavailable in v0.9.7 validation. The release verifier also retains its existing exclusions for seven superseded historical fixtures; they are not included in the 748 total. Unchanged LORD components are not rebuilt or shipped in this patch.

## Reproduction

ROSTER_TEST_CHROMIUM=/tmp/chromium GSIS_BROWSER_EXECUTABLE=/tmp/chromium python3 scripts/verify-release.py --skip-package

python3 scripts/build-notification-worker.py --check

python3 scripts/verify-component-patch.py

Detailed per-file final results are in docs/v098/validation-results.json in SOURCE.patch.

## Production limitation

All checks are local with synthetic records and mocked service/provider responses. No live deployment, live record modification, allocation or WhatsApp send was performed. The two retained overlapping absence reports still require SMC review and explicit resolution. Installing code alone does not clear their pending-attendance block. Live Calendar, Contacts, Google permissions, templates and provider delivery must be verified after installation.
