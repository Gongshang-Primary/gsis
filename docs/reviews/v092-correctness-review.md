# GSiS 0.9.2 independent correctness and security review

Review date: 2026-10-25. Comparison baseline: `f1069a1`. Target: the evolving `release/v0.9.2` working tree. Applied the Vercel code-review workflow and the explicitly requested Thermonuclear correctness rubric. This review made no implementation changes and contacted no live school or notification services.

## Final review status

No open material finding remains from this pass after the scoped correction review. The six findings below were corrected during development and verified as described. This is not a guarantee against undiscovered defects or a claim of production validation.

## Findings corrected and verified

1. **P1 — Confirming a suspended plan can erase unmatched teachers' room occupancy.** `backend/RosterVenues.gs`, `rosterVenuesDay_`, replaces all baseline teachers with `GSISRosterStapler.effectiveDay(confirmed.plan, base).teachers`. The plan only contains teachers that the ordinary Roster context matched to Contacts (`backend/RosterOperations.gs`, `rosterOperationsContext_`); unmatched baseline blocks are intentionally excluded from that planning context. The new Venues baseline projection includes those blocks, but the confirmed-plan branch drops them again. A targeted VM reproduction with a matched teacher using F1-16 and an unmatched teacher using Lab returned only F1-16 after confirming a plan for the matched teacher. The unchanged Lab lesson then looks free. Preserve baseline blocks outside the proven suspended-plan scope, or make the date unavailable until complete replacement can be proved. Do not infer that absence from the plan means cancellation.

   **Resolved:** the confirmed projection now appends baseline rows omitted by `effectiveDay`, while retaining the confirmed plan for its included teachers. The new matched-only plan regression passes in `node tests/venues-sources.cjs`; the unmatched Lab remains occupied.

2. **P2 — Ordinary published changes retain the superseded baseline room.** `backend/RosterVenues.gs`, `rosterVenuesDay_`, builds identities from manual name bridges and confirmed-plan teachers only, then applies published cells by Staff ID. Direct Contacts name matches normally do not have manual bridges. Those baseline rows receive `unmatched:<index>` IDs, so publication rows are appended instead of replacing them. A targeted reproduction of an ordinary published F1-16-to-Hall move returned both F1-16 and Hall. Apply the same unambiguous identity semantics as the source publication, using durable timetable-name identity or a proven baseline match; retain truly unmatched blocks conservatively.

   **Resolved:** the source uses canonical `matchTimetableNames` rules against immutable published names and existing bridges, with seeding disabled on a copied state wrapper. The no-manual-bridge regression also covers an honorific in the publication name and passes: Hall remains occupied and the superseded F1-16 interval is removed.

3. **P2 — A normal published class combination makes the whole date unavailable.** `backend/RosterVenues.gs`, `rosterVenuesDay_`'s `add` helper, rejects all room labels containing ` + `. The established `dailyPublication` function joins the component cell values with that delimiter for combination assignments. Even an unambiguous `F1-16 + F1-16` therefore throws `VENUES_ALIAS_AMBIGUOUS`; `rosterVenuesSource_` catches it and marks the complete day uncovered. A targeted VM reproduction confirmed that result. Interpret established combination-cell component aliases and deduplicate identical components, while retaining fail-closed handling for genuinely ambiguous mappings.

   **Resolved:** established whitespace-delimited combination components are projected separately and deduplicated by room/period; newlines remain invalid. The regression with `F1-16 + F1-16 + Hall` passes with one F1-16 interval and an occupied Hall interval. Downstream alias mapping still rejects unknown or ambiguous component aliases.

4. **P2 — Queued email notices cannot recover from corrected contact addresses.** `venues-backend/Notifications.gs`, `venuesExpandNotifications_` and `venuesClaimNotification_`, materialize email delivery recipients once and then only validate them. When an unsent recipient's email changes in Contacts, the old delivery becomes `setup-required`; expansion does not rebuild existing deliveries and a manual retry does not change the recipient. A targeted VM reproduction with `old@gsps.edu.sg` queued and `new@gsps.edu.sg` authoritative returned no claim and kept the stale address. Initially missing email addresses have the same problem. Reconcile unsent delivery targets to both current authorized staff addresses, preserving sent and uncertain receipts so contact correction does not cause duplicate sends.

   **Resolved in transport commit `3592d84`:** new deliveries carry stable contact-field identities. Expansion updates unsent destinations from current Contacts fields, adds a newly available second address, and supersedes removed unsent fields. An independent VM harness confirmed a corrected address becomes claimable, an initially missing address recovers, the second current address gains a delivery, and sent/uncertain/in-flight receipts retain their original destination and status without a duplicate field delivery.

## Additional findings corrected during this review

- **P2 — Pending approval requests omitted approvers from notification intent.** Initially `book` notified only requester/current owner. The current `notify` implementation also includes room managers for pending booked/amended occurrences. A fresh targeted harness confirmed the assigned owner is now included.
- **P2 — An inactive staff member's grant could bypass last-administrator protection.** Initially the check counted effective grants without verifying the referenced staff member remained active. The current check also requires an active `people` record. A fresh targeted harness confirmed that revoking the final usable administrator now raises `LAST_ADMIN` even if an inactive person's admin grant remains.

## Examined boundaries and evidence

- Traced Roster begin/complete/recovery through canonical register and operations commits, including ambiguous acknowledgements and the fresh-source fingerprint check that permits harmless operational writes while a fence remains pending.
- Inspected independent lock acquisition and source activation. Venues releases its writer lock before source/provider requests; no reverse Roster/Venues lock cycle was established. Activation checks the captured source revision, pending tokens, committed source keys and policy revision before replacement.
- Inspected signed source and service envelopes, Worker Access/Google identity verification, spoofable-header handling, durable mutation nonces, fresh Contacts actor resolution, record revisions and permission checks.
- Inspected chunked Sheets persistence and one-batch booking/receipt/audit/outbox writes, plus durable ambiguous-commit fencing and operator recovery. No cross-service atomicity claim was assumed.
- Inspected Calendar year coverage and coherent batches, Deploy immutable physical-register reads, Contacts snapshot extraction, privacy-safe timetable projection and compressed piece digest/length verification.
- Inspected notification claims, send outcomes, bounded jobs, uncertainty retention and manual channel retry behavior.
- Inspected STAPLER recovery and weekly-cap diagnostics. Recovery persists and reads back exact pending snapshots before dispatch, uses IndexedDB transaction completion, preserves legacy data until migration succeeds, and scopes retained drafts to account/date. No additional defect was established in those changes.

## Validation limits

Checks were source/diff inspection, small Node/VM reproductions of the concrete scenarios above, and a fresh `node tests/venues-sources.cjs` run after the three Roster projection patches. Existing unrelated broad suites were read, not repeated. The full generated embeds had not yet been rebuilt at the start of this review. No production deployment, Google Apps Script execution, real Sheets/Drive transaction, provider delivery, or live identity session was exercised. Other agents were editing concurrently; the final source-to-generated-artifact correspondence and full release gate remain the parent release task's responsibility.
