# v1 Roster: public WhatsApp menu with restricted Urgent Message (from #182)

- Task ID: `v1-roster-whatsapp-public-menu`
- Model: `Antigravity`
- Branch: `antigravity/v1-roster-whatsapp-public-menu`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `15fb5ee` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-roster-whatsapp-public-menu.md`
- `v1/services/roster/inbound.mjs`
- `v1/services/roster/service.mjs`
- `tests/v1-product-roster-whatsapp-public-menu.mjs`

## Scope
1. **Owner-requested public WhatsApp menu (`v1/services/roster/inbound.mjs`)**:
   - Export `WHATSAPP_PUBLIC_MENU_TEXT` with the exact owner notice (`*This number is no longer actively manned by staff member*`) and 5-item menu (`1. Report Absence`, `2. Urgent Message`, `3. School Layout`, `4. Collect / Return ICT`, `5. Call General Office`).
   - Display the menu and public actions (`1`, `3`, `4`, `5`) to any inbound WhatsApp sender without an identity gate, including when Core webhook authorization returns `RECIPIENT_UNMATCHED` (unknown/ambiguous sender).
   - Keep `2. Urgent Message` strictly restricted to uniquely verified staff / engaged relief-teacher senders; unknown or ambiguous senders selecting `2` never open an urgent session or queue duty-SMC notifications.
2. **Bounded public-menu reply dispatch (`v1/services/roster/service.mjs`)**:
   - Handle `roster-public-menu-reply` outbox jobs in `dispatchRosterJob()`, verifying the durable `roster_inbox` row, exact sender mobile match, and 24-hour inbound reply window before dispatching via `dispatchProvider`.
3. **Regression test (`tests/v1-product-roster-whatsapp-public-menu.mjs`)**:
   - Verify unknown senders receive the exact 5-item public menu notice and can invoke public items (`1`, `3`, `4`, `5`).
   - Verify unknown senders selecting `2. Urgent Message` are refused without creating urgent sessions or duty-SMC outbox jobs.
   - Verify uniquely verified staff senders receive the same updated 5-item menu notice and retain normal Urgent Message flow.
