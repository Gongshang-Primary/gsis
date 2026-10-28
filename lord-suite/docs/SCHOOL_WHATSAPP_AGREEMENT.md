# LORD v1.8.1 UAT: school-managed WhatsApp notifications

This patch updates both Code.gs and the LORD frontend. This is the committed v1.8.1 UAT patch. Deployment remains a separate manual step.

Operational WhatsApp notifications use the existing school staff agreement. There is no individual approval or opt-out while this policy is active. Historical personal preferences remain in the Event Log but cannot suppress delivery. LORD no longer exposes a WhatsApp notifications link on the home page. Missing mobile numbers still require correction in Contacts. Admin alerts still require an active administrator role; teacher notices go to the teacher the booking is for.

## Deployment

1. Back up the live Code.gs. Replace it with Source/backend/Code.gs, preserving any newer local configuration values. Keep the existing manifest and Script Properties, including the private WhatsApp token.
2. Publish a new version of the existing Apps Script web-app deployment, keeping its URL and access settings.
3. Deploy LORD_V1.8.1_Cloudflare.zip to the existing LORD Cloudflare Pages project. OVERLORD and STARLORD require no frontend update.
4. Run enableLORDSchoolWhatsAppAgreement once in the Apps Script editor. The function records the school policy without changing sending switches or triggers. Enabled sending switches and the minute trigger can then process eligible pending notices.
5. Confirm OVERLORD grants administrator access without a personal consent checkbox. Make a test booking for a teacher with a valid Contacts mobile and confirm actual receipt and the booking link.

## Validation and rollback

79 automated checks passed using simulated services: 15 school policy, 2 school-managed frontend, 31 v1.8, 26 admin WhatsApp and 5 existing frontend checks. Live delivery and browser acceptance remain to be confirmed. No live messages were sent during preparation.

The policy is stored in LORD_WA_SCHOOL_AGREEMENT. Removing that property restores the previous per-user agreement behavior and frontend controls; retained personal records then apply again. Booking, custody, schema, API routes, template bodies and scheduling thresholds are unchanged. No new trigger is needed.

## Change log

School policy now overrides historical personal opt-outs. Preference mutations are rejected while school-managed. The preference response adds schoolManaged; LORD renders status only when true. Existing fresh installations without this policy retain their prior behavior. This remains v1.8.1 UAT.
