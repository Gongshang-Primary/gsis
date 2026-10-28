# GSiS 0.9.8d changelog

Patch baseline: 0.9.8c. Components: Roster frontend, Roster backend, notification Worker, LORD backend. Existing Google authority and Cloudflare transport remain.

## Absence reports

- Matching repeated reports reuse saved absence IDs; receipt/audit evidence remains. Compatible repeats complete instead of becoming fresh SMC overlap reviews.
- Larger and partially overlapping coverage adds uncovered periods while retaining existing IDs and relief links. Multiple saved rows retain their own identities.
- Added instructions are processed through the existing instruction-publication path. Later text from the same reporter wins. Blank repeated fields do not erase notes; explicit edits/clears record ordering evidence. Different authors' conflicting text remains reviewable.
- Later valid absence type wins, including a different reporter's later report. Delayed earlier submissions cannot restore an older type or undo later manual edits. A report predating an explicit deletion requires review instead of recreating the entry.
- Shorter coverage on submitted dates prompts Keep existing coverage / Use shorter report. Choices are bound to current absence and relief records, replay safely after uncertain responses, and do not silently remove protected/shared or past relief.
- Existing identical peer proposals are retained without another invitation. Proposals spanning separate saved absences are routed to their actual lesson owners. SMC protection remains.
- Intake drains up to eight receipts within the existing budget, prioritizes unapplied attendance and gives known old overlap-only failures one recovery attempt. Technical failures continue retrying with their existing identities. Exhausting the time budget retains Queue continuation even below the item limit.

## Operations

- WhatsApp review distinguishes unresolved uncertain outcomes from reviewed historical uncertainty. Provider evidence remains unchanged; no bulk resend or delivery claim.
- LORD scheduled reference sync uses a short lock attempt and defers contention to its existing trigger. Source failures remain visible and stale freshness timestamps are never renewed by a deferral.

## Deliberately outside this patch

No authority migration, active relief ledger, new infrastructure or schema conversion. No FAJT P0 change (the observed allocation was manual). Stapler retains 098c's draft-preservation, recess movement, surgical transport and private timetable cache behavior. True per-plan Drive writes require a storage split and are deferred. The existing monolithic operations document can still be replaced on a save; this patch does not promise a measured save-latency improvement.

Shorter reports affect explicitly submitted dates only; omitted dates are not silently deleted. Disjoint time-range changes that cannot be represented safely, past records, different-author note conflicts and protected arrangements can still require review. Processing capacity is bounded by actual backend latency, not a guaranteed eight completed reports every minute.
