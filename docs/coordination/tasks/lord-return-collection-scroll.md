# lord-return-collection-scroll: LORD return and collection as one long scrolling page

- Status: claimed
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 6 November 2026
- Branch: muse/lord-return-collection-scroll
- Base SHA: 307d1c76c048b2f3dba616ec63331cdf5c4c7c93
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: LORD return and collection pages: no collapsible trolley sections (long scrolling mobile-first page, minimal friction and clicks); remove the unnecessary checkboxes on the return page. Owner decision 6 Nov: drop the per-trolley "I am physically returning" checkbox and both declaration checkboxes ("Tablets are kept in the correct trolley", "Tablets are facing the same orientation"). The two declarations are still sent to the backend as true with every trolley, covered by the single submit confirmation, because the backend requires both booleans (requiredBoolean_ in lord-suite/Source/backend/Code.gs) and records false as a discrepancy.
- Files/domains owned (include generated outputs): lord-suite/Source/lord/assets/app.js and lord-suite/First_Time_Setup/templates/lord/assets/app.js (byte-identical copies); lord-suite/Source/lord/assets/styles.css and its template copy; lord-suite/tests return/collection behaviour checks; docs/coordination/tasks/lord-return-collection-scroll.md; CHANGELOG.md.
- Out of scope: backend (no change; declarations still sent as true); loan booking, OVERLORD, WhatsApp, D1/edge queue, Roster, Deploy, Contacts; live data and deployment; the accessory cards (quantity + photo, no checkboxes) and the "Return devices with issues" control.
- Acceptance checks: every return and collection trolley renders open in one scrolling list with no <details> accordion and no one-open-at-a-time binding; no per-trolley selection checkbox and no declaration checkboxes on the return page; the submit confirmation text covers correct-trolley and same-orientation placement; quantity + photo still required per trolley; the saved return payload is unchanged except both declarations are true; the loan flow (trolley select, quantity, photo, remove) is unchanged apart from always-open cards; Source and template copies byte-identical; npm run build passes; relevant LORD tests updated and passing; full CI green at the exact head.

## Decisions and changes

- 6 Nov, owner: drop the two declaration checkboxes too. Backend keeps requiring both booleans, so the frontend sends them as true per trolley; the single submit confirmation is the attestation. No backend change.
- 6 Nov, owner: remove collapsible sections in collection too (loan trolley cards always open).

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
