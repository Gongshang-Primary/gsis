# Revision I suite merge

Baseline: committed H source `69e0d74c569dfd7afb44f9e6bdd42968cc0382bf`. Preserve historical version records and H's Google production authority, independent credentials, publication/communication boundaries, UT automatic cap and Stapler recovery contracts.

## Source and component ownership

All 17 matched components use 0.9.8i. Roster frontend, Roster backend and notification Worker contain the four production fixes. The remaining 14 components have matching labels or embedded shared-helper parity for an H installation. They remain available for a fully matched inventory and are optional deployment updates unless another independently reviewed change affects them. Review the final source diff before finalising this classification.

Canonical files are the source. After integration, regenerate backends, Worker bundles and shared/frontend mirrors once through `python3 scripts/build-release.py --sync-only`. Do not repair generated copies independently. Keep real credentials, school snapshots and private incident payloads out of source and all archives.

## Archive sequence

1. Finalise production and rehearsal canonical sources, version pins and tests. Build the rehearsal with `python3 scripts/build-rehearsal-worker.py --zip ../deliverables/GSiS_v0.9.8i_Rehearsal.zip`. Resolve the path relative to the source directory before invoking the script if its interface requires an absolute output path.
2. Run the generation step and required regression gates. Record actual counts and review findings in I validation without weakening H's inherited limits.
3. Commit and tag the integrated release. The final tag is `v0.9.8i`; the controller records the full source commit in the external verification receipt. Rebuild the rehearsal from that committed source so its manifest identifies the same inputs.
4. Run `python3 scripts/build-component-patch.py --no-sync`. The separate rehearsal ZIP must already exist beside the output. The production manifest references its SHA-256 and `productionInstallation: false`; the ZIP itself remains outside the production archive.
5. Run `python3 scripts/verify-component-patch.py`. It checks the production inventory, source/assets parity, archive hashes, provenance and standalone Pages entry points. It also checks the sibling rehearsal hash, rebuilds its canonical Worker to temporary storage to verify all rehearsal file/manifest parity, and rejects rehearsal nesting in production. Run the rehearsal's own checks separately; a ZIP integrity check does not establish authentication or live storage correctness.
6. Run `python3 scripts/package-suite.py`. The suite includes the production deployment ZIP, separate rehearsal ZIP, full tracked source ZIP, full reachable release history bundle and guides. `gsisSourceBase` remains foundation provenance; `gsisSourceRecoveryKind: full-reachable-history` explicitly selects a bundle without baseline prerequisites.
7. Verify final hashes, source/tag identity and a fresh recovery clone. Record raw commands, results and limitations in `RELEASE_VERIFICATION.json` outside the source commit. That receipt avoids claiming a self-referential final archive hash inside its own source.

The production installation route installs the three changed Roster components and adds the dedicated audit trigger while preserving existing critical and cleanup triggers. It does not create rehearsal resources. The rehearsal route creates a new Worker and dedicated D1/private R2, with server-side admin authentication and simulated notifications. It does not change production bindings or expose activation.

## Evidence limits

The inherited seven H Node failures must remain visible unless new evidence resolves them without fabricated history, relaxed performance thresholds or skipped checks. Initial, frozen and isolated rerun results are separate observations. Local D1/R2 substitutes are not real Cloudflare checks. Cloudflare authentication was unavailable, so resource creation, remote storage checks and rehearsal deployment remain pending. No production deployment, record mutation or real notification is authorised by packaging.
