# v1-admin-account-create

- Owner request: first Admin can access Admin but cannot add other Admins (14 Nov 2026).
- Model: Codex; coordinator ChatGPT; reviewer Claude at exact head.
- Branch: codex/v1-admin-account-create. Base: f1a5d32fdca3154ebb30d5c4fd8f6a9501185d03.
- Status: claimed. Existing Admin screen only edits accounts; expose the existing Core account-create contract without changing identity or grant policy.
- Exact scope: v1/web/shared/admin.js; v1/web/overlays/admin/index.html; tests/v1-product-admin-create.mjs; this record.
- Preserve verified Google subject/email linkage, explicit admin grants, receipt/idempotency and last-Admin protection. No email-only onboarding, schema, backend, production, live account writes or deployment in this task.
- Open PR overlap: PR144 owns deployment/task evidence for v1-product; other open PRs do not own these UI/new-test paths. Existing claim remains distinct.
- Verification: meaningful browser test through actual isolated Workers/D1, account creation and explicit Admin grant, failed/retried submissions, existing-account editing; canonical no-drift build and full exact-head CI. Runtime UAT not inferred from synthetic checks. F5 OPEN; official T1B-01/T1B-02 Not tested.
- Current v1 engineering policies apply; no additional skill required for this bounded UI wiring.

## Implementation and checks

Added Add account with required school email and Google subject, optional permanent Staff ID and an explicit unchecked-by-default Global Administrator checkbox. Creation uses the existing Core account endpoint; subject/email validation, grant writes, audit and last-Admin guards remain unchanged. New accounts are active; suspension remains an existing-account operation. Successful submissions close the form; pending/failed requests retain the original operation/account identity. No user account was created in the deployed system.

- `TZ=Asia/Singapore npm run build`: passed with no tracked generated drift.
- Initial browser test failed because Playwright's default bundled browser was unavailable locally; no product assertion ran in that attempt.
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-admin-create.mjs`: passed against actual synthetic Workers/D1, covering creation with explicit Admin, a lost committed response and identical retry producing one account, subsequent removal of that grant and foreign-domain rejection.
- `TZ=Asia/Singapore node tests/run.cjs --list`: 1,141 programs; new test discovered.
- `git diff --check`: passed. Exact four-file allowlist maintained; no backend, schema or production source changes.
- Q01–Q05: bounded scope, existing identity/authority/write contracts preserved; meaningful recovery test passed. Q06: local build/new test pass; full suite and product CI pending. Q07: Claude exact-head review pending. Q08: not deployed; runtime UAT remains Not tested, F5 OPEN.
- Limitation: this form requires a verified Google subject. It does not implement email invitation or automatic enrolment. Bootstrap cleanup is a separate deployment/configuration action, not performed by this UI patch. Rollback is reverting these UI/test changes; already committed account grants would remain and require normal audited administration.

## Owner change queue continuation

The four-file scope and counts above describe the original item-1 head `34dafbcd257615df79975c778508156c21c07469`. Its product/full-suite CI passed. The owner subsequently ended the recording-only hold with “work and build. clear changelog item by item.” PR145 and this branch now follow the separate [claimed fourteen-item queue](v1-changelog-20261114.md), including its recorded scope refinements. The [change log](../../v1/accelerated-delivery/CHANGELOG_2026-11-14.md) maps each requirement to implementation and evidence. The consolidated exact head needs fresh CI and Claude review; this historical four-file claim is not a restriction on the later authorised queue or proof that its checks passed.
