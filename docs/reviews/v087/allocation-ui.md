# v0.8.7 allocation, acknowledgement and operational UI review

## Delivered

- Manual suggestions now use the saved allocation business preference order and enabled flags, including baseline teaching level and precise teaching-group subject families. Eligibility/override and existing recess/ad-hoc groups are retained. Top three and the full candidate list use the same ordered rows.
- Teachers already at eight genuine work periods are moved below lighter-load teachers in the same eligibility group. They remain selectable. Work count excludes blank/BLK/recess-only cells and absent baseline periods; relief is included and combined classes count once per period.
- Local draft assignment deltas immediately rebase weekly R, employment-cap headroom and annual utilisation. Replacement restores the selected assignment's R while evaluating candidates. Reapplying an unchanged projection does not charge twice. Server snapshot objects are not mutated.
- A shared, verified-owner/date acknowledgement module is used by Home (cache agent integration) and My Relief Duties. The duties action appears above the timetable and its long instructions. Yellow inline status never opens a modal or makes the page inert.
- Acknowledgements bind the exact notice and request ID. Duplicate clicks share one in-flight operation. Uncertain retries query the durable compact receipt, then replay the identical command only if needed. An older accepted acknowledgement cannot mark a newer notice acknowledged. A stale duties card cannot acknowledge a newer timetable; account/role changes clear shared state.
- SMC publication text includes date, seconds and explicit SGT. Assign Relief displays the latest publication timestamp when supplied by the allocation response. Queued dispatch response text states that transport continues in the background.
- A pending notification-only enqueue does not block Assign Relief local changes or Save to online. Publication and uncertain roster save guards remain in place until durable confirmation.
- Daily employment report no longer displays annual R utilisation. The SMC/Admin toolbar links to Daily Notify with the selected report date. Underlying accounting stays intact.

## Integration

Include `roster-acknowledgement-ui.css` and load `roster-acknowledgement-ui.js` before `roster-operations-ui.js` / `roster.js`. Module API: `mount(host,{api,owner,today,notice?,revision?,onView?,onAccepted?})` returns an idempotent disposer; `refresh(owner,date?)` and `clear()` are exposed. Home and duties must share `ctx.acknowledgementOwner` from the verified account/role scope.

Backend compact operations: `acknowledgementStatus`; `acknowledge` with `compact:true`; flat `receiptStatus` response containing `acknowledgementOnly`, `acknowledged.timetableNoticeId`, and the durable original timestamp. A 409 superseded notice causes a compact status refresh, without acknowledging the replacement.

Allocation projection needs `publishedAt` and `publishedRevision` for the saved publication. Worker `notificationDispatch.state === 'queued'` is reported as queued, never as Meta delivery success. Frozen publication/outbox content remains a domain/backend responsibility.

## Verification

Passed:

- `node tests/roster087-manual-policy.cjs`: policy order/toggles, subject family/TG and level matching, eight-period soft demotion, absence/BLK/combine counting, category preservation, local R deltas and replacement.
- `node tests/roster713-manual-ranking.cjs`: historical weekly-R-first configuration, stable candidate ordering, Top 3/full-list parity, local search and special priorities. The test now explicitly configures weekly R as its only enabled preference.
- `node tests/roster087-acknowledgement-ui.cjs`: real browser duplicate actions, nonblocking state, uncertain receipt recovery, new-publication races, exact notice binding, SGT seconds and owner cleanup.
- `node tests/roster087-operations-ui.cjs`: publication timestamp, notification-only pending vs local save, first-row compact acknowledgement and nonblocking durable acceptance.
- `node tests/roster087-scoped-ack.cjs`: six backend checks, including concurrent teachers and replay after newer publication (backend agent's tests).
- `node tests/release082-local-draft-tabs.cjs`: same-user browser-tab isolation and recovery.
- `node tests/roster084-manual-dispatch.cjs`: 10 manual/automatic dispatch and quiet-hour regressions.
- `node tests/082-domain-manual-authority.cjs`: protected manual choices, history, undo and shared subjects.
- `node tests/roster710-settings-ui.cjs`: real browser settings/report/recipient recovery, permissions and date-preserving Daily Notify link; expectation updated for removal of annual R column.
- `tests/roster082-notify-ui-browser.cjs`: real browser inline spinner, active navigation, date races, retries and future notification eligibility. Runtime launch defaults used instead of its unavailable hardcoded `/tmp/chromium`.
- Syntax checks and `git diff --check`.

No generated deployment artifacts, live messages, external mutations or commits were performed by this agent. Full build/release validation remains with the parent coordinator.
