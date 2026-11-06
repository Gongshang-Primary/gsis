# lord-return-collection-scroll: LORD return and collection as one long scrolling page

- Status: merged (#98 at 35a4f5a as 999c1a4, 6 Nov 19:11 SGT)
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 6 November 2026
- Branch: muse/lord-return-collection-scroll
- Base SHA: 307d1c76c048b2f3dba616ec63331cdf5c4c7c93
- Current head SHA (or PR head; avoid self-referential commit hashes): 35a4f5abb20e0d1479900f2f802fc03dfb0ad47f
- PR: #98 (merged)
- User-authorised scope: LORD return and collection pages: no collapsible trolley sections (long scrolling mobile-first page, minimal friction and clicks); remove the unnecessary checkboxes on the return page. Owner decision 6 Nov: drop the per-trolley "I am physically returning" checkbox and both declaration checkboxes ("Tablets are kept in the correct trolley", "Tablets are facing the same orientation"). The two declarations are still sent to the backend as true with every trolley, covered by the single submit confirmation, because the backend requires both booleans (requiredBoolean_ in lord-suite/Source/backend/Code.gs) and records false as a discrepancy.
- Files/domains owned (include generated outputs): lord-suite/Source/lord/assets/app.js and lord-suite/First_Time_Setup/templates/lord/assets/app.js (byte-identical copies); lord-suite/Source/lord/assets/styles.css and its template copy; lord-suite/tests return/collection behaviour checks; docs/coordination/tasks/lord-return-collection-scroll.md; CHANGELOG.md.
- Out of scope: backend (no change; declarations still sent as true); loan booking, OVERLORD, WhatsApp, D1/edge queue, Roster, Deploy, Contacts; live data and deployment; the accessory cards (quantity + photo, no checkboxes) and the "Return devices with issues" control.
- Acceptance checks: every return and collection trolley renders open in one scrolling list with no <details> accordion and no one-open-at-a-time binding; no per-trolley selection checkbox and no declaration checkboxes on the return page; the submit confirmation text covers correct-trolley and same-orientation placement; quantity + photo still required per trolley; the saved return payload is unchanged except both declarations are true; the loan flow (trolley select, quantity, photo, remove) is unchanged apart from always-open cards; Source and template copies byte-identical; npm run build passes; relevant LORD tests updated and passing; full CI green at the exact head.

## Decisions and changes

- 6 Nov, owner: drop the two declaration checkboxes too. Backend keeps requiring both booleans, so the frontend sends them as true per trolley; the single submit confirmation is the attestation. No backend change.
- 6 Nov, owner: remove collapsible sections in collection too (loan trolley cards always open).
- Implementation (head fbe6f38 + working tree): returnTrolleyHtml and trolleyEditorHtml no longer render `<details>`; expandedTrolley/bindTrolleyDetails removed; per-trolley selection checkbox, selection gate and `selected` state removed; declaration checkboxes, globalCheckHtml/bindGlobalReturnChecks and the declarations gate removed; payload sends correctTrolleyDeclaration: true and sameOrientationDeclaration: true per trolley; confirmation notice now reads "I confirm that I returned the devices as recorded above, with tablets in the correct trolley and facing the same orientation."; accordion and selection CSS removed (the card padding:0 override went with it, so cards use the base 0.9rem padding); Source and template copies byte-identical.
- Tests: run_static_checks.py — old manual-confirmation check replaced by four new checks (no accordion, no selection/declaration checkboxes, declarations still sent true, confirmation covers placements); the pinned LORD layout-CSS hash updated to 1907bc46… (action-row rules themselves untouched); booking-remarks-return-browser.cjs fixture drops the dead state fields and now asserts the payload declarations are true, no selection checkbox and no return accordion; run_reload_browser_checks.cjs loan test now asserts three open cards with all quantity fields visible; run_reload_checks.cjs trolley-render test now asserts three open cards; run_refactor_checks.cjs — loadSession added to lordChanged and the three removed functions added to removedLord (simplifyLord script mode would refuse the current tree anyway).

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

- TZ=Asia/Singapore npm run build: PASS, no generated diff (6 Nov, working tree).
- TZ=Asia/Singapore python3 lord-suite/tests/run_static_checks.py: 116/116 passed.
- TZ=Asia/Singapore node lord-suite/tests/booking-remarks-return-browser.cjs (LORD_TEST_CHROMIUM=headless shell): passed.
- TZ=Asia/Singapore node lord-suite/tests/run_reload_browser_checks.cjs: passed, 19 checks.
- TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py: LORD suite 40/40 passed, exit 0.
- Full Node suite (TZ=Asia/Singapore NODE_NO_WARNINGS=1 node tests/run.cjs): first sequential run finished 1026/1031 — 5 scripts failed, names lost because the run's output was piped through tail. The 4 named shard-1 failures were re-run alone: roster089a-home-timetable-browser and stapler716-browser failed only on a missing /tmp/chromium (wrong env var; both pass with GSIS_BROWSER_EXECUTABLE set); roster711-workspace-ui passes alone (timing race under load); calendar098j-jobs passes alone on a quiet machine (its ui.cjs child hit the 35 s spawn timeout under load). All 11 further candidates from the 4 parallel shard runs (which added load flakes of their own) also pass alone, sequentially, with the correct env. No Node script references the LORD files changed, so no failure is tied to this change. CI is the remaining gate.
- Draft PR #98 opened 6 Nov at head 09ca3071d46d5a848157599b3250e109cace21a2 (implementation 4426de9 + merge of main 5e1738e), Codex reviews. CI run 42184079898 pending at opening.
- Not run locally: full CI (verify-queue workflow) — runs on this PR.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
