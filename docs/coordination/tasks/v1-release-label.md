# v1.01 release label

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: claimed. Branch: `codex/v1-release-label`. Base: `252e88c7dd820c87fee1b445a697e7290b1ca1fb`. Updated: 16 November 2026 (Asia/Singapore).

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
