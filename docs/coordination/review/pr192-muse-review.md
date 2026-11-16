# Review: PR #192 — Edit Deploy Memberships and publish them back to Contacts

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `a29c861203ee045f2a2c40028688a43602f4a522`.
- Base / accepted implementation scope: `318007d351ee2736eb89e79003b9e202a82d4d3f` (final accepted test-scope amendment `a141328`).
- CI run: [43812331057](https://github.com/helper-gsps/gsis/actions/runs/43812331057), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43812343852](https://github.com/helper-gsps/gsis/actions/runs/43812343852) green at the exact head (116/116 product programs); independently triggered product check [43813648937](https://github.com/helper-gsps/gsis/actions/runs/43813648937) also green at the same head.
- PR: https://github.com/helper-gsps/gsis/pull/192 (Codex, branch `codex/v1-deploy-memberships-publish`).
- Task record: `docs/coordination/tasks/v1-deploy-memberships-publish.md` (in the PR; reviewer line already names Muse).

## What it does

Deploy's Membership view was read-only and publication never wrote Memberships back to Contacts. An authorised editor can now save per-person Memberships in the version, import/export them through canonical Excel, and publish them to Contacts through bounded, recoverable owner requests. New/Duplicate copies current Memberships; later load/save/recalculation/export/publication preserves the version's known or unknown state. Explicit empty lists clear; untouched unknowns and omitted rows do not. Ordinary Memberships never grants accepted SMC/EO/School Leader authority. An immutable marker (`membershipPublicationVersion: 1`) limits the new contract to newly prepared publications; historical publications keep their original semantics. Per-person Contacts sequence frontiers and publication pins preserve later explicit edits and reject older delivery, while a deliberate newer publication can overwrite. Every Contacts field/history/frontier/receipt update is atomic in Contacts D1; Core still verifies the original publication and the publisher's current authority. No cross-D1 atomicity claim. At most eight independent owner applications per request, with bounded narrow proofs. No general scheduler, Drive backup, messaging sender or Google integration is activated.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-deploy-memberships.mjs`: exit 0. "PASS Memberships built Worker/D1: version edits, unknown/clear semantics, current authority, refresh boundaries, XLSX, revision/isolation checks and restart receipt".
- New test `tests/v1-product-membership-publication.mjs`: exit 0. "PASS large immutable publication uses bounded proof pages and eight independent owner commits" and "PASS 7 Memberships publication boundary groups in 30884 ms; hosted UAT Not tested".
- New browser test `tests/v1-product-deploy-memberships-browser.mjs`: exit 0. "PASS built Membership editor/save/reload, unknown and explicit clear, canonical Excel import, publish-to-Contacts application via real Workers/D1; unconfirmed/lost acknowledgement recovery; no provider sends (24553ms)".
- Named regressions, all exit 0: `v1-product-deploy-workbooks`, `v1-product-deploy-storage`, `v1-product-deploy-duplicate-contacts`, `v1-product-contacts-projection-browser`, `v1-product-contacts-direct-authority`, `v1-product-deploy-venue-ui`, `v1-product-integration`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 19 changed paths within the 20-path claim (`deploy-ui-tables.js` needed no edit, as recorded). `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the security-critical code in full: `v1/services/contacts/membership-publication.mjs` (frontier read via the pinned Deploy named projection; publication guard prior sequence < current, direct guard <=; current-publication assertion; idempotent supersede; bounded 128-attempt operation identities with only durably aborted attempts receiving a new identity; Core authority recheck per application; unknown failures stay pending, never fabricated); `v1/services/contacts/service.mjs` (internal membership routes; membership contributions use INSERT OR IGNORE on deterministic IDs; publication path requires `contacts.contribute` and exactly one field; frontier guard/write in the same commit); `v1/services/contacts/grid.mjs` (frontier guard and dependency pin); `v1/services/core/contributions.mjs` (membership-only proof verification; old draft-copy field revision is not a veto — Contacts CAS and frontier guard instead); `v1/services/deploy/service.mjs` (512 cap; marker in the immutable envelope; membership-only proof pages; marked deliveries reported `ingested`, not `applied`); `v1/services/deploy/model.mjs` (unknown/null/[] distinguished; saved version Memberships preserved unless New/Duplicate; edit op requires expected-value check); `v1/services/deploy/workbooks.mjs` (Membership import allowed with blank-clear only for known values; foreign IDs rejected by the existing Staff ID check); `v1/web/shared/deploy-ui.js` (unknown blank never queues a clear on focus; explicit Clear button; 32 labels, 160 chars, no commas/semicolons/control chars); `v1/migrations/contacts/0005_membership_publications.sql` (one additive frontier table with CHECK constraints).
- Read the contract doc: it states the limits plainly — this does not populate real Memberships or confirm missing entries; the owner must enter/import reviewed Memberships and publish before relying on membership-based workload calculations; this is not the remaining ten-tag Contacts lifecycle implementation.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner instruction 16 Nov "Complete publish-back before deployment"; 19-of-20-path claim held; test-scope amendments recorded on main before editing.
- Q02 Design and ownership: pass. Contacts owns field/history/frontier/receipt; Deploy owns the version list and immutable envelope; Core verifies publication and authority.
- Q03 Security and privacy: pass. No auth change; membership writes cannot expand to authority fields; manual resolution of automatic membership publications is rejected; ingestion is never reported as application.
- Q04 Concurrency and recovery: pass. Sequence frontiers (not clocks) order direct edits and publications; atomic per-owner commits; bounded progress with retry recovery; lost responses retain original identities.
- Q05 Resources and maintainability: pass. 512 staff cap; eight applications per request; bounded proof pages avoid the 1 MiB response limit; no new dependency.
- Q06 Verification: pass. All three new tests and all seven named regressions pass locally; exact-head Node/LORD CI and both product CI runs green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, live data, credentials or provider activation; additive Contacts migration requires a fresh private D1 backup before hosted migration; retain frontier/history on rollback and do not replay new publications through an older implementation. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

HR Settings → Membership is now editable in Deploy, with canonical Excel import and publish-to-Contacts with progress and recovery. The owner must still enter/import reviewed Memberships and publish before relying on membership-based workload calculations.
