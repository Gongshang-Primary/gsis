# Protected browser-based provider credential setup

- Status: claimed; 14 November 2026 Asia/Singapore. Model/owner Codex; coordinator ChatGPT; independent exact-head reviewer Claude.
- Branch: codex/v1-provider-secret-setup. Main observed abfa870. Base PR145 f1efe8a687cb640dae8731fe674acb72b33e7f9b; independent of PR146/147/storage changes. Read main PR145 re-review at 0a6b6d4: approved L1, no merge authority inferred.
- Authorisation: owner requests remaining queue including GitHub environment location for WhatsApp tokens / Telegram bot ID; preserve current provider tokens outside deployed material. Build wiring and guide only; no real credential access, upload, rotation, messages, webhook registration, sender/cutover, deployment or environment change.
- Exact scope: .github/workflows/v1-deploy.yml; scripts/v1/deploy.mjs; scripts/v1/provider-secrets.mjs; tests/v1-product-provider-secret-setup.mjs; docs/v1/accelerated-delivery/PROVIDER_SETUP.md; this task.
- Implementation: optional explicit credential-upload input on protected owner-triggered workflow, default false. Keep environment reviewer/main gate and initial sender/webhook/scheduler cutover rejection. Select secret bindings only for their consuming owners, never web/browser/config JSON/artifacts. Keep GSIS_SECRET common backend secret and unchanged provider credentials. Document exact secret names, nonsecret provider IDs/chat IDs, templates/consent/ownership gates and browser-only procedure.
- Verification: synthetic secret canaries/owner selection, default-off, no public/artifact inclusion, unchanged provider webhook verification and send-owner protections, canonical build and product/full exact-head CI. No live tests or activation; F5 OPEN, T1B-01/T1B-02/runtime UAT Not tested.

## Implementation and evidence

Q01–Q05 Pass: default-off explicit credential upload, main-only workflow plus existing protected environment, scoped consuming-owner bindings, preflight validation before migration/deployment, stdin-only secret transfer. The initial-deployment validator still rejects integration ownership cutover. Existing tokens unchanged; no public secret fields or new dependency. Optional Google service account is scoped to the eight actual owner backup consumers; this does not activate backups. Details in PROVIDER_SETUP.md.

Q06 focused Pass (`TZ=Asia/Singapore`): `node tests/v1-product-provider-secret-setup.mjs` verifies every owner/default-off, invalid token format, workflow scope, preflight order and synthetic canaries absent from all built files. Existing `v1-product-providers.mjs` and `v1-product-webhook-integration.mjs` pass; all provider requests are synthetic and live egress is not used. `npm run build` passes/no tracked generated drift. Full product and Node/LORD exact-head CI pending at commit time; PR records results.

Q07 Claude review pending. Q08 no deployment, credential upload/rotation, provider activation or live test authorised by this PR. Rollback stops future optional provisioning but does not delete existing Worker secrets. F5 OPEN; T1B-01/T1B-02/runtime UAT Not tested.
