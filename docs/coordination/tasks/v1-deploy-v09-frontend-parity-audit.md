# Deploy frontend parity audit and compact-table changelog

Model: Codex. Recorded 17 November 2026 23:43 SGT. All times use Asia/Singapore.

- Status: read-only assessment completed; implementation queued. CCA/PLT/Event multiplicity clarification remains pending.
- Owner/model: Codex, coordinated by ChatGPT. Eventual functional reviewer: Muse at the exact implementation head.
- Branch: `codex/v1-deploy-v09-frontend-parity-audit`.
- Base and inspected v1 source: `1c42db77f1fec0a92e2beac289865ae742a26475`, deployed v1.05.
- Comparison: v0.9.9y `d9d180ced16d32c836a94d67d9cff8d3030eb21d`.
- Current head: the commit containing this record; no self-referential hash is asserted.
- PR: none. This single task-record publication uses the workflow's documentation-only, expected-head claim exception. It is not a functional merge or deployment.
- Authorised scope: inspect the owner's paired screens, trace v0.9 and v1, ask genuine policy questions, and maintain the changelog. Record the subsequent confirmed department move and compact-on-load instructions.
- Exact write scope: `docs/coordination/tasks/v1-deploy-v09-frontend-parity-audit.md` only. No source, test, build, configuration, dependency or generated-output edit.
- Out of scope: implementation, changes to PR205, live school-data access or edits, provider sends, integrations, imports, pruning and another deployment.
- Refresh: fetched main and remote heads. Main remained the base above. Open PR205 is a separate three-file Versions task at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5`; PR182 is separate v0.9 work at `136ba17589abfe944ee04029874f1c085e6fa9de`. Neither owns this record, and neither was modified.

## Owner decisions

| Area | Instruction | Disposition |
| --- | --- | --- |
| Departments | A teacher cannot belong to two distinct departments. Selecting someone already in another department must offer **Move to this department**, with confirmation. | Settled. This intentionally changes v0.9, which allowed cross-department membership with an orange notice. |
| Committees | Multiple committee memberships are allowed. Show a visual notice rather than refuse the save. | Settled. Preserve the orange notice. |
| All GSiS tables | **Always compact after loading.** | Settled, suite-wide; not limited to Deploy or this screenshot. This is presentation, not deletion of member slots or data. |
| CCAs, PLTs, Events | v0.9 allows several memberships and shows an orange notice. | Owner clarification requested together for these three kinds. Do not silently introduce a restriction. |

The confirmed Dept move should show the previous department and affected positions before confirmation. Cancel must retain the draft and assignments. A confirmed move must be staged through the existing draft/save flow, with removal from the previous department and addition to the target in one owned document change. Keep stable IDs, capability, revision, operation identity and recovery checks. A concurrent change requires review of the current assignments. Blank leadership positions remain allowed. Several positions in one department are not membership of several departments; do not implement the wrong cardinality check. Existing historical inconsistencies must be visible and repairable without silently deleting assignments or clearing untouched fields.

### Adjacent v0.9 rules and current transport inventory

| Kind | Original role model and policy to preserve unless explicitly changed | Current v1 transport |
| --- | --- | --- |
| Dept | Optional Head; several Deputies, TLs and Members. TL eligibility uses ST/LT/MTT appointment level. The same person cannot occupy two positions inside one group in v0.9. | Native save; canonical Departments/DepartmentMembers Excel import. Cross-department exclusivity is not currently enforced. |
| Committees | Optional HOD i/c, SH i/c, OIC and 2IC, plus Members. Retain legacy Head/Deputy assignments until explicitly mapped. | Settings Groups/Members workbook sends native `/change` operations. |
| CCAs | Optional OIC Boys, OIC Girls, 2IC and Enrichment, plus Members. | Settings workbook to `/change`. |
| PLT | Optional Leader and Members; missing leader is a warning. Each distinct PLT contributes two PD periods. | Settings workbook to `/change`. |
| Events | Optional OIC and 2IC, plus Members. | Settings workbook to `/change`. |
| Duty | One assignee per duty/day; several non-overlapping duties permitted. Original same-weekday overlap is rejected, adjacent intervals allowed. Blanks can publish. Each assigned duty/day counts one period. | Duties/Assignments workbook to `/change`. |

The settings workbooks above edit existing identifiers/row keys, up to 32 changed rows; they cannot create group definitions. They are different from the canonical `/imports` schema. Do not report these imports as absent merely because that canonical schema lists only Dept. Committee legacy-leadership conversion remains the explicit owning UI flow.

Source inspection also identifies native within-group duplicate/TL checks and Duty-overlap validation as candidate parity gaps. Those backend differences have **not** received request-level negative-case proof in this audit. Prove them through synthetic built Worker/D1 requests before opening a repair claim. Ordinary organisational leadership is not itself an SMC/EO/School Leader permission grant; the existing Membership publication mechanism remains separate.

## Confirmed findings and queued fixes

These IDs belong to this audit; they do not replace earlier ledger IDs.

| ID | Finding | Evidence and next bounded work |
| --- | --- | --- |
| PAR-01 | Dept, Committees, CCAs, PLT and Events put the planning table in a narrow right column and Unassigned below. | Reproduced in the real built local browser with identical synthetic data in both frontends, desktop and narrow. Fix toolbar placement while preserving the original two-child assignment layout. |
| PAR-02 | IP Deploy adds redundant sort controls and initially oversized filter columns. The first header also loses contrast. | Controlled two-class case: v1 has 24 extra sort buttons and 24 filter inputs; width about 4,500px versus 1,930px in v0.9. Integrate useful shared controls with the owning view rather than duplicate them. The dark first-header correction is also in the existing visual queue. |
| PAR-03 | Normal New planning version does not inherit selected-version definitions, classes or settings. | Confirmed by an actual synthetic local Worker/Core/D1 request. The frontend sends `sourceVersionId` with `duplicate:false`; the service recognises that field only when `duplicate:true`, or accepts the different `copyFrom`/`sourceId` names. The normal path therefore uses empty defaults. Fix the request/owner contract separately from layout, preserving the existing New versus Duplicate assignment semantics. |
| PAR-04 | The new one-department rule and confirmed move do not exist yet. | Native saves and Dept workbook import currently permit membership in distinct departments. Check all assignment arrays and the final document, not just the visible member slot. Keep permitted committee behavior unchanged. |
| PAR-05 | Compact-on-load is inconsistent across GSiS. | Shared controls do not perform automatic content fitting. Only some apps retain the original fitter; Admin Accounts has neither path. Implement and verify a common v1-owned presentation contract, including delayed and reused tables. |
| PAR-06 / B-V01 | Initial physical-room creation/import has no usable frontend. An existing physical-register metadata panel is also missing. | Source-confirmed, already reported as B-V01 in Run B. Native import exists without a browser entry and rejects unknown capacity. Restore an authorised Venues Add/Edit/Excel path with unknown capacity retained. This audit does not perform another seed. |
| PAR-07 | Existing Teachers heading contrast, row fills and HR tab order remain queued. | Keep the [existing visual task](v1-deploy-teachers-visual-cleanup.md): dark TTb heading, alternating white/light-blue rows with truthful activity labels, Span of Control after HR Terms. PR204 is now merged, so its former ownership dependency is cleared; this is not evidence the visual fixes shipped. |

### Why the group layout breaks

The original `groupPage` creates `.assignment-split` with exactly two children: `.assignment-main` and the unassigned `aside`. Its CSS assigns the main area all remaining width and the sidebar 205px on desktop. The native table viewport marks the main wrapper as `.table-window`.

The v1 enhancer then selects that wrapper as its anchor and calls `anchor.before(bar)`. Its toolbar becomes a third direct child of the two-column grid. Auto-placement puts the toolbar in the wide left cell, the table in the narrow right cell and the sidebar in the next row. See [core-table.js](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/v1/web/shared/core-table.js#L190), [native group renderer](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/planning-ui.js#L8) and [native layout CSS](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/styles.css#L103).

At a 1,440px viewport, the v1 Dept main is x=1,227, width=205; its sidebar is x=8, width=1,209, on the next row. v0.9 with the same data has main x=8, width=1,209 and sidebar x=1,227, width=205. The same displacement occurs in all five views and at 390px. Moving only the toolbar outside the split in a private DOM probe immediately restores the desktop geometry. No repository code was changed for that causal check.

The controlled screens retain the same teacher counts, assigned positions, trailing add-member rows, Unassigned counts, orange notices and PLT missing-leader warnings. Thus the demonstrated layout bug must not be described as proven staff-data loss.

### New-version request proof

The saved synthetic source contained one Dept definition, one Committee definition, one class and EL load 12. The frontend-shaped normal Create request returned zero of all three definitions/classes and EL 0. The same request with `duplicate:true` retained 1/1/1 and EL 12. The original D1 document stayed equivalent. See [frontend request](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/public/app.js#L475) and [native Create handler](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/v1/services/deploy/service.mjs#L881).

This proves the current contract defect, not the history of the owner's live draft. No hosted draft was inspected. Keep the approved Contacts-refresh behavior and draft isolation when repairing inheritance; do not restore guessed default departments in place of the selected version's definitions.

### Duty and apparent missing assignments

With identical synthetic input, both frontends render the same 27 physical Duty rows, 20 header cells/spans, 17 teacher selectors, orange headers, day bands and 2,400px roster width. v1 adds shared controls and breadcrumbs. A missing-Duty-data defect was not reproduced by this layout comparison.

Likewise IP Deploy retains the same controlled class rows and assignments. Its approved FT-to-FORM label change is not a defect. The owner's screenshots select **2026 T4** in v1 and **2027 Term 1** in v0.9. Their different group/assignment/duty totals alone cannot establish data loss or a rendering omission.

## Compact after every table load

Treat Compact as fitting content into readable cells, preserving the normal font size, teacher line breaks, filters, row bands, warnings, merged cells and usable controls. It must not modify values, drafts, selections, membership arrays, assignments or permissions. Users should not have to click Compact after opening or refreshing a table.

| Surface | Current source behavior |
| --- | --- |
| Deploy, Contacts, Layout | Shared core controls plus the legacy viewport fitter. Newly visible tables fit once; reused tables and controls inserted afterward can keep stale measurements. |
| Roster, Calendar, Venues, LORD, OVERLORD, STARLORD | Shared controls where eligible, without that legacy content fitter. Card-only views are not invented as tables. |
| Global Admin Toolbox | Its Accounts table has neither shared core controls nor the legacy fitter. Other panels are not assumed to be tables. |

The original fitter uses a `WeakSet` and page-local manual sizing state. Membership widths also persist in local storage. The shared Compact button only clears header-width preferences and requests an optional refresh; it never runs content fitting itself. Shared enhancement deliberately skips some dialog/plain/schedule tables, so compaction must not depend solely on the export/sort enhancer accepting a table. Source: [legacy fitter](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/public/table-viewport.js#L4), [shared Compact button](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/v1/web/shared/core-table.js#L366), [enhancement exclusions](https://github.com/helper-gsps/gsis/blob/1c42db77f1fec0a92e2beac289865ae742a26475/v1/web/shared/core-table.js#L110).

Prefer one v1-owned fitting entry through the shared module infrastructure, including Admin, rather than new per-screen build text patches. Run after data, controls and fonts are available, and cover reused bodies, dynamically inserted tables, hidden-to-visible tabs, dialogs and import previews. A new load must reopen compact rather than inherit expanded manual widths. Avoid repeatedly resetting a user's in-progress sizing or moving a Save button between pointer-down and click. Keep period alignment and merged schedule geometry under each owning renderer; do not use a blanket width override that corrupts timetables.

### 19 November 2026 SGT — Deploy tables still load at full width

**PAR-05 remains open.** The owner reports that some Deploy tables in v1.06 still require the Compact button after loading. The report does not identify individual views. The deployed source, `bd77b27deab417afce859cd80465d7c608ae0ab2`, retains the original fitter. The shared Compact implementation at `35abe1ba908f232b003f6a1fcd8489509caaaa0b` has Muse's exact-head approval and remains on `codex/v1-compact-on-load`, outside the deployed ancestry. [Deployment run](https://github.com/helper-gsps/gsis/actions/runs/44302602255) · [Muse review](../review/pr-compact-on-load-muse-review.md)

The approved branch's Deploy browser case covers a late-added table control. Its width reset covers replaced rows with changed values. It retains manual widths on identical-data refreshes and in-place row updates. Integration acceptance must cover each Deploy table's initial load and completed Refresh, including reused rows, delayed controls and previously expanded widths. Apply compaction through the renderer where a fixed schedule layout needs to preserve period columns or merged cells. Check that drafts, selections, filters and a Save click in progress survive. This entry records the owner's hosted observation and repository ancestry. Per-view hosted verification is pending.

## Where venue data comes from

Physical venue identity and metadata belong in the native Venues catalogue. Class/TG allocations belong to the selected Deploy version. Dated occupancy comes independently from imported aSc timetables. Venues bookings overlay that imported source. Keep the [approved venue design](../../v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md) and [owner responses](../review/v1-venue-allocation-design-claude-review.md); this task does not reconnect timetable activation to Deploy publication.

The [Run B ledger](../../v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md#continuation-1200-to-1207-sgt-15-november) records 143 rooms seeded on 15 November using the separately authorised guarded fallback. That historical evidence is not a fresh live inventory check.

For rooms already in the catalogue, the current frontend path is:

1. Deploy → Versions → **Refresh venue metadata**, copying rooms into the selected draft while retaining its `form/forms/uses`.
2. IP Deploy → **Venue** picker → assign the class/TG → **Save to online**.

Program Settings → Venues only clears allocations; it does not create physical rooms. IP/TG Excel import references rooms already in the draft, and cannot seed inventory. Layout's Initial source setup imports its own snapshot for an empty year; that is a different store, not the shared Venues register.

The missing native metadata panel has a specific adapter gap: the copied Administration renderer expects `data.register`, but the native admin response never includes it. The current UI otherwise edits existing policies/aliases. Native `importVenues` has a `venues.admin` gate, but no frontend entry, and requires integer seating capacity instead of retaining an unknown value. Preserve stable room IDs, aliases, policy and unknown capacity in the later repair. ISH-1A/B remain explicit aliases of one physical ISH-1 with two interchangeable class slots; do not infer physical partitions from their spelling.

## Checks actually performed

- Read-only source/contract comparison at the pinned sources. Relevant original v0.9 files were not edited. Parent and delegated investigations are all **Model: Codex**, not an independent Muse review.
- Real locally built v1 browser backed by isolated synthetic Core/owner Workers and D1. Build checkout `20e5c4032b3d669715b79bd52654edc9c5033353` has full Git tree `e3bc4ec5f7fd8bd857924046e61a904af02573da`, identical to deployed source `1c42db7`.
- Comparator serves exact `git show d9d180ced16d32c836a94d67d9cff8d3030eb21d:public/<path>` assets with the same cloned synthetic bootstrap data. This does not exercise v0.9 Apps Script/backend behavior.
- Seven views, both frontends, desktop 1,440×1,000 and narrow 390×844. Main capture has 28 screenshots; detail capture has 16 measured cases plus the causal DOM-only screenshot. No page errors. These are captures, not 44 additional automated product tests.
- Browser was installed Chromium **155.0.8059.79**, not the release fixture's locked Chromium 151. The initial private probe lacked its default browser; rerun explicitly selected the installed binary. A private collector initially mishandled Duty rowspan continuation rows and was corrected. Neither collector failure is an application failure.
- Actual synthetic `/change` Create/New versus Duplicate requests and stored-source preservation check for PAR-03. No Google fallback or hosted request.

Successful browser command, from the existing eligibility worktree:

```sh
TZ=Asia/Singapore XDG_CONFIG_HOME=/tmp/gsis-parity-xdg GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node /tmp/gsis-v105-frontend-parity-probe.mjs
TZ=Asia/Singapore XDG_CONFIG_HOME=/tmp/gsis-parity-xdg GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node /tmp/gsis-v105-frontend-parity-detail.mjs
TZ=Asia/Singapore XDG_CONFIG_HOME=/tmp/gsis-membership-new-version-proof-xdg WRANGLER_LOG_PATH=/tmp/gsis-membership-new-version-proof-wrangler.log node --input-type=module < /tmp/gsis-membership-new-version-proof.mjs
```

Local evidence is retained under `/tmp/gsis-v105-frontend-parity/`, `/tmp/gsis-v105-frontend-parity-detail/` and `/tmp/gsis-membership-new-version-proof.log`. It contains synthetic identities only. Evidence JSON SHA-256 values are `452035bfe914dc121e912efd99b5a9704b6d63202f959ed897e104e7e9ea4d32` and `263ce37c22e5c2426fe26e3fdbcaef34683a6746cdfd1b7f94a7655862c64bc4`. Probe-script SHA-256 values are `3127db25ca53fc4cb9bdbae05c06efc3b4f76fb9734f6cc6115f9a1d75b61b17` and `924d84a8ba0f893c08842e36b1efb85ac839c3fe3d161cb314d757cbfd2968fc`. Private probe files are not committed regression coverage; add reproducible tests with each functional fix.

The New-version request probe's script SHA-256 is `1fc7058d0a9f14c73fe7655339b90f795ce2ec08d0ef1a28a246ac7325b214f4`. The source remained unchanged; this proof does not claim that the owner's saved version was created through that route.

Connected-browser controls are not exposed in this session. The owner's screenshots and synthetic built screens were inspected; no authenticated session or live source was borrowed. Hosted UAT, live editing/import, notification behavior and hosted restore remain **Not tested**. This documentation-only task does not rerun the canonical build or full suite and does not transfer prior CI to unimplemented fixes. F5 stays **OPEN**; T1B-01/T1B-02 and N-1 latency remain **Not tested**.

Skill/method record: the browser skill `c2/control-browser` was checked, but its connected-browser tool was unavailable. Local synthetic Playwright comparison, source tracing and boundary inspection were used instead. The writing-cleanup skill `c12/unslop` was read for this record. No package installation, external messaging, skill redistribution or skill-created authority.

## Handoff

Publish this changelog only after single-file scope, relative-link and whitespace checks. Do not call these findings fixed or deploy them through the previous reviewed heads. Finish the CCA/PLT/Event policy clarification, then claim small functional jobs independently: restore group layout and initial compact presentation; repair New-version inheritance; enforce the confirmed department move consistently through native saves/imports; restore the missing venue-maintenance frontend. Coordinate the existing Teachers visual queue and PR205 rather than silently taking their sources.

Each functional PR must include its own exact file claim, real built-browser geometry/interaction checks, native Worker/D1 tests where mutations change, canonical build/no-drift checks, required exact-head CI and Muse review. Preserve identity, school, capability, revision, stable IDs, idempotency, receipts, drafts and history. No deployment or live-data action is authorised by this assessment.
