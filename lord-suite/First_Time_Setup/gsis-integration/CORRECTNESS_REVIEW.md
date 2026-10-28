# Independent correctness review — LORD / GSiS integration

Reviewed on 2026-10-24 against the supplied LORD v1.8.1 source and the integration decisions in `DECISIONS.md`. No unresolved material finding remains in the identity, historical-record, form-generation and committed-booking recovery paths examined here.

## Scope and evidence

Read the actual LORD backend dispatch, booking preparation/update, atomic event writes, recipient lookup, ownership checks, local snapshot readers, STARLORD identity output, and LORD/OVERLORD selector and submit paths. Focused on stable identities when labels are renamed/reused, phone-only changes, historical labels, same-label class/TG/activity choices, an open form spanning a publication, and retry after an accepted write loses its acknowledgement. Production code fixes were made by the implementation owners; this reviewer added independent regressions.

`tests/gsis-independent-identity-review.cjs` passes 12 checks against the real backend functions with in-memory Google services:

- New booking and stable Staff ID binding share one atomic Sheets batch.
- Renaming a teacher and assigning the former name to someone else does not redirect ownership or the original recipient.
- A phone-only snapshot update changes the current local recipient without rewriting booking history; an inactive original owner does not fall back to the new holder of the name.
- An administrative edit that retains historical labels retains the original owner binding.
- Class and teaching-group IDs remain distinct namespaces; local activities remain selectable; general reference responses exclude staff phone/email data.
- A stale `1P` form cannot adopt a different publication using the same abbreviation.
- A snapshot change after recipient lookup blocks the provider-send boundary until a fresh execution.
- An accepted booking with no optional Properties receipt can replay after a phone-only generation change.
- A two-date batch can replay after teacher-name reuse, while a changed class namespace under the same request ID is refused. Recovery returns the original booking IDs and performs no additional Sheets batch.
- Explicit custom activity and purpose labels are also bound to the durable command: changing either under the same request ID is refused, while the original labels recover after a phone-only generation update.
- REIGN partitioning retains the stable identity binding beside a future booking and archives that binding with the booking when its date passes the cutoff.

Ordinary reads and booking actions in these probes fail immediately if they attempt an upstream fetch. All twelve checks made zero remote calls.

Independently ran the final frozen `tests/gsis-reference-ui-browser.cjs` in real Chromium for both frontends at a 390px viewport. It passes native namespaced selectors, pinned open-generation redraws, explicit stale-reference refresh, stable-ID preservation when the old label is reused, batch payload fields, historical administrator edits, the retained LORD edit compatibility path, local-generation Worker requests, and page-error/overflow assertions. Explicit custom activity/purpose drafts survive redraw, stale refresh and persisted page reload; a current listed label cannot silently become a custom choice. Also ran the 19-check `tests/run_gsis_bridge_checks.cjs` suite successfully during this review, including initial local-activity retention, subsequent publication changes and explicit custom activity/purpose validation.

## Findings resolved during review

1. **An ordinary redraw silently advanced an open form.** A background reference refresh followed by a repaint replaced the form's displayed generation. The frontend now pins the opened generation and changes it only through explicit refresh/open/resume actions; the browser regression verifies the old form submits its old key and is rejected for review.
2. **The retained LORD edit path could repeatedly retry a stale generation.** Its error handler only repainted the same choices. Reference errors now offer the explicit shared-choice refresh, preserving the selected stable ID and exposing its current label. This is a compatibility path; the ordinary own-booking view is read-only.
3. **A committed booking could be reported as rejected after a reference update.** With an accepted Sheets write but failed Properties receipt, a phone-only update made the exact retry fail `GSIS_REFERENCE_CHANGED` before deterministic-row recovery. The backend now stores an original command digest with the initial stable binding in the same atomic Sheets write, validates that proof first, and recovers the current saved result before consulting the latest selectors. Both single-booking and multi-date recovery regressions pass; an altered stable reference is refused.

## Limits

This is a focused correctness review, not a proof of every existing workflow. The supplied frontend has batch booking but no separate recurring-booking UI; the independent backend test covers multiple dates within one batch. Historical ownership tests cover original Google subject/email and the new Staff ID event binding. The reviewed archived-booking actions use original stored identity/text and do not call the current-recipient lookup; active notification, edit and STARLORD consumers read current bookings whose bindings are retained. No production archive was altered. The deterministic receipt-recovery cases cover bookings created with the bridge binding in place.

Google Sheets/Drive/Properties, upstream HTTP and messaging services were simulated. Real Apps Script execution races, deployed endpoint authorization, trigger installation, live provider latency, and WhatsApp delivery still require deployment/UAT. No production setting, booking, deployment or message was changed by this review. The separate GSiS optimization/morning-concurrency review remains in the GSiS checkout under `docs/reviews/optimization-20261024/correctness-review.md`.
