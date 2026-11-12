# v1-contacts-policy-update — owner B1 decision and C1 simplification

- Status: claimed, documentation only; 13 November 2026 SGT.
- Owner/model: Codex; coordinator ChatGPT v1; reviewer Claude at exact head.
- Branch: codex/v1-contacts-policy-update
- Base: 02c237cf56cc1805675c0357646087e2c29fc724 (after authorised merges #133/#134).
- Authority: owner permits either Admin or Contacts Power User alone for all Contacts operations, no self-acceptance, full audit, MKE+SMC rejection; owner explicitly declines notifications. Owner requests C1 simplification before implementation scope. Source: docs/coordination/review/pr134-claude-review.md at afae51b4037fc14447a1d70a046b76321fd96be3 and current chat.
- Exact documentation scope: docs/coordination/OWNER_DIRECTIVES.md; docs/v1/contacts/EO_AUTHORITY_READINESS_PLAN.md; docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md; docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md; docs/v1/CODEX_QUEUE_2026-11-13_RESULTS.md; this task; docs/coordination/tasks/v1-authority-evidence-missing.md; docs/coordination/tasks/v1-queue-designs.md.
- Overlap: refreshed main and actual open PR file inventories; no overlap. The two existing v1 task records are included only to close their claims with merge evidence.
- Acceptance: settled permissions consistent across directive/EO/B; no approval or notification requirement retained; matching future tests; owner-side bounded consistent read and cutover epoch recheck; scope/link/whitespace checks; independent review.
- Excluded: application, test, schema/configuration changes; implementation of B/C/D; migration, live data, deployment; merge of this follow-up PR.

## Verification and handoff

Pending documentation checks and Claude review. No skill package executed; apply repository simplicity, ownership and recovery principles. F5 OPEN; official T1B-01/T1B-02 and runtime UAT Not tested. Rollback is documentation only; it does not revoke the owner's decision or change production behaviour.

## Changes and verification

Recorded one additive OWNER_DIRECTIVES row. Updated EO acceptance controls and future tests, B command/state/permission/transaction/audit/test design, and C to a single bounded consistent owner-side read plus epoch/time rechecks. Removed separate approval records/states and notification requirements. Updated results index and closed A/B–D claims with actual merge evidence. Existing production policy and code unchanged; F5 OPEN.

Documentation checks (TZ=Asia/Singapore): eight-document scope including claim; all relative links; git diff --check; prior OWNER_DIRECTIVES rows preserved verbatim. Reproducible scope base is `02c237cf56cc1805675c0357646087e2c29fc724`; allowed files are listed above. Source inspection using `rg -n -i 'approval|approver|pag|manifest'` confirms remaining mentions explain supersession, prohibit extra approval, or defer pagination rather than require it. Future tests are specifications, not executed runtime tests.

Q01–Q05 pass for scoped documentation/owner evidence; Q06 documentation checks pass, exact-head CI pending; Q07 Claude exact-head review pending; Q08 no deployment. No local build or Node/LORD suite run for prose-only changes; GitHub's unchanged CI runs on the branch. Current PR head/results will be recorded in its body, avoiding self-referential hashes. No merge of this follow-up is authorised.
