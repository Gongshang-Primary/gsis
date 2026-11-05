# roster-d1-fresh-start: start Roster on D1 without history and without baseline timetables

- Status: implementing route C continuation; Codex, lane R; PR #79 targets main
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 5 Nov 2026 16:25

## Owner request
"write up also D1 start from no history no baseline timetable". Context: the owner is ready to forgo historical records ("not much as I just started this project") and re-upload baselines and redo Stapler plans, instead of a full import.

## Principle
Google stays frozen and read-only as the archive (records are kept, not migrated), so the "keep records" rule still holds. D1 starts clean.

## What D1 starts with
| Data | Fresh start |
|---|---|
| Staff, SMC/Admin roles | From Contacts (already live via references) |
| Published Deploy data (classes, subjects, teaching groups, venues) | From Deploy (already live via references, #54) |
| System Config (workload limits, exclusions, rules, notification settings) | Copy the small config object from Google (one step), or re-enter |
| Name bridges | Copy from Google, or re-enter |
| Baseline timetables (register + day models) | **Empty**; owner re-uploads through the normal Roster timetable upload on D1 |
| Stapler plans | **Empty**; owner redoes them |
| Relief history, absences, assignments, audit, acknowledgements, outbox, inbox | **Empty** (history stays on Google) |
| Accounting year R counts (fairness) | Owner choice: (a) reset to 0, or (b) carry one opening balance per teacher (relief done, quota) as a single dated "opening balance" record |

## Build
1. A new edge-setup path "Start fresh on D1" (Admin, behind a typed confirmation), separate from Import. Preconditions: Google frozen; D1 heads legacy or reset; optional config copy taken from a signed Google read.
2. Creates empty but schema-valid `roster` and `roster-register` states (revision 1) plus the copied config (and opening balances if chosen), marks both scopes `imported` with a `freshStart:true` manifest and a digest, and records an audit event. Parity for a fresh start = config digest matches the Google config read, plus registers/states are empty by design (no history parity).
3. Activation reuses "Activate verified owner" unchanged after this; Cloudflare flags as today.
4. The timetable upload and day-model preparation must work on D1 with an empty register (first upload becomes active). Verify the D1 upload path end to end.
5. Rollback: "Switch back to Google" restores Google as authority; D1 writes since activation are listed for re-entry (same as today). Google data is unchanged throughout.
6. Statistics, My Calculations, history views: show "since <fresh-start date>" and link to the Google archive for earlier history (read-only).
7. Tests: fresh start → upload a baseline → absence → Auto-allocate → reload twice (no cancellations) → publish → WhatsApp queued; opening balances honoured in fairness ordering; config copy digest; refusal when not frozen or not reset.

## When to use
Best at a natural break: the school holidays or the new school year (January 2027), when the accounting year resets anyway and new baselines are uploaded. Owner decides; this is the fallback if full imports keep failing.

## Owner ruling (5 Nov 2026): opening balances, entered by Admin
"give admin only place to enter. should be a filterable list of teachers with cumulative quota to date and cumulative relief done to date, like an excel sheet interface"
- Fairness option (b): one opening balance per teacher, entered by an **Admin only** (SMC can view, not edit).
- Screen: Roster → Admin → **Opening balances** (fresh start only, also usable later to correct a balance with an audit reason).
- Spreadsheet-like grid: one row per active teacher from Contacts; columns **Teacher**, **Cumulative quota to date (periods)**, **Cumulative relief done to date (periods)**, **As of date**, **Last edited by/at**. Filter box (name, department/role), sortable columns, keyboard entry (Tab/Enter moves cells), paste a block from Excel (two numeric columns aligned by teacher name, with a preview of matches and mismatches before saving), CSV export.
- Validation: whole numbers 0 to 9999; done may exceed quota (warn, not block); unknown or duplicate names in a paste are listed and not saved.
- Save: one Admin command with a receipt; each changed row becomes an audited "opening balance" record (as-of date, values, actor, reason); fairness (R% and allocation order) = opening balance + relief recorded on D1 after the as-of date. Never double-count: relief dated on or before the as-of date is ignored for fairness.
- Prefill option: a one-off read of the frozen Google Roster to propose current values (Admin reviews, then saves), so manual typing is only for corrections.
- Tests: Admin-only edit (SMC 403, teacher hidden), paste preview and mismatch handling, audit per row, fairness ordering uses balances, no double count across the as-of date, CSV round trip.

## Owner decision (5 Nov 2026, afternoon): route C chosen
After v0.9.9l timed out on the Google Assign Relief read (UPSTREAM_TIMEOUT, 6 Nov, about 30 s; owner rolled back to j the same afternoon), the owner chose the D1 fresh start ("C") as the way to restore a working allocator, instead of a fresh Google file (B, rejected) or archive-only (A, still allowed as a stopgap).
- Status: authorised; Codex, lane R, TOP PRIORITY (ahead of the Google speed fix, which stays next).
- Step 1 (now): rebase PR #79 onto main (now containing #80 b72fb48 and #78 324062a; release label 1f759a9), retarget its base to `main`, resolve conflicts with the Stapler delink (#78) and the clock/dependency scope (#80), keep the canonical build current, full CI green, exact head for Claude.
- Add the opening-balance prefill from the frozen Google Roster (in the ruling above; #79 as built has entry/paste/export but no prefill).
- Open owner questions (Claude asked 5 Nov): cutover night; whether future-dated absences (on or after the start date, including long leave) are carried from Google automatically.
- Owner answers (5 Nov): future-dated absences are NOT carried; the owner re-enters them on D1. Timing: move fast while the school year ends (term baseline runs to 20 Nov); cutover as soon as #79 is reviewed and merged. Out of scope: any Google-to-D1 copy of absences, assignments or Stapler plans.
## Design for review

- Owner/model: Codex
- Branch: `codex/roster-d1-fresh-start`
- Dependency: #78 and #80 are now on main. PR #79 was retargeted to main and rebased onto `f84f8196761f8ca53c57cf8a2e8e26477348dbb7` for the route C continuation.
- Scope: Roster's signed Google migration bridge, D1 import/fence/rollback, accounting and history projections, edge setup and read-only archive UI, focused and end-to-end tests, canonical generated copies.
- Excluded: deployment, live freeze/import/reset/activation, live messages, full historical migration, Deploy authority changes, Cloudflare flags or bindings.

### Small source capture and empty import

Add an Admin-only signed `edgeFreshStartSource` operation. It requires the confirmed freeze and binds its retained receipt to the actor, request, freeze and Singapore start date. Read only settings and name bridges. Capture `systemConfig`, `nameBridges`, `nameBridgesSeeded`, `dailyEmploymentSettings` (notification settings outside `systemConfig`), and absence `types`/`typeDetailsVersion`; leave secrets in their existing environment. Normalize the copied settings through an empty schema-valid state and compare the actual D1 settings digest after validation. Record the original Google document identities. Do not call the full-history snapshot builder or prepare any baseline/Stapler objects. A separate optional signed read may propose opening totals for Admin review; that proposal never saves balances automatically.

The Worker `freshStart` action accepts that server-selected source, verifies its digest, and refuses active/paused heads, incomplete reset cleanup or a conflicting retained import. Reuse the existing reserve/stage/finalize transaction so both scopes become `imported` together at head revision 1. The operational document also starts at revision 1. Create an empty `GSISRosterOperations.initial()` document plus validated settings, a fresh-start audit event and metadata; create `{schema:1,revision:1,entries:[],receipts:[]}` for the register. No historical absences, duties, messages, plans, audit rows or receipts enter D1.

Retain `freshStart: true`, `effectiveDate`, `fairnessMode`, `configDigest`, `sourceDigest`, `freezeId` and `archiveId` in the manifest and operational state. A repeated request with identical settings returns its saved receipt. Changed input under the same request refuses. Interrupted preparation resumes safely through existing import records. Fresh-start parity proves matching settings and intentionally empty historical collections; it must never claim full-history parity.

### Activation, archive and rollback

Keep the existing **Activate verified owner** UI and transitions. Its Google fence gains a separate proof branch selected by the retained fresh-source receipt: verify the original freeze, document identities and settings digest, then set the same writer-fence properties. This branch does not hash or traverse old histories. Ordinary imported snapshots retain their current full-source checks.

While fresh D1 owns the records, original Google documents remain frozen and read-only. Add an authenticated archive route that admits only fixed read projections with current Contacts permissions. Invoke pure history/statistics/calculation projections, never the normal read dispatch that can reconcile and write. Reject caller-supplied file IDs and all mutation operations. A normal app URL is not an archive link because it follows current D1 authority.

Suppress ordinary Google mirror processing for a fresh epoch in both Worker and backend. The existing mirror release installs D1 document pointers and would replace the Google archive, so it must refuse this mode. **Switch back to Google** instead quiesces and pauses D1, retains a report of D1 changes for re-entry, verifies the original Google identities/fence, and releases Google without replacing its data pointers. The owner still changes Cloudflare routing flags. After rollback, the original Google records resume as live writable records; this design does not promise an immutable historical snapshot after that point.

### Timetable and accounting

Exercise the normal D1 upload against an empty register. The first upload is active when its supplied date range covers the requested date; do not silently extend dates. Invalidate the empty day package and prepare the new model through existing timetable machinery. Preserve the prior PR's Auto-allocate/two-reloads invariant.

The later owner ruling selects opening balances. Create an Admin-only spreadsheet-style Opening balances screen for the fresh epoch, visible read-only to SMC and hidden from teachers. One row per active Contacts teacher carries cumulative quota, cumulative relief done, an as-of date and last editor/time. Include partial name/department/role filtering, sortable columns, Tab/Enter navigation, name-matched Excel paste with a preview, and CSV round trip. Unknown/duplicate paste names remain unsaved. Values are whole numbers 0 through 9999; done above quota is a warning. Every changed row has an audit reason and durable receipt; later corrections use the same protected command.

Keep one current `openingBalances` record per teacher/accounting year, with audit history for every replacement. Annual fairness adds that record to D1 relief dated strictly after its as-of date. Weekly quota entitlement whose checkpoint week starts on or before the as-of date is already represented by cumulative opening quota and is excluded from the annual denominator. Weekly capacity and recorded duties remain unchanged by later balance corrections. This prevents double-counting at midweek cutovers. Do not manufacture assignments, weekly entitlements or historical Statistics. Opening values never leak into a later accounting year. Auto-allocation stays paused until Admin confirms the initial grid; an explicit saved zero is allowed, an unreviewed blank is not.

Every statistics, personal-calculation and history projection carries fresh-start coverage metadata. Show **since <date>**, including empty views, and provide a read-only Google archive link. Opening balances appear as opening balances rather than fabricated duty records.

### Internal contracts

The setup request is `{operation:'freshStart', requestId, effectiveDate, copyConfig, confirmation:'START FRESH'}`. Fairness mode is fixed to `opening-balances` by the owner ruling. The server verifies the confirmation, source receipt and all preconditions; a browser-supplied fresh-start flag never bypasses activation checks. Store epoch metadata in `state.freshStart`, dated annual balances in `state.openingBalances`, and expose `{since: effectiveDate, archiveUrl:'/archive.html'}` as `historyCoverage` on relevant projections. Opening-grid reads and saves use normal authenticated Roster operations with server-enforced role checks. The archive page sends only fixed read-view requests through the authenticated archive route.

### Owner decision before a live fresh start

The fairness question is resolved by the later owner ruling: Admin enters and confirms opening balances. The optional Google prefill is a proposal that needs review, not authority to save. A fresh epoch does not import old within-week usage, daily rotation or SRE history; the setup must state that limit. The owner still chooses when to perform a live fresh start. This design authorizes no live action.

### Implementation and verification sequence

1. Add signed source capture, empty-state transaction and config-specific fence, with replay/tamper/precondition tests.
2. Add archive-only reads, mirror refusal and original-Google rollback, with pointer and permission tests.
3. Add opening-balance accounting, the Admin spreadsheet grid and since-date projections; wire the setup and archive UI.
4. Test fresh start, activation, first baseline upload, confirmed Admin opening balances, absence, allocation, two reloads, publication and queued WhatsApp end to end with synthetic data; include Admin/SMC/teacher boundaries, paste mismatches, per-row audit, as-of cutoffs and CSV round trip.
5. Regenerate all canonical outputs, run the complete Node and LORD suite, and hand Claude the exact head.

The design draft precedes implementation. No live Google, D1, R2 or messaging action is part of this task.

## Implementation evidence

The design-only checkpoint was published as draft PR #79 at `9779a8dea776fa10ed20997238ce1b43d1461088`, stacked on draft PR #78 at `640d2b67515ff868a4cd0cf2902e7478d29cd133`. The latter passed the complete 977-program Node suite and all LORD checks before this build started.

The implementation adds the signed small-source capture, atomic empty import and fresh manifest, config-specific activation and read-only drift proofs, authenticated fixed archive projections, archive-safe mirror refusal and paused D1 rollback report. Fresh drift checks do not call the full-history snapshot builder. Original Google document identities are read strictly: a missing captured file or pointer race refuses instead of falling back to a current document. Future start dates refuse. Initial opening balances require explicit Admin confirmation, and later corrections use row versions, a reason, a durable receipt and before/after audit evidence. January proposals use the target accounting year separately from the frozen cutoff, preventing prior-year totals from carrying forward.

The UI includes Start fresh, the Admin/SMC opening-balance grid, paste preview, CSV export/round trip, retained retry identity, Google proposals, since-date notices and read-only archive views. No normal Google mirror is permitted during a fresh epoch. System Health identifies the frozen archive rather than claiming Google remains the operational record.

Focused verification uses synthetic records only:

1. `roster-fresh-start-backend.cjs`: source/freeze/identity/digest checks, bounded Unicode capture, uncertain upload/release replay, strict original-document reads, archive permissions and January prefill.
2. `roster-fresh-start-worker.mjs`: real D1/R2 test bindings through empty import, activation, first baseline upload, Admin opening save, absence, Auto-allocate, two stable reloads, publication and WhatsApp queued; archive/mirror/rollback and retained re-entry evidence.
3. `roster-fresh-start-accounting.cjs`: 11 scenarios covering roles, complete initial confirmation, row conflict/validation/audit, annual and weekly cutoffs, no double count, year rollover and reviewed prefill.
4. `roster-fresh-start-gateway.mjs`: actual Pages route, signed sessions, same-origin POST, input/size bounds, fixed archive identity, current backend roles and no operational mutation.
5. `roster-fresh-start-ui.cjs`, `roster-fresh-start-retry-ui.cjs`, `roster-fresh-coverage-ui.cjs`, `roster-opening-balances-browser.cjs` and `roster-d1-archive-ui.cjs`: setup/retry, confirmed restart/reset recovery, uncertain outcomes, filtering/sorting/paste/CSV, real browser navigation, role boundaries, empty-history notices and archive recovery. Desktop/mobile views were inspected.

Canonical build and 40 LORD programs passed locally. The exact final implementation head and full CI result are recorded on PR #79; the design checkpoint alone is not implementation evidence. No deployment, real messages, production flags, or live Google/D1/R2 writes were performed. Old within-week usage, rotation and SRE history remain outside the fresh epoch and must be considered when choosing the live start date.

## Route C continuation (5 Nov 2026, afternoon)

Codex resumed the existing lane R claim on PR #79 at the owner's instruction. The PR now targets `main`, observed at `f84f8196761f8ca53c57cf8a2e8e26477348dbb7`. The original PR head was `39bde6a1629342a21cc8a283db549d8ae6bfe3cb`. The runtime approval reviewer rejected the documentation-only main claim update; continuation was therefore recorded in the existing PR discussion and this branch, with no main update.

The rebase preserves #78's independent Stapler day snapshots, migration/reconciliation controls and #80's boundary clock and derived balance/rotation dependency checks. Empty import collections and the normal first-timetable upload remain unchanged. Future absences are not copied; the owner re-enters them on D1.

Code inspection found that the original PR already contained a signed, manually requested Google proposal route. This continuation completes the review experience: choose a cutoff, compare current and proposed values, match Google's stable staff IDs, apply reviewed values to the editable grid, then explicitly save with the existing reason, row versions, receipts and audit records. Same-name teachers with distinct IDs are supported; ambiguous pasted names still require correction. Fractional source totals remain visible for Admin correction to the required whole-number balances, never silently rounded.

Six failures from the original PR's CI were reproduced. Fresh metadata/status reads now use SELECT only and do not create D1 tables during Google recovery; unavailable or inconsistent active storage still refuses. A confirmed preactivation state reports the Google backup as unavailable without creating operational heads; running a mirror still refuses. Drift checking handles a captured preparation before its manifest exists. Two backend fixtures implement the real `deleteProperty` operation and verify removal of the stale fresh-epoch marker.

Final review also reproduced an incomplete-activation rollback defect: D1 could be active before Google marked the freeze complete, and releasing D1 alone left Google frozen. Rollback now writes a cancellation tombstone for its matching freeze before removing the authority fence. Lost acknowledgements are retryable; newer freezes and newer D1 owners remain protected. The backend regression checks the actual legacy write guard after rollback.

Synthetic acceptance now checks exact assignment IDs across reloads, a newly created Stapler snapshot before confirmation, a differing replacement baseline plus pruning of the origin, unchanged plan/assignments after two reads, and rollback re-entry entries for every tested write. Opening-balance corrections change fairness and cause one replan; metadata-only edits do not. Rotation remains a separate dependency.

Verification of the final candidate and exact review head will be recorded below and on PR #79. No deploy, live data mutation, real notification, or flag change is authorised by this work. Claude reviews; the owner merges.

### Resumed verification and import-evidence correction

The continuation recovered local candidate `dad0fbea123a7a5313f3be090d993978056be17b`; GitHub still held `39bde6a1629342a21cc8a283db549d8ae6bfe3cb`. Current main remained `f84f8196761f8ca53c57cf8a2e8e26477348dbb7`. The existing claim was refreshed in PR #79 before further edits.

The full regression evidence exposed one remaining product failure: ordinary imported-state evidence export called the fresh rollback metadata check before activation. Reproduced in `roster094-edge-roster.mjs`, then also covered for a fresh import with D1 routing enabled before activation. Export now checks for a retained release before requesting its re-entry report. Missing release tables are treated as no release; database failures and active fresh-owner mismatches still fail. Export does not change either prepared head. Canonical build and the ordinary import, fresh lifecycle, metadata and private-backend regression programs pass after this correction. Full-suite and published-head results follow below.

An internal review also reproduced a manual-entry cutoff defect: an untouched opening grid defaulted to the first D1 day and excluded that day's duties from annual fairness. New rows now default to the preceding day, including at accounting-year rollover. Saved and explicitly entered dates are preserved. A failing-then-passing regression exercises the ordinary grid defaults, confirmation and a completed first-day duty. The canonical build, accounting, full synthetic fresh lifecycle, all 14 dependency checks and Chromium opening-grid test pass after this correction.
