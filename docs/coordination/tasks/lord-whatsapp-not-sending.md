# lord-whatsapp-not-sending: LORD / OVERLORD WhatsApp notifications not arriving

- Status: cancelled 29 Oct 2026: owner confirmed LORD WhatsApp is working; report was mistaken. Kept for the source notes below. Optional follow-up only: show why WhatsApp is off in the admin panel.
- Owner/model: Codex (diagnosis may be done by Claude with owner evidence)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 13:00
- Branch: codex/lord-whatsapp-not-sending
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: "changelog: whatsapp notification from LORD / OVERLORD doesn't seem to be sending".
- Files/domains owned: lord-suite/Source/backend/Code.gs (WhatsApp config, queue, delivery), LORD/OVERLORD admin status UI if a visible reason is missing, lord-suite tests.
- Out of scope: Roster notification Worker and its templates.

## Report
Owner: WhatsApp notifications from LORD and OVERLORD do not seem to send. Which notification types and since when: not yet known.

## How LORD sends (source reading, lord-suite/Source/backend/Code.gs)
- Sends directly from Apps Script to the WhatsApp Cloud API (`sendWhatsAppTemplate_`, ~line 5874), not through the Roster notification Worker. It has its own Script Properties and token.
- `whatsAppConfig_()` (~line 5716) is `ready` only if all hold: `LORD_WA_ENABLED=true`, `LORD_WA_ACCESS_TOKEN` set, `LORD_WA_PHONE_NUMBER_ID` numeric, `LORD_WA_API_VERSION` like `v21.0`, and overdue/force-close templates not on the old `_v17` names. If not ready, every WhatsApp path is skipped silently.
- Teacher messages (booking success, collect/return reminders) also need `LORD_WA_TEACHER_ENABLED=true` and `LORD_WA_LORD_BASE_URL` (https origin) (`scheduleTeacherWhatsApp_`, ~line 6960). Follow-ups need `LORD_WA_FOLLOWUPS_APPROVED=true`.
- Default template names are `lord_*_v18` (cart overdue, force close, booking success, collect/return reminder, follow-ups). Each must exist and be APPROVED in Meta under the same WhatsApp Business account as the phone number id, in language `LORD_WA_LANGUAGE` (default `en`).
- Alerts are queued and sent by time-driven triggers (`checkAndSendOverdueTelegramAlerts`, `processSecondaryQueueTrigger`, maintenance). A missing trigger means nothing sends. Alerts expire after 24 hours (`whatsapp_expired`).
- Provider failures are recorded as maintenance failures with "WhatsApp rejected the request (HTTP x, code y)". HTTP 401 / code 190 = expired or revoked token.

## Diagnosis checklist (owner evidence needed, no secrets in chat)
1. LORD Apps Script → Project Settings → Script Properties: confirm the presence (not values) of the properties above and the values of `LORD_WA_ENABLED`, `LORD_WA_TEACHER_ENABLED`, `LORD_WA_API_VERSION`, template names.
2. Triggers page: confirm the LORD time-driven triggers exist and their last run is recent without errors.
3. Executions page: any "WhatsApp request failed (HTTP …, code …)" in the last 2 days.
4. LORD/OVERLORD admin maintenance or background-task panel: any `whatsapp_*` failure entries.
5. Meta WhatsApp Manager: the `lord_*_v18` templates exist and are Approved for the account that owns `LORD_WA_PHONE_NUMBER_ID`.
6. Whether the token is the same system-user token Roster uses, or a separate one that may have expired.

## Likely fixes by finding
- Not ready / disabled flag: set the property; add a visible "WhatsApp disabled: <reason>" line in the admin status so it is never silent.
- Token expired: issue a permanent system-user token; record expiry checks.
- Template missing or not approved: submit or rename; align language.
- Trigger missing: reinstall via the existing setup function.
- Code fault: fix with a regression test in lord-suite/tests.

## Acceptance
- A test booking produces a WhatsApp to the test teacher, and a forced overdue cart produces the overdue alert, both visible as sent in the admin panel.
- If WhatsApp is not ready, the admin panel states the exact missing condition.
