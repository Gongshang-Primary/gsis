# GSiS v0.8.1c: merge into the full suite

This patch is based on v0.8.1b, commit 9816ba42a1ba68f7ec19dfc0639da928fabe201a. Keep the existing release history and merge the patch commit on top of that baseline. It is not an independent replacement for the whole suite.

## Component ledger

| Component | Required version after patch | Action |
| --- | --- | --- |
| Deploy backend | 0.8.1c | Changed complete Apps Script source |
| Roster frontend and Pages gateway bundle | 0.8.1c | Changed frontend; gateway logic retained from 0.8.1b |
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

## Source ownership and integration

Change shared/roster-stapler.js and shared/roster-operations.js first. They own canonical cell comparison, publication recipient policy, durable notices and current daily delivery state. backend/RosterOperations.gs owns locked dispatch, quiet-hour policy and claim/prepare validation. roster-update/public/roster-operations-ui.js and its CSS render outcomes and recipients; roster-stapler-export.js follows content-based card state.

Run scripts/build-release.py --sync-only after source edits. It regenerates matching model copies under roster-update/public, the marked blocks inside backend/Code.gs, and the combined Deploy backend. Do not merge generated copies independently of their canonical source. Keep the non-generated Deploy version/diagnostic constants aligned with the component version. The notification Worker is generated from the Pages gateway and notification-worker/index.js; neither source changes in this patch.

package.json declares component versions and gsisPatchComponents. scripts/build-component-patch.py and verify-component-patch.py package and verify only those changed deployables, plus SUITE_MERGE.md. A future whole-suite release must deliberately use its whole-suite build configuration and update full-release documentation; do not carry a two-component patch declaration into a full deployment unnoticed.

## Existing records and compatibility

Do not rewrite baseline spreadsheets, replace the operations Drive document or erase publication history to hide false recipients. Read-time eligibility uses current published content and notification evidence. Dispatch rechecks old queued jobs and records why unnecessary or superseded work is cancelled. Existing canonical notices and legacy two-part fingerprints must retain acknowledgement when the teacher's published content is equivalent. Uncertain sending attempts remain guarded against blind retries.

A return to baseline is a correction only when an earlier notified or acknowledged timetable makes that correction necessary. A previous Publish Only revision by itself is not delivery evidence. Genuine instruction, timing and duty changes remain relevant. Canonical normalization must not broaden into guessed language aliases, class reordering or case folding that could suppress a real change.

No database reset, new workbook column or live record migration is required. Deployments keep existing URLs, secrets, settings, triggers and stored audit history. Roster Pages must retain the public signed-link routes introduced in v0.8.1b.

## Verification and future work

Run the repository regression suite and archive parity checks after merging. Preserve the roster084 recipient-policy, manual-dispatch, unchanged-card and notification-status regressions, alongside prior timetable acknowledgement, delivery fencing, provider diagnostics, template transport and export checks. The patch validation file records actual outcomes and limitations.

A school-authorised live test still must confirm provider delivery, signed-link access and acknowledgement after installation. Local queued/sent tests do not establish delivery. The recorded 21 October investigation is a snapshot; later production status must be read before reconciling any uncertain attempt.

A new automatic morning teacher batch is not implemented or scheduled. Agree its operational time and catch-up policy separately; 05:45 remains a proposal. Keep Publish Only silent. Existing 05:30 SMC summaries are not evidence that teachers were notified. External Cloudflare Access policies and approved template fixed-body changes also remain separate operational work when needed.


## Newly queued item 060

The user confirms private teacher links now open but reports they cannot be opened repeatedly. Queue repeated access to the exact same signed link until its existing time-based expiry; opening or acknowledging must not consume it. Investigate the reported failure before attributing it to one-time token use. Preserve public access without sign-in, teacher/date scope, explicit revocation and idempotent acknowledgement. This item arrived after the current patch instruction and is recorded for the next implementation, not included in v0.8.1c code. See item 060 in GSiS_Queued_Changelog.md for acceptance checks.
