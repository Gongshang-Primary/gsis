# Source and component recovery

Base: GSiS v0.9.7, source commit 319337e5aa060932a91d3fa7930f3eb0a55b458c.

Apply SOURCE.patch to that source baseline to recover this prepared v0.9.8 work. The patch includes generated runtime sources and the focused restoration tests. PATCH.json records the base commit and working-tree provenance. No v0.9.8 source commit or live deployment is implied.

Only rosterFrontend, rosterBackend and notificationWorker advance to v0.9.8. Other installed components retain their previous versions. Merge later feature work against this recovery route deliberately; do not re-enable the private backend or operational D1 path just by restoring a removed flag.

Build: python3 scripts/build-component-patch.py

Verify package: python3 scripts/verify-component-patch.py

Test: python3 scripts/verify-release.py --skip-package

See VALIDATION.md for the exact executed checks and any unavailable historical comparisons.
