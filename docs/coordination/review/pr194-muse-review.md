# Review: PR #194 — v1 Deploy role matrix and published permissions

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `9b3e90c48d8820933fa3866ccce8d003bfc9d5ab`.
- Base / accepted claim: `f822685a90d6c872b593eb8663997b9fbc990af7`.
- CI run: [43903146794](https://github.com/helper-gsps/gsis/actions/runs/43903146794), green, all 5 jobs (4 regression shards + full-suite), at the exact head — 1,221/1,221 Node programs, 40/40 LORD checks in each shard. Product/package CI [43903210291](https://github.com/helper-gsps/gsis/actions/runs/43903210291) success at the exact head (120 product programs; the duplicate PR-triggered product run 43905830050 was still in progress when this record was written and is not needed for the verdict).
- PR: https://github.com/helper-gsps/gsis/pull/194 (Codex, branch `codex/v1-deploy-role-membership-matrix`).
- Task record: `docs/coordination/tasks/v1-deploy-role-membership-matrix.md` (in the PR; reviewer line already names Muse).

## What it does

Restores the v0.9-style role Membership matrix in v1 Deploy. HR Settings → Membership shows Role Shortform, Formal Role Name, ten grouping checkboxes (SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK), EO appointment level and a separate explicit EO yes/no/Not set field; it works with no teachers. The individual staff Membership editor remains below it; matched role rows control the ten managed labels while custom labels stay editable separately. Saving edits changes only the selected draft; publishing applies explicit Memberships and SMC/EO/School Leader values through Contacts, then Core uses its existing permission rules. The owner's 16 November clarification permits publication to change the publisher's own authority; Global Admin and explicit module grants remain separate and are never granted by this path.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-deploy-role-memberships.mjs`: exit 0. "PASS role matrix real Workers/D1: empty school, exact native edit, bounds, managed/custom groups, duplicate, authority isolation, canonical import, stale/foreign/denied checks and restart retry".
- New test `tests/v1-product-authority-publication.mjs`: exit 0. "PASS 8 authority publication groups; synthetic Worker/D1 only; hosted UAT Not tested" and "PASS lost response and Worker restart preserve receipts, history and missing EO".
- New browser test `tests/v1-product-deploy-role-memberships-browser.mjs`: exit 0. "PASS built role matrix on empty school, edit/delete/checkbox/EO save and reload, Core filter/sort, canonical download/import and real v0.9 Excel preview/apply, foreign/formula rejection, explicit groups without grade inference, custom memberships, read-only authority, self-demotion Publish with protected-state clearing and Admin recovery; real Workers/D1, synthetic data only (30750ms)".
- Named regressions, all exit 0: `v1-product-deploy-workbooks`, `v1-product-membership-publication`, `v1-product-contacts-direct-authority`, `v1-product-contacts-projection`, `v1-product-core-contacts`, `v1-product-deploy-memberships-browser`, `v1-product-contacts-projection-browser`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 25 claimed allowlist paths, 1,449 insertions / 120 deletions. `git diff --check` clean.
- Secrets scan of the diff: none (one grep hit is the substring "sk-" inside the task-record word "task-record").
- Read the security-critical code in full: `v1/services/contacts/authority-publication.mjs` (tuple shape; principal proof binding; per-field frontiers with publication `<` / direct `<=`; per-field eligibility so a later direct edit cannot suppress an unrelated SMC removal; at least one eligible field or 409); `v1/services/deploy/role-memberships.mjs` (300-row cap; one blank-role row; duplicate shortform rejected; explicit checkbox values only; EO tri-state; MKE+SMC rejected in both normalize and authorityValue; managed labels replace only managed labels, custom labels preserved; per-person editor cannot contradict its role row); `v1/services/contacts/service.mjs` (authority items allowed only with the marker; authority publications are not pushed to the outbox — recovery needs a fresh interactive Deploy publish decision, a scheduler cannot impersonate a resumer; staff update requires "update", asserts the publication principal, applies only eligible fields, writes per-field frontier guards and audit with proposer and accepter recorded separately); `v1/services/core/contributions.mjs` (authority proof verified with the membership-only path plus a fresh resumer decision: matching operation/publication/version/batch, body digest, `resumerValidated`, session check; resumer becomes the actor; field allowlist bypass replaced by tuple validation); `v1/services/contacts/membership-publication.mjs` (resumer-changed prepared attempts are aborted first, a concurrently committed receipt wins; contribution IDs keyed by field; settled counts include authority); `v1/services/deploy/service.mjs` (publish validates authorityValue for every teacher, MKE+SMC rejected at publish; 512 cap counts role-mapped teachers; envelope marker only when the version has a role matrix; syncMemberships fences the bookkeeping attempt and returns `saved:false` with recovery info on AUTHORITY_CHANGED instead of fabricating a receipt; verifyDelivery validates the resumer proof); `v1/services/deploy/model.mjs` and `v1/services/deploy/workbooks.mjs` (matrix preserved across mergeContacts; managed-label enforcement in per-person edits and workbook import; legacy import only by explicit Role Membership flow with preview); `v1/web/shared/deploy-ui.js` and `v1/web/shared/deploy-publication.js` (matrix editor with expected-value revision checks; v0.9 grade inference disabled only for explicit v1 matrices; recovery notice retains only publication/version/operation references); `v1/migrations/contacts/0006_authority_publications.sql` (one additive table with CHECK constraints on field and source_kind).
- Read the contract doc: this is the matrix/authority slice only; appointment grade remains planning data; completion of every ordinary deployment-tag or role-catalogue publish-back rule is separate work.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner requests for the v0.9 role page and for SMC/EO/SL values to grant application permissions on publication, with the self-publication exception; exact 25-path allowlist only.
- Q02 Design and ownership: pass. Deploy owns version mappings and immutable intent; Contacts owns current authority records, history, audit and ordering; Core keeps its existing permission rules and reads current Contacts evidence.
- Q03 Security and privacy: pass. No auth change; authority writes require the proof-bound publication path with a fresh resumer decision; direct self-acceptance remains prohibited; MKE+SMC rejected; EO never inferred from grade, role or name; Global Admin and module grants unreachable from this path.
- Q04 Concurrency and recovery: pass. Per-field sequence frontiers order direct edits and publications; atomic per-owner commits; bounded batches; lost responses retain original identities; self-removal returns `saved:false` with recovery instead of a fabricated receipt.
- Q05 Resources and maintainability: pass. 300-row / 512-person / eight-person batches; no new dependency.
- Q06 Verification: pass. All three new tests and all seven named regressions pass locally; exact-head Node/LORD CI and product/package CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, live data, credentials or provider activation; additive Contacts migration 0006 requires a fresh private D1 backup before any separately authorised hosted migration; retain frontier/history on rollback and reconcile new marked publications before reverting to an older implementation. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

HR Settings → Membership now opens the role matrix, with the separate staff editor below; Add/Delete, explicit EO, Core filtering/sorting and canonical/legacy import preview are available. Publish explains the permission changes including the publisher's own values, distinguishes per-field outcomes and provides recovery after self-removal. No app permission is granted merely by saving a draft or entering free-text labels.
