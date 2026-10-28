# Merge into the next suite

Apply SOURCE.patch to the supplied v0.9.5 source, retaining the new regression tests. Canonical changes are shared/roster-stapler.js, shared/roster-operations.js and roster-update/public/roster-stapler-ui.js. Roster asset cache keys and its API version are updated.

Run `npm ci`, then `python3 scripts/build-release.py --sync-only` to regenerate the browser models, Apps Script bundle, Worker domain and notification Worker bundle. Retain the component versions for other applications. No database migration is needed.

The patch was generated from an extracted source archive. Its local packaging baseline commit is an import checkpoint; RELEASE_SUMMARY.json contains the input archive SHA256. Live deployment was not performed.
