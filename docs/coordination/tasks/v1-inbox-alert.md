# v1-inbox-alert (W5)

- Status: implemented; PR open for Muse review
- Owner/model: Claude. Reviewer: Muse at the exact head. Merger: GPT.
- Project: v1. Updated 22 Nov 2026 SGT. Branch `claude/v1-inbox-alert` from main `ab195175`.
- Source: `docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` row 24 / W5. Improvement (v0.9 never sent it: its template was never on Meta).

## Owner decisions (21 Nov 2026)

Build the inbox alert as an improvement; **bypass quiet hours**; submit a new template.

## Template, trigger and sample

- Template `inbox_alert` → `gsis_v1_inbox_new_message` (Meta ID 1798304818089770, **PENDING**, UTILITY). Static button "Open Roster" → `https://gsis.gsps.edu.sg/roster/`. Fields: {{1}} duty SMC name, {{2}} sender name.
- Trigger: a **known staff member** sends **free text** that lands in the Roster inbox (shared reply action `menu`). Not for menu taps (they get an automatic reply) or urgent-message texts (already forwarded as `urgent_forward`). Once per sender per day per duty SMC (`inbox-alert:<date>:<sender>:<smc>`). Sent in quiet hours. Queued only when `inbox_alert` is mapped in `WHATSAPP_TEMPLATES_JSON`, so nothing builds up before approval. Send-time duty-SMC recheck applies (kind `smc_alert`).

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

- `v1/services/roster/inbound.mjs`: `queueInboxAlert`, `inboxAlertConfigured`; called in `processInbound` for identified senders; audit records `inboxAlerts`.
- `tests/v1-product-roster-inbox-alert.mjs` (new).

## Open point for the owner

Messages from **unknown senders** (not matched to staff) get the public menu and are stored in the inbox, but this change does not alert for them. Say if they should alert too.

## Activation

After Meta approves: map `inbox_alert` to `gsis_v1_inbox_new_message`, `button: "static"`, parameters in body order. No live change made.
