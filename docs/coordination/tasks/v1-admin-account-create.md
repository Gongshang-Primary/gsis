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
