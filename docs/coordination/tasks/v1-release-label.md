# v1.01 release label

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: implemented; exact-head CI and Muse review pending. Branch: `codex/v1-release-label`. Base: `252e88c7dd820c87fee1b445a697e7290b1ca1fb`. Updated: 16 November 2026 (Asia/Singapore).

Owner authority: the 15 November instruction to increment v1 releases, starting with v1.01, and the 16 November instruction "deploy v1.01". The visible label was still missing from current main. This bounded presentation change completes that release requirement; protocol/schema versions and v0.9 labels remain independent. Muse reviews the exact implementation head before it is merged. Release approval exists, but deployment still needs passing candidate checks, verified backups, resolution of the existing Contacts Memberships readiness condition and the protected GitHub environment approval.

## Exact scope

1. `docs/coordination/tasks/v1-release-label.md`
2. `v1/release.mjs`
3. `scripts/v1/build-web.mjs`
4. `scripts/v1/build.mjs`
5. `v1/web/overlays/index.html`
6. `v1/web/overlays/admin/index.html`
7. `tests/v1-product-v09-frontend-parity.mjs`
8. `tests/v1-product-release-label.mjs`

Main, remote branches and actual open PRs refreshed before claiming. PRs185–190 are merged; the sole open PR182 is the separate v0.9 hotfix and does not overlap these paths. No unreviewed product base.

## Implementation and acceptance

One v1-owned release constant supplies v1.01 to existing app chrome, the landing page, Toolbox and build evidence beside the exact source SHA. Use the existing release normalizer rather than a new collection of source text patches. Ensure the LORD-family screens have a visible header label as well as a document title. Preserve asset URLs, inline scripts, historical text, protocol versions, data and all application behavior.

Verify the actual built browser views, existing parity negative cases, canonical build/no generated drift, runner discovery, exact scope and required Node/LORD and product/package CI. Synthetic local data only. No code change to authentication, authority, persistence, migrations, provider behavior or infrastructure. Any unsupported screen must fail the label test rather than be silently omitted.

## Handoff

Record exact head, tests, visible changes and omissions in the PR. Q01–Q02: explicit release scope, central source of truth. Q03–Q05: presentation/build metadata only; no new dependency or mutable state. Q06–Q07: checks and Muse review pending. Q08: no deployment in this implementation task; deployment remains separate. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT Not tested.


## Implementation and verification

One `RELEASE_LABEL` in `v1/release.mjs` now supplies `v1.01`. The existing DOM-location release normalizer changes only current chrome text, fills explicit empty home/Toolbox markers, and adds small visible LORD/OVERLORD/STARLORD header labels. Initial document titles receive the same label. Existing view-specific runtime titles (for example Venues) remain unchanged; the visible release remains in application chrome. The product manifest records the label beside its exact source SHA; all nine Worker configurations carry the same display label and existing SHA. API, Calendar transport, schemas, cache query strings, historical content and v0.9 source remain unchanged.

- Q01–Q02: the exact eight claimed paths only; central v1-owned label, using the existing normalizer rather than another collection of legacy source patches.
- Q03–Q05: presentation and build metadata only. No authentication, permissions, persistence, data, provider or migration change; no dependency added.
- Q06: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-release-label.mjs` passes through the actual built browser, nine local Workers and synthetic D1 session. It verifies home, Toolbox and all nine application chrome labels at desktop/narrow widths, initial titles, product manifest and every Worker label/SHA. Its first pre-implementation assertion failed on the missing home release label. Early test-harness runs exposed concurrent-page shutdown masking errors and selection of a hidden Contacts login label; the final test uses sequential pages, waits for route cleanup and selects visible chrome. The new title check also found unlabeled initial Roster titles, which the normalizer now handles.
- Existing `TZ=Asia/Singapore node tests/v1-product-v09-frontend-parity.mjs` passes, including future v0.9 label variants and byte-preservation checks for inline scripts, attributes, asset query versions, comments and historical notes. `TZ=Asia/Singapore npm run build` passes all 18 canonical components without generated drift. Syntax and whitespace checks pass. Product discovery includes the new test (114 programs). Full product and required Node/LORD CI have not been run locally for this change; exact-head CI will supply those results in the PR.
- Q07: Muse exact-head review pending. Visible changes are the `v1.01` labels and small LORD-family header labels; no new controls.
- Q08: no deployment or live operation occurred. The owner has now required completion of Deploy Memberships publish-back before deployment; that separate implementation is a release prerequisite. This label PR alone does not release the deployment gate. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain Not tested.
