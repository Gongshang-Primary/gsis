# roster-d1-import-packed-capture: Follow-up R2

- Status: implemented; full verification before PR
- Owner/model: Codex
- Reviewer/model: Claude, exact final head
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-d1-import-packed-capture
- Base SHA: eb2bcd4177071996929037ee5b85c7d03e4848f3
- PR: pending full Node and LORD verification
- User-authorised scope: Follow-up R2 in roster-d1-import-resumable-prepare.md; separate PR before continuing row D1.
- Files/domains owned: backend/RosterEdgeMigration.gs; shared/roster-import.js; shared/edge-setup.js; roster-update/public/edge-roster.js; focused fixtures/tests; canonical generated copies.
- Out of scope: D1 backup/switch-back, inactive staff, quota work, deployment, authority activation, real notifications and school records.

## Priority and coordination

Owner paused all other ChatGPT implementation work for R2 on 31 October. PR #33 (row D1) is merged as `eb2bcd4`; R2 incorporates its import folder and mirror integration. #30 and #29 remain paused. This repository protocol cannot stop an independently running ChatGPT session; every session must read this priority before editing.

The explicit owner assignment authorises this bounded branch. No implementation is written directly to main. The owner merges after Claude reviews the exact head.

## Required changes

1. Capture and digest the stored, compressed form without traversing lazy Stapler plans or decision evidence.
2. Expand only the objects required by a later bounded preparation step; preserve import identities and digests.
3. Persist failure status, message, phase and elapsed time in the Google descriptor and D1 session; show these on edge setup. Retain the last phase when execution terminates.
4. Exercise ten full-school-day compressed plans, nine archives and compressed decision evidence with the real snapshot path. Source bytes must stay within 1.5 times packed operations bytes.
5. Release Roster and notification locks before uploading the frozen source.

## Verification

All 18 components regenerated after integrating merged main `eb2bcd4`. New packed-capture, audit-hydration, failure-persistence, failure-response and UI programs pass. Existing import, preparation, restart and setup regressions pass. Independent internal review found no blocker; Claude still reviews the exact PR head.

The real-code fixture contains ten plans, nine archives, 150 teachers, seventeen daily periods and ten compressed audit evidence records. Original capture decompresses twenty-nine payloads and grows 1,459,453 packed bytes into 92,533,091 source bytes, exceeding the 64 MiB limit. Fixed capture writes 1,459,908 bytes with no decompression. All fifty-seven plan references retain the original digests. The simulated capture costs 26,680 ms and the largest of 117 steps costs 90,219 ms. These are simulated costs, not live Apps Script measurements.

Verification commands: `TZ=Asia/Singapore npm run build`, the new `tests/roster099-packed-*.{cjs,mjs}` and `tests/roster099-import-failure-*.cjs` programs, existing resumable/preparation/import programs, and `tests/edge094-setup.cjs`. Full Node and LORD verification must pass on the branch before its PR opens; the exact-head Actions run and result will be linked in the PR.

## Deployment and handoff

Not deployed. Google remains the record. Do not restart the failed rehearsal until this fix is owner-merged and deployed. Explicitly restart any preparation captured before R2: the stored representation changes the source digest and the new fence rejects the old expanded digest. Source files, descriptors and checkpoints remain evidence. Any later D1 work must retain this fix.
