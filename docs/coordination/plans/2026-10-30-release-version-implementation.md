# Shared release label implementation plan

Spec: docs/coordination/tasks/release-version-letter.md
Goal: Build every production component from VERSION=0.9.9b and identify mixed page/server deployments without blocking users.

- [ ] Add failing checks for label parity, changed-header detection, mismatch/equal/invalid responses and repeat bundle rejection.
- [ ] Add one release stamp helper, called by both build entry points. Keep package.json version as numeric npm metadata; gsisRelease and production component labels use the full letter. Preserve historical evidence and the separately versioned shadow preparation package.
- [ ] Add a shared page notice, installed by the build. Read backend labels from actual responses; do not add polling or interpret a business document version as a release label.
- [ ] Add version-only health endpoints to optional Workers. Keep existing authenticated health details protected.
- [ ] Package final bundles under the full label with DEPLOY_STEPS.md and COMMIT.txt; previews and component builds may repeat, final bundles may not.
- [ ] Regenerate tracked outputs, run focused tests and full Linux CI, record exact head. No new PR until a slot opens; no merge or deployment.

Review focus: cached pages, absent/malformed release labels, API responses with business version fields, old backend safety checks, failed bundle writes.

Ruling: The owner requested the whole approved queue ASAP. Execute the existing specification inline without another design approval round. Native Windows sandbox commands are unavailable, so Node child processes run the same repository scripts; full validation uses Linux CI.
