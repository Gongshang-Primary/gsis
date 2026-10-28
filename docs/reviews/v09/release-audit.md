# v0.9 release pipeline audit

Reviewed 24 October 2026, Singapore time. Scope: package inventory, current release labels, archive verification, dependency boundaries and configuration hygiene. Source behavior was reviewed and exercised in the preceding optimisation and LORD integration passes. This review performs no production deployment or provider send.

## Findings and resolution

1. The prior bump helper accepted only three numeric components. The requested product label is `0.9`; npm requires `0.9.0`. The release owner must distinguish the user label from the package semantic version and normalise the previous Deploy `0.8.11a` patch with the other `0.8.11` components.
2. The installation inventory and build loops previously included five frontends and four Apps Script backends. v0.9 requires eight frontends and five backends. LORD, OVERLORD and STARLORD share one separately owned LORD backend. The inventory helper and package verifier now enforce all eight frontend paths and five backend names, while allowing explicitly declared additional documentation.
3. The previous `component-patch` state skips most backend generation and the scheduled Worker. The full release must clear the old patch-only flags before building. Root is updating the build and metadata.
4. The root README previously linked v0.8.6. Older WhatsApp setup/activation documents still contain earlier backend ownership and approval observations. The v0.9 maintainer guide must be the current installation entry point. Historical documentation remains historical.
5. LORD original source embeds private proxy and Telegram credentials. Import only its regenerated clean source. Existing installations must preserve their private constants, workbook IDs, folder IDs and booking peppers using the documented configuration process. The release verifier checks clean connection placeholders, source parity and required bridge dependencies; the release owner must additionally exclude original configured source and scan the release for actual original secrets without printing them.

## Package dependency gates

The full package verifier checks archive membership, uniqueness, ZIP integrity, SHA-256 inventory, byte parity with runtime sources, offline documentation links, bundled vendor asset hashes, and visible version labels for every frontend. It checks the Deploy/Roster fixed backend roles and matching release constants.

For LORD integration it additionally checks:

* One complete shared LORD backend byte-identical to `lord-suite/Source/backend/Code.gs`.
* Authenticated `lordContactsService_` and `lordDeployService_` source routes in the packaged Contacts and Deploy backends.
* `LORD_BRIDGE_SECRET`, `LORD_CONTACTS_APPS_SCRIPT_URL`, `LORD_DEPLOY_APPS_SCRIPT_URL`, `LORD_GSIS_SNAPSHOT_FOLDER_ID`, `enableLORDGSiSBridge` and `syncLORDGSiSReferences` present in the LORD implementation and maintainer guide.
* All three LORD Workers retain the in-file `LORD_BACKEND_URL` and `LORD_PROXY_SECRET` connection contract with clean placeholders. LORD and OVERLORD additionally use the environment bindings `GOOGLE_CLIENT_ID` and `LORD_SESSION_SECRET`. STARLORD has no Google/session binding requirement.

The LORD bridge activation is a separate operational step after installing the new Contacts and Deploy source endpoints. Preserve their existing `/exec` URLs. The local snapshot contains contact data and belongs in a private Drive folder. No activation is implied by a source commit.

## WhatsApp reference required in the package

The current canonical body/field order is `notification-worker/template-contracts.json`, synchronised into the Roster gateway and generated notification Worker. Preserve provider template names, hashes, language, dynamic buttons and protocol identifiers when harmonising product version labels. These have independent contract versions.

The v0.9 guide must retain all known configuration names and where they belong, including the separate Roster Pages and notification Worker settings, provider IDs, dedicated secrets, approved template mappings, callback-account distinction, menu destinations, Queue producer/consumer bindings and Cron trigger. Do not infer current live provider approval from historical observations. The latest v0.8.11 maintainer appendix is more current than the earlier standalone WhatsApp guides.

The intended relief menu destination is `https://roster.gsps.edu.sg/` via `WHATSAPP_CURRENT_RELIEF_URL`. This is the ordinary menu response, so changing that configured destination does not edit an approved template. The release does not change any live value.

## Verification completed in this audit

`python3 -m py_compile scripts/installation-manifest.py scripts/verify-full-package.py` passed after these two scripts were changed. Final package and regression evidence belongs in the v0.9 release verification record after all coordinated source changes are frozen.

Before commit, run the full GSiS gate and LORD checks, build every declared component, verify the full package, check generated notification Worker parity and `git diff --check`, and inspect staged files for private configured source or unrelated files. Rebuild or refresh archive commit metadata after the source commit, then recheck archive parity. Git commit metadata must not describe an earlier source revision.

## Coordinated release gate extension

The verifier now requires exactly the fourteen declared component version entries to match the suite display label, with npm and both package-lock version fields using the corresponding three-part semantic version (`0.9.0` for `0.9`). It reads all eight gateway release labels and the scheduled Worker label from the packaged output, and checks the Contacts, Calendar, Deploy, Roster and LORD backend release constants. Protocol and schema identifiers are intentionally unchanged.

The verifier compiled after the extension. The current component inventory and the four existing gateway version extraction checks passed. The LORD header extraction was checked against the clean generated templates for all three viewports. These partial checks do not substitute for running the full package verifier once its archives are generated.

Two release-owner follow-ups were identified in the independent build diff: include the LORD active files in the reusable version bump process, and include `data` among build provenance inputs because the Layout seed is embedded in generated source.

## Final independent package verification

After the v0.9 build, `python3 scripts/verify-full-package.py` passed: 23 declared files, archive/source parity, hashes, runtime assets, offline guides, all fourteen component metadata entries, eight gateway labels, the scheduled Worker label and five backend release constants. `git diff --check` also passed.

The release owner's two follow-ups are resolved in source: `build-release.py` includes `data` in release provenance inputs, and `bump-release.py` invokes `lord-suite/tools/bump_suite_version.py` when present. That helper updates the active LORD source/test pins and regenerates clean first-time templates while preserving schema/cache identifiers.

Markdown links in the packaged maintainer guide, LORD setup, release notes, venue pipeline and WhatsApp parameter reference were checked against the installation archive; no relative link targets were missing. The guide preserves the separate backend owners and existing configuration, and distinguishes future venue work from the installed release.

At this pre-commit check, archive metadata correctly reported the previous HEAD and `sourceState: working-tree`. The root release process must rebuild after the authorised source commit and verify that the final archive reports the new tagged commit and `sourceState: committed`. This is expected pre-commit metadata, not evidence that the final archive is already committed.
