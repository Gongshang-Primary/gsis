# v1-contacts-policy-update — owner B1 decision and C1 simplification

- Status: merged; PR136, reviewed head `8d62eda95bb1e38ecab0ae0eeabcc67991623d10`, carrying merge `59a1bd832743d3d53a064ea5c96e0aaec5c322a8`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
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

## 15 November 2026 — Claude R-1 and merge preparation

Owner requested all applicable PRs be merged in logical order. Claude approved the document at `0081eea4e8924691818b68d18c5d53d6927985fa`, subject to R-1, in `docs/coordination/review/v1-pr174-175-drafts-claude-review.md`. Refreshed the obsolete no-Contacts-store statement against main `c69d30c682e11f10421e42efa746edc9b8729777`; the existing D1 owner and readiness routes are now identified without claiming hosted proof. The original design and future acceptance requirements remain historical specifications.

Merged current main into this branch without changing application files. The only merge conflict was the OWNER_DIRECTIVES insertion: preserved both new 15 November rows and every main line, then retained the original 13 November B1 row verbatim. No owner policy was changed. Remaining edits are the readiness paragraph/status and this handoff, within the existing eight-document scope. Relative-link, scope and whitespace checks pass; no local application suites were run for prose. Fresh CI and Claude exact-head recheck are pending; the current exact head is recorded in PR136. Earlier no-merge task wording is historical; the current owner merge instruction applies once these gates pass. F5 OPEN; runtime UAT and official T1B-01/T1B-02 Not tested.

Check detail: an initial staged whitespace check against the old branch also inspected unrelated files inherited from current main and reported their pre-existing whitespace. The relevant check compares the resulting tree with current main. For the frozen CRLF specification, `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --cached --check origin/main` recognises its preserved CRLF endings; that scoped check passes. No inherited application/licence/test whitespace was changed.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR136](https://github.com/helper-gsps/gsis/pull/136) at reviewed head `8d62eda95bb1e38ecab0ae0eeabcc67991623d10` is included in main by [merge `59a1bd832743d3d53a064ea5c96e0aaec5c322a8`](https://github.com/helper-gsps/gsis/commit/59a1bd832743d3d53a064ea5c96e0aaec5c322a8). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/42873cd068c24c54d4738be5503942333bc1e9ae/docs/coordination/review/v1-pr163-136-137-179-claude-review.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

[The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
