# LORD v1.8 UAT changelog

The previously queued v1.7.1 scope is implemented as v1.8 UAT at the owner's instruction. v2 LTS is a future acceptance decision.

- Adds booked-for teacher WhatsApp booking success, five-minute collection/return reminders and gated thirty-minute follow-ups. Preserves existing email and Telegram notifications. CES is added to every existing booking email recipient set.
- Adds authenticated task links, teacher consent independent of admin access and current-state checks before sending or recording a response.
- Adds actual-quantity collection exceptions and immediate close/release for confirmed already-returned declarations. Both retain missing-photo incidents with deterministic booking/phase IDs. No fake photos or verified return quantities are created.
- Adds a compact OVERLORD incident indicator, details and append-only review notes. REIGN stores incident totals/details and advances an explicit period only with successful atomic compaction.
- Adds durable booking-success intents to the same booking batch. Single booking requests with a request ID use stable booking IDs for uncertain-outcome recovery.
- Keeps Sheet headers, existing API envelopes, configured deployment credentials, existing function entry points and deferred STARLORD board design. No database, UI framework or dependency was added.
- Updates fresh setup, backend manual, package, template previews, UI mockups, source-backed Archify explanation and UAT checks.

W1–W5 wording: approved by user; provider approval still required. W6/W7 and F1/F2/F3: UAT review. The package is committed and packaged only; it is not automatically deployed. See V18_UAT_GUIDE.md and VALIDATION_V18.md for evidence and live gates.
