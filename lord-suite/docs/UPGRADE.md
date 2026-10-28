> Current LORD patch: v0.9.1a over GSiS Suite v0.9.1. For an existing v0.9.1 installation, use [patch installation](../../HOTFIX_v0.9.1a.md); preserve the settings and triggers already configured. The instructions below describe the original upgrade from standalone LORD. Historical function names and provider template names remain compatibility identifiers.

Photo upload reliability requires adding Advanced Google Drive API v3 alongside the existing Sheets v4 service. Follow [the photo upgrade steps](PHOTO_UPLOAD_RELIABILITY.md) before publishing this code. Existing settings and Sheet headers are unchanged.

# Upgrade an existing LORD installation to GSiS Suite v0.9.1

GSiS v0.9.1 includes the correction that moves configuration from source into Apps Script Properties and Cloudflare Pages settings. This source release does not deploy the apps or change live settings. Use clean runtime files with the separate private settings ledger. The earlier `GSiS_v0.9_Deployment_Configured_LORD.zip` is superseded.

1. Back up current Code.gs, Script Properties and Pages settings; record the published Apps Script version and three Cloudflare deployments.
2. Copy the existing nine backend values into LORD → Apps Script → Project Settings → Script Properties using the exact names in [GSiS setup](gsis-integration/SETUP.md); preserve the proxy secret and both booking peppers exactly.
3. In Cloudflare → Workers & Pages → each LORD, OVERLORD and STARLORD project → Settings → Variables and Secrets, add the Production text variable `LORD_BACKEND_URL` and encrypted secret `LORD_PROXY_SECRET`; use the existing `/exec` URL and the same proxy value as Apps Script.
4. Preserve existing `GOOGLE_CLIENT_ID` and `LORD_SESSION_SECRET` on LORD and OVERLORD, plus all existing `LORD_WA_*` Script Properties and notification state.
5. Verify the settings are saved before replacing any code; old code ignores them, while scheduled triggers use new Apps Script code as soon as it is saved.
6. In a quiet period, replace Code.gs with the clean v0.9.1 source; keep the existing manifest and Google Sheets API v4 service.
7. Run `selfTestLORDV17` and inspect every failed entry; it reads configuration and may warm caches, but creates no transaction records.
8. Publish a new version of the existing web-app deployment, keeping the same `/exec` URL and access settings.
9. Deploy the clean LORD, OVERLORD and STARLORD ZIPs to their existing Pages projects after the Production settings are ready.
10. Confirm backend health reports 0.9.1 and each app shows v0.9.1; sign in as an administrator and use OVERLORD → Settings → Shared data → Read latest from Sheets once.
11. Follow `VALIDATION.md` on a nonproduction copy before relying on the new release during a busy session.

If using `configure_instance.py` to prepare the private ledger, set `existingInstallation: true` in the private instance JSON. This preserves supplied legacy booking peppers and does not generate a replacement for an unknown session secret. Its separate `deployment-settings.json` lists the settings to add; generated runtime files contain no credentials. Keep both JSON files private and outside deployment ZIPs.

No schema migration, data clearing, trigger reinstall, REIGN run, property cleanup or draft reset is required. Keep internal cache, draft and receipt keys even where their names include older versions. Existing Sheet schemas are unchanged. Configure WhatsApp separately using WHATSAPP_SETUP.md; preserve an existing installation's sending gates and credentials.

If a schema check fails, reconcile the named tab from a backup. Setup now refuses mismatched headers and cannot repair arbitrary reordered data. Do not rename headers to make a check pass without moving their corresponding values correctly.

For rollback, restore both saved Code.gs and the prior published web-app version, then the previous three Cloudflare deployments. Preserve valid records, the added configuration properties, Pages settings and user drafts. Restoring just the published web app leaves scheduled triggers running the newer saved source.
