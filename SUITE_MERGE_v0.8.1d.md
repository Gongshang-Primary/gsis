# GSiS v0.8.1d: merge into the full suite

This patch is based on v0.8.1c, commit 0d6be0090bc5dc0172042a17cf6bef0547753f75. Keep the existing release history and merge the patch commit on top of that baseline. It is not an independent replacement for the whole suite.

## Component ledger

| Component | Required version after patch | Action |
| --- | --- | --- |
| Deploy backend | 0.8.1c | Retain installed component |
| Roster frontend and Pages gateway bundle | 0.8.1d | Changed private-page frontend; gateway logic retained |
| Separate notification Worker | 0.8.1b | Retain installed component |
| Calendar frontend and backend | 0.8.1 | Retain |
| Contacts frontend and backend | 0.8.1 | Retain |
| Deploy frontend | 0.8.1 | Retain |
| Layout frontend | 0.8.1 | Retain |

## Cumulative feature ledger

| Items | Delivered in | Required behavior to preserve |
| --- | --- | --- |
| 053 | 0.8.1a / 0.8.1b | Published current or future days are eligible for Notify; inline progress and browser summary reuse |
| 054 | 0.8.1b | Exact TG subjects, configurable subject families and TG business exceptions; Tamil No Relief Required defaults |
| 055 | 0.8.1b | Teacher acknowledgement of changed published timetables; filled acknowledged pill and grey pending state; unchanged versions retain acknowledgement |
| 056 | 0.8.1b | Teacher-specific signed public links without Google sign-in; expiry is the earlier of seven days after issue or end of the day after the timetable date in Singapore; audit history retained |
| 057 | 0.8.1b | Safe dynamic parameters across all 21 existing templates; preserve approved fixed bodies; provider diagnostics and permanent-error retry controls |
| 058 | 0.8.1c | Manual quiet-hour bypass, truthful counts and delivery status, durable request reuse and dispatch rechecks |
| 059 | 0.8.1c | Canonical content comparison, corrected existing-publication eligibility, delivery-aware corrections and unchanged imported-card display |
| 060 | 0.8.1d | Reusable complete private links, storage-independent refresh/reopen and preserved scope, expiry and acknowledgement |

## Source ownership and integration

For items 058–059, shared/roster-stapler.js and shared/roster-operations.js own canonical cell comparison, publication recipient policy, durable notices and current daily delivery state. backend/RosterOperations.gs owns locked dispatch, quiet-hour policy and claim/prepare validation. roster-update/public/roster-operations-ui.js and its CSS render outcomes and recipients; roster-stapler-export.js follows content-based card state.

Item 060 changes roster-update/public/external.js. Keep its generated timetable-view block intact. The fragment must remain available for refresh/reopen; the existing session storage is a legacy recovery path. Changing fragments creates a fresh document so pending work does not cross teacher/date links. Server validation and acknowledgement storage remain authoritative.

Run scripts/build-release.py --sync-only after source edits. It regenerates matching model copies under roster-update/public and the marked blocks inside backend/Code.gs. For a component patch, it emits a combined Deploy backend only when that component is declared as changed. Do not merge generated copies independently of their canonical source. Keep the non-generated Deploy version/diagnostic constants aligned with the component version. The notification Worker is generated from the Pages gateway and notification-worker/index.js; neither source changes in this patch.

package.json declares component versions and gsisPatchComponents. scripts/build-component-patch.py and verify-component-patch.py package and verify only those changed deployables, plus SUITE_MERGE.md. A future whole-suite release must deliberately use its whole-suite build configuration and update full-release documentation; do not carry this frontend-only patch declaration into a full deployment unnoticed.

## Existing records and compatibility

Do not rewrite baseline spreadsheets, replace the operations Drive document or erase publication history to hide false recipients. Read-time eligibility uses current published content and notification evidence. Dispatch rechecks old queued jobs and records why unnecessary or superseded work is cancelled. Existing canonical notices and legacy two-part fingerprints must retain acknowledgement when the teacher's published content is equivalent. Uncertain sending attempts remain guarded against blind retries.

A return to baseline is a correction only when an earlier notified or acknowledged timetable makes that correction necessary. A previous Publish Only revision by itself is not delivery evidence. Genuine instruction, timing and duty changes remain relevant. Canonical normalization must not broaden into guessed language aliases, class reordering or case folding that could suppress a real change.

No database reset, new workbook column or live record migration is required. Deployments keep existing URLs, secrets, settings, triggers and stored audit history. Roster Pages must retain the public signed-link routes introduced in v0.8.1b.

## Verification and future work

Run the repository regression suite and archive parity checks after merging. Preserve the item-060 private-link browser regressions and the roster084 recipient-policy, manual-dispatch, unchanged-card and notification-status regressions, alongside prior timetable acknowledgement, signed capability expiry/scope, delivery fencing, provider diagnostics, template transport and export checks. The patch validation file records actual outcomes and limitations.

A school-authorised live test still must confirm provider delivery, signed-link access and acknowledgement after installation. Local queued/sent tests do not establish delivery. The recorded 21 October investigation is a snapshot; later production status must be read before reconciling any uncertain attempt.

A new automatic morning teacher batch is not implemented or scheduled. Agree its operational time and catch-up policy separately; 05:45 remains a proposal. Keep Publish Only silent. Existing 05:30 SMC summaries are not evidence that teachers were notified. External Cloudflare Access policies and approved template fixed-body changes also remain separate operational work when needed.


## Item 060 integration and compatibility

The previous page stripped the signed fragment and relied on tab-scoped session storage; the server did not implement one-time consumption. Preserve the complete fragment through normal use. Recover already stripped tabs from their existing session storage when available, but do not invent credentials when both the fragment and stored token are absent. The original notification link remains the recovery source.

Link opening and acknowledgement must remain reusable until the original validity boundary. Do not extend expiry, weaken signed teacher/date scope or convert the bearer capability into a public identifier. Retain no-referrer behavior and the existing bearer-header API. No persistent local storage, cookie or sign-in dependency is added.

Keep acknowledgement separate from link access. Opening is not acknowledgement; repeat acknowledgement is idempotent. Changing the page's fragment must not leave the previous teacher's data or pending actions in the new link's document. Authorization errors clear displayed private content, and the server continues deciding whether a later Refresh is valid.

## New queued work: 061 and 062

The user requested faster private-link loading and a less intimidating WhatsApp button while item 060 was being verified. These remain queued under the standing changelog rule; v0.8.1d implements only reusable links.

Item 061 targets the private read path, not bundle size. Measure latency first, then evaluate the stored published recipient snapshot, narrower timetable projection, reduced writer-lock duration and an authoritative acknowledgement response that avoids a second full read. Reconciliation currently writes, so removing locking outright is unsafe. Preserve exact publication identity, teacher/date scope, expiry, no-store responses and concurrent-publication checks. The existing immutable model cache already covers uploaded model reuse.

Item 062 uses a native “Open timetable” URL button, with an appropriate request-review label for mutual approval. Seven body-only contracts need coordinated versioned replacements: mutual_request, mutual_override, relief_assignment, relief_updated, relief_reminder, relief_urgent and stapler_timetable. Extend the contract schema, approval matcher and body/button payload construction together; synchronize the Pages gateway and generated notification Worker. Retain approved old templates until replacement approval and validate fragment transport on mobile. Button opening must not acknowledge the timetable. Do not expose the signed capability through logging or a public shortening service.

The full investigation, acceptance criteria and source locations are recorded as items 061–062 in GSiS_Queued_Changelog.md and the wider post-v0.8.1b changelog. No speed improvement, live template edit or button rollout is claimed by this patch.
