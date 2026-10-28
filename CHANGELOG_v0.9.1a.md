# GSiS v0.9.1a LORD patch

25 October 2026, Singapore time. Based on `664462f` (`v0.9.1`).

* LORD and OVERLORD booking Class / TG / Activity and Subject fields accept custom text directly, with catalogue suggestions in the same field. Keyboard and touch selection remain available.
* Typed text stays custom, even when it matches a catalogue label. Explicitly selected suggestions retain stable IDs and reference-generation checks. Drafts and historical booking values survive redraws, validation failures and recoverable retries. Custom entries do not modify Contacts or Deploy.
* Runtime property writes share bounded capacity and pruning rules. Retention replaces count-based eviction of recent receipts. Completed-task retention begins at completion. Pending, uncertain, unreadable, leased, configuration and unrecognised state is preserved.
* Ordinary work leaves room for claims, receipts, recovery and warnings. Diagnostics report bytes, property counts, pending/completed work, uncertain records and pruning outcomes. A maintenance function provides one safe cleanup batch.
* Durable request intent prevents an older edit from replaying over newer changes after its success receipt is lost. Receipt reads fail closed when the result cannot be established. Committed operations retain success with a maintenance warning when only their background checkpoint fails.
* A saved WhatsApp send intent prevents a property-checkpoint failure after provider acceptance from automatically resending the same recipient. Ambiguous work remains visible for reconciliation.
* LORD, OVERLORD, STARLORD and their backend are aligned at 0.9.1a. All other suite components remain at 0.9.1. Existing settings, schema, drafts, persisted cache keys, approved message templates and source-bridge activation are retained.

Install the backend before the three frontend ZIPs. No new credentials or bindings are required. This is a source patch, not a live deployment or a claim of real provider delivery. Live device acceptance and provider transport failures still require operational verification.

Emergency new-absence notices after first publication and before 14:00, targeted publication follow-ups, Calendar cooldown/resume and the future Venues pipeline remain queued.
