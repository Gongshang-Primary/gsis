# Browser-only provider credential setup

Preserve the existing WhatsApp provider credentials and Telegram bot. No token rotation is required for migration. GSiS v1 uses its own separate `GSIS_SECRET`, already configured for v1 and distinct from the v0.9 secret (owner decision, 13 November 2026). This value is shared across the v1 backend services; provider-issued credentials and provider webhook verification remain separate. This guide and wiring do not activate any sender, scheduler, webhook, Google backup or live integration.

## Where to enter values

In GitHub, open **helper-gsps/gsis → Settings → Environments → gsis-v1-owner-approved**. Keep the required reviewer, main-only deployment restriction and disabled administrator bypass. Use **Environment secrets → Add environment secret** for the following values. Do not put them in code, Issues/PR comments, screenshots, `GSIS_V1_SCHOOL_CONFIG`, Environment variables or browser fields.

| Environment secret | Value / use |
| --- | --- |
| `GSIS_SECRET` | Existing separate v1 backend secret; retain the value already configured for v1. |
| `CLOUDFLARE_API_TOKEN` | Existing scoped Cloudflare deployment token; retain it. |
| `WHATSAPP_ACCESS_TOKEN` | Existing WhatsApp access token, unchanged. Used by Roster, LORD and Venues senders. |
| `WHATSAPP_APP_SECRET` | Existing Meta app secret, used by Roster's ingress to verify provider signatures. It is not the access token. |
| `WHATSAPP_VERIFY_TOKEN` | Existing webhook subscription verification token, if independently configured. Existing runtime fallback to `GSIS_SECRET` is preserved; this PR does not change subscription registration. |
| `TELEGRAM_BOT_TOKEN` | Complete existing `numericBotID:secret` token. Used by LORD/OVERLORD monitoring. No separate `TELEGRAM_BOT_ID` variable is needed. |
| `TELEGRAM_WEBHOOK_SECRET` | Existing Telegram webhook header secret, only if receiving Telegram updates through the existing Roster ingress. Outbound LORD monitoring alone does not require a webhook. |
| `GOOGLE_SERVICE_ACCOUNT` | Optional existing service-account JSON for a separately approved Google integration. All eight owner backup adapters consume it; provisioning it does not activate Drive backups. |
| `EMAIL_API_TOKEN` | Optional existing email provider token for Roster, LORD or Venues. |

Only add values needed for the separately approved integration. Missing optional values are skipped, never replaced with invented credentials and never deleted from Cloudflare. Keep Google/provider grants scoped to the intended school services. No live secret has been read or changed by this implementation.

Nonsecret settings belong under **Environment variables → GSIS_V1_SCHOOL_CONFIG**, preserving the rest of the approved JSON:

- `settings.WHATSAPP_PHONE_NUMBER_ID`: Meta's numeric sending phone-number ID, not the telephone number, business account ID or token.
- `settings.WHATSAPP_TEMPLATES_JSON`: the configured mapping of application template keys to exact approved template name, language and ordered parameters. Confirm against the current provider account before activation; a historical repository approval record is not live provider verification.
- `settings.LORD_MONITOR_TELEGRAM_CHAT_ID`: the destination chat/group ID, not the bot ID. Keep the same approved destination where appropriate.
- Existing WhatsApp consent/agreement flags and recipient rules remain required. Credentials alone do not grant permission to contact someone.

## Approved future deployment

After the implementation PR is reviewed/merged and the owner separately authorises deployment, use **Actions → Owner-triggered isolated v1 deployment → Run workflow**, select **main**, enter the existing deployment confirmation, and select **Upload existing provider credentials** only when provisioning those bindings is approved. The new option defaults **off**. The protected environment approval still applies. All of this runs in GitHub; no Wrangler installation is needed on a school machine.

Secrets are passed only to the deployment step and transferred to encrypted Worker secret bindings through Wrangler stdin. They are not embedded in Worker JavaScript, web assets, school configuration, downloadable packages or command arguments. Provider secrets are restricted to the consuming owners; the web Worker receives only the existing separate v1 `GSIS_SECRET`, never provider credentials. Validate secret formats before any migration/deployment side effect.

Selecting the option does not register a webhook or change ownership. The existing initial-deployment validator still rejects `senderOwner`, `schedulerOwner` or `webhookOwner` set to `v1`. Sender/scheduler/webhook cutover requires a separate approved procedure and tests, including recipient consent, current templates, provider signature/header checks and uncertain-delivery recovery. Do not change those JSON fields to bypass that gate. OVERLORD's Telegram monitor needs the existing scheduled-monitor and sender gates as well as a destination and token.

System Health reports configured/not-configured booleans, never token values. No real messages, provider calls or webhook registrations were performed here. Runtime UAT **Not tested**.

## Rollback and evidence

Reverting the workflow/helper stops future optional provisioning; it does not erase previously uploaded Worker secrets or rotate the current bot/token. Any deletion/rotation is a separate owner action. Tests use synthetic canaries to verify default-off selection, consuming-owner scopes, stdin-only transfer and absence from built packages. Existing provider/webhook tests continue to check signature and owner gates. Exact head and outcomes are recorded in the task/PR. F5 OPEN; T1B-01/T1B-02 Not tested.
