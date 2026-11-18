# v1-venues-deep-links: B-V01d notification targets

- Status: claimed before product edits.
- Owner/model: Codex; coordinator ChatGPT; independent exact-head reviewer Muse (current owner substitution).
- Updated: 19 November 2026, Asia/Singapore.
- Branch: `codex/v1-venues-deep-links`.
- Refreshed main/base: `6835ed30677c7919fa63a58db8bb7dcd7d8c8daa`.
- Authority: owner-authorised v1 queue; coordinator selected this independent bounded B-V01d repair after actual synthetic baseline proof. No merge, deployment, migration, live access or real provider sends.

## Exact three-path scope

1. `scripts/v1/build-web.mjs` — only the Venues copied frontend's deep-link parser expression.
2. `tests/v1-product-venues-deep-links.mjs`.
3. `docs/coordination/tasks/v1-venues-deep-links.md`.

Read root/v1 instructions, workflow, lanes, status, owner directives and engineering policies. Refreshed main and actual open PR file inventories: #182, #213, #214 and #215 have no overlap. Concurrent Calendar/Deploy builder work and the physical-register branch affect different expressions; the coordinator explicitly assigned this parser hunk. Do not churn those branches or copy their unmerged changes. Current Muse substitution is recorded in `docs/coordination/review/pr211-muse-review.md` (owner 16 November directive, source `12b06eb`).

## Baseline and boundary

The actual Venues notification dispatcher constructs `/venues/b/<bookingId>` and `/venues/r/<transferId>`. The unchanged legacy frontend parses only root `/b/…` and `/r/…`, so the v1 gateway serves Venues but the intended record is never requested. A local nine-Worker/D1 browser probe on `bd77b27deab417afce859cd80465d7c608ae0ab2` (product-identical to refreshed main; intervening commits add only claims) reproduced both generated links opening Book with no dialog and zero targeted reads. Real direct owner reads returned HTTP200 with the exact record; outsider reads returned HTTP403/FORBIDDEN. Elapsed 11.454s. Source, UI, Core, gateway and record reads were real local components; the notification formatter used synthetic authority/contact responses and an injected capture-only provider transport. No external request or browser command occurred. Scratch evidence: `/tmp/gsis-venues-deep-link-current-baseline.log` and `/tmp/gsis-venues-deep-link-current-baseline/results.json`; committed regression will reproduce the behavior independently.

Adapt only the v1 copied-source parser to the existing module prefix. Keep the generated link shapes and ID grammar, strict school/owner/participant/manager authorization, normal query navigation and legacy source unchanged. Existing backend contracts own access and record data. Do not alter source availability, permissions, gateway routes, provider behavior or booking writes. The legacy root path remains the application launcher; malformed paths must not fetch a target. The larger slot/adoption/retained-clash design is not part of this repair.

## Acceptance and verification

- Built browser through real local Workers/D1: actual generated booking and transfer links open the correct target and existing dialog; refresh and query suffix preserve the target. An ordinary owner follows the current owner path and an unrelated reader is denied without target data or action controls. Missing/foreign/malformed targets fail safely.
- Provider-disabled local product, synthetic accounts/records only. Capture-only notification transport never accesses a provider. No browser commands, changed booking records, new operation receipts or source readiness fabricated by navigation.
- Preserve normal Venues query navigation and current notifications/receipt behavior. Run focused browser regression plus unchanged navigation/notification checks, canonical build without tracked drift, runner discovery and required full Node/LORD/product exact-head CI.
- Q01–Q02 scope/design recorded. Q03–Q06 verification pending; Q07 Muse review pending. Q08 release not authorised. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT **Not tested**. Apply the repository's focused debugging and verification principles; no skill package is claimed executed for this small repair.

Rollback is a reviewed builder-expression revert; no stored data, credentials or migration changes. Record actual commands, failures, final head and PR here before handoff.
