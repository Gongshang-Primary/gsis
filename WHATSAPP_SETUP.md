# WhatsApp integration for GSiS Suite v0.9

The current source of truth for configuration is [WhatsApp parameters](docs/WHATSAPP_PARAMETERS.md). It covers Roster Pages, the separate scheduled Worker, the Roster/Contacts/Calendar Apps Script connections, and LORD/OVERLORD/STARLORD's independent notification settings. It includes all 21 Roster route parameter orders, timetable URL buttons, the separate Inbox alert, seven LORD template routes, menu settings, private media, optional durable ingress and dispatch bindings.

Follow [the v0.9 activation guide](docs/WHATSAPP_ACTIVATION_v0.9.md) when installing. Preserve working production values and operational records during an upgrade. Fresh installation examples remain disabled. This package does not change live Cloudflare settings, publish timetables, submit templates or send staff messages.

The Report Absence menu target is now documented as `https://roster.gsps.edu.sg/`, configured through `WHATSAPP_CURRENT_RELIEF_URL`. Update that Production variable and redeploy the app separately; uploading the frontend alone does not change it. The link is an ordinary menu reply, so no new template is needed for this target change.

Roster's `APPS_SCRIPT_URL` belongs to the standalone Roster backend. The same `ROSTER_SERVICE_SECRET` must be present in Roster Pages, the notification Worker, Roster Apps Script and Contacts Apps Script. Do not point the current Roster service back to Deploy or create a second writer. Calendar and LORD retain their dedicated connections and secrets.

The template account `971916692625997`, previously recorded sender ID `1330932803442822` and business root ID `1367896852088548` are non-secret metadata with different roles. `WHATSAPP_ACCOUNT_ID` must match the actual signed callback `entry.id`; do not infer it from those IDs. The installed sender, callback identity, tokens and present live settings were not inspected in this build.

Canonical Roster contract bodies, field order, hashes and button definitions are in `notification-worker/template-contracts.json`. The source records the optional timetable button contract approved on 22 October 2026, and the retained 24 October read-only review also observed approval. Runtime still verifies the current exact contract before sending. Older activation documents retain their historic Pending observations and are not the current route selection instructions. Approved Meta names ending in `_v1`, `_v2` or LORD's `_v18` remain unchanged when Suite code becomes v0.9.

The public policy page remains `https://roster.gsps.edu.sg/privacy.html`; the page and its privacy images must remain reachable without sign-in. It documents recipient permission and withdrawal through the school helpdesk. Publishing that page does not itself record consent.

Incoming messages use the authenticated Roster Inbox flow described in [WhatsApp Inbox](docs/whatsapp-inbox.md). Private media requires its private R2 binding. With optional durable ingress enabled, the scheduled Worker also handles queued messages and needs the appropriate menu/media configuration. Core Inbox capture and replies do not depend on the automated school menu or allocation flag.

Before any deliberately enabled sending, distinguish configuration readiness, current template approval, provider acceptance, actual delivery/read and the user's explicit Roster acknowledgement. No one state proves the others. LORD's current provider acceptance audit does not include delivery/read callback ingestion. An uncertain external send must not be treated as safely unsent.
