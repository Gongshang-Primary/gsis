> Current release: GSiS Suite v0.9.1. For the Contacts and published Deploy reference bridge, also follow [gsis-integration/SETUP.md](gsis-integration/SETUP.md). Historical function names and provider template names remain compatibility identifiers.

# WhatsApp setup for LORD in GSiS Suite v0.9.1

Keep sending disabled while reviewing templates. This release does not submit templates or send test messages automatically. Telegram and existing booking email continue independently.

Preserve an existing installation's `LORD_WA_*` Script Properties when installing GSiS v0.9.1. Its core configuration moves to Script Properties and Pages bindings before code replacement; follow [the setup guide](gsis-integration/SETUP.md). `LORD_PROXY_SECRET` in the three Pages projects is the backend proxy credential, not the WhatsApp access token. This source release does not deploy the apps or change live settings.

Use Review/LORD_V1.8_UAT_WHATSAPP_REVIEW.html and LORD_V1.8_UAT_WHATSAPP_TEMPLATES.json. W1–W5 have owner-approved wording; W6/W7 need acceptance. Replace the example host in each URL template with your own LORD HTTPS origin and the correct flow. Obtain Meta approval before enabling a template. See V18_UAT_GUIDE.md for all property names, flows and timing gates.

1. Register your own sender in WhatsApp Business or retain your existing verified sender. Keep its access token server-side in Apps Script Properties, never in a Worker or browser asset.
2. Set LORD_WA_ACCESS_TOKEN, LORD_WA_PHONE_NUMBER_ID, LORD_WA_API_VERSION and LORD_WA_LANGUAGE. Use the current supported Graph API version verified for your business. Set LORD_WA_ENABLED=false initially.
3. Set LORD_WA_OVERDUE_TEMPLATE=lord_cart_overdue_v18 and LORD_WA_FORCE_CLOSE_TEMPLATE=lord_force_close_v18 after approval. Old v17 template names block readiness because their parameter/body contracts differ.
4. Populate Contacts D with GSPS email and F with a valid mobile. OVERLORD Settings lets an active administrator grant admin access with recorded WhatsApp agreement. A user should sign out and in after a role change.
5. Operational notifications use the configured school agreement. LORD no longer shows a WhatsApp notifications menu link. Contacts remains authoritative for mobile numbers and school email addresses. Administrator grants in OVERLORD are separate from notification eligibility and do not require a personal consent checkbox.
6. Set LORD_WA_LORD_BASE_URL to the exact LORD origin and enable LORD_WA_TEACHER_ENABLED only when W3–W5 are approved and tested. Enable LORD_WA_FOLLOWUPS_APPROVED only after accepting W6/W7 and obtaining provider approval.
7. Ensure the existing processSecondaryQueueTrigger runs every minute. Do not install duplicate triggers. Enable LORD_WA_ENABLED only for authorized UAT recipients, then verify accepted-message audit records and actual phone receipt separately.

Deep-link flow values: bookingSuccess=view; collectReminder=collect; returnReminder=return; collectionFollowup=collection-response; returnFollowup=return-response. Body parameter order is defined in the template JSON and teacherMessageValues_. W1 has nine parameters and an inline contact URL; it has no wa.me URL button.

Cloud API request documentation: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/ and https://www.postman.com/meta/whatsapp-business-platform/ . The URL button sends the suffix as a text parameter. Utility classification, approval and inline link acceptance are provider decisions. Do not treat an HTTP acceptance as delivered/read status.

Disable by setting LORD_WA_ENABLED=false. Preserve queue and receipt properties while diagnosing failures. A send accepted by Meta but not checkpointed locally may be duplicated on retry. No webhook, delivery-status ingestion or WhatsApp quick-reply processing is included; responses occur in authenticated LORD.
