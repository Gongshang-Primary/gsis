# v1-inbox-alert (W5)

- Status: implemented; PR open for Muse review
- Owner/model: Claude. Reviewer: Muse at the exact head. Merger: GPT.
- Project: v1. Updated 22 Nov 2026 SGT. Branch `claude/v1-inbox-alert` from main `ab195175`.
- Source: `docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` row 24 / W5. Improvement (v0.9 never sent it: its template was never on Meta).

## Owner decisions (21 Nov 2026)

Build the inbox alert as an improvement; **bypass quiet hours**; submit a new template.

## Template, trigger and sample

- Template `inbox_alert` → `gsis_v1_inbox_new_message` (Meta ID 1798304818089770, **PENDING**, UTILITY). Static button "Open Roster" → `https://gsis.gsps.edu.sg/roster/`. Fields: {{1}} duty SMC name, {{2}} sender name.
- Trigger: a **known staff member or unknown sender** sends **free text** that lands in the Roster inbox (shared reply action `menu`). Not for menu taps (they get an automatic reply) or urgent-message texts (already forwarded as `urgent_forward`). Once per sender per day per duty SMC (`inbox-alert:<date>:<sender>:<smc>`). Sent in quiet hours. Queued only when `inbox_alert` is mapped in `WHATSAPP_TEMPLATES_JSON`, so nothing builds up before approval. Send-time duty-SMC recheck applies (kind `smc_alert`).

> *New School WhatsApp Message*
>
> Hi Mr Lim Wei Jie, a new message from Mr Goh Kok Wah is waiting in the GSiS WhatsApp Inbox.
>
> Open Roster to review and reply using the button below.
>
> Thank you.
>
> [Open Roster]

## Changes

- `v1/services/roster/inbound.mjs`: `queueInboxAlert`, `inboxAlertConfigured`; identified senders in `processInbound`; unknown senders queue the fan-out job; audit records `inboxAlerts`.
- `v1/services/roster/service.mjs`: `roster-inbox-alert` fan-out handler and registration.
- `tests/v1-product-roster-adhoc-delivery.mjs`: fan-out queues one alert per duty SMC, sends nothing itself.
- `tests/v1-product-roster-whatsapp-public-menu.mjs`: unknown free text queues one fan-out; menu numbers add none; urgent forward still impossible.
- `tests/v1-product-roster-inbox-alert.mjs` (new).

## Unknown senders (owner 22 Nov 2026: "alert duty SMC")

Free text from a number not matched to staff (public menu reply `menu`) queues one fan-out job `roster-inbox-alert`, id `inbox-alert-unknown:<date>:<number>` (once per number per day). At dispatch it reads the current duty SMCs and inserts one `inbox_alert` notification each (id `inbox-alert:<date>:<number>:<smc>`). The sender shows as "an unknown number ending 1234". Menu numbers and buttons do not alert. Urgent Message stays restricted to staff.

## Activation

After Meta approves: map `inbox_alert` to `gsis_v1_inbox_new_message`, `button: "static"`, parameters in body order. No live change made.
