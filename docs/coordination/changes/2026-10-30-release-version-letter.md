# Shared production release labels

Model: Codex
Status: implemented on codex/release-version-letter; pending full Linux checks and Claude review. Not deployed.

- VERSION in scripts/package-099-suite.py is the only editable production label (0.9.9b). Build stamps all 18 components and browser asset URLs.
- A page with a different backend label shows the requested refresh notice while remaining usable. Backend envelopes include backendVersion.
- GET /health on each optional Worker returns its version only.
- Final bundles require the next unused letter, include labelled deploy steps and commit evidence, and record the last successful bundle label. After z the owner chooses the next series.
- Google remains authoritative. No live settings, records or messages changed. Rollback: use the previous component bundle and preserve its metadata.

Build: passed, 18 components. Focused version and guard checks: passed. Full suite: pending Linux CI.
