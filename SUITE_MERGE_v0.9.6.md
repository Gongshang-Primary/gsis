# Source merge

The included SOURCE.patch is cumulative against the supplied v0.9.5 source archive. It includes the v0.9.5a STAPLER changes and v0.9.6 cron/cache changes. The local Git import checkpoint is a packaging reference, not a recovered upstream commit.

The 26 October packaging revision also includes the component builder/verifier repair and `tests/pages096-packaged-worker.cjs`. Retain these when merging: dashboard frontend ZIPs must contain self-contained Roster and Deploy `_worker.js` bundles, as full releases already do.

Apply to a clean extracted v0.9.5 source tree, then regenerate canonical runtime copies with `python3 scripts/build-release.py --sync-only`. Do not apply the cumulative patch a second time over an already patched tree. Preserve the package metadata, shared model sources, new tests and documentation when merging into the next full suite.

Changed deployment components are Roster Pages, Roster Apps Script, the notification Worker and Deploy Pages. Other deployed suite components remain at their existing versions. No authority migration, production data edit, message send or live deployment is included.
