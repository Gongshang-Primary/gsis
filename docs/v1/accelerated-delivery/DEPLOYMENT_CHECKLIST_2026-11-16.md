# v1 next deployment: preparation only

Model: Codex. Independent reviewer: Claude, at this document's exact PR head. **No deployment, hosted inspection, backup, migration or provider action has been run for this checklist.** Checkboxes are pending actions, not completed evidence.

## Pinned inventory

- Last verified hosted release: [`26bbccd229962700409bb6e9c80b1e9bec170d20`](https://github.com/helper-gsps/gsis/commit/26bbccd229962700409bb6e9c80b1e9bec170d20), recorded in [Deployments](../../coordination/DEPLOYMENTS.md). Do not infer the current hosted version from main.
- Inspected main: [`056e003fc5da4c770fa14c80073ec82f296e5b33`](https://github.com/helper-gsps/gsis/commit/056e003fc5da4c770fa14c80073ec82f296e5b33). The release candidate must be pinned again after any later merges. This is not a fixed implementation base.
- Owner decisions: main [`ccab5f75f55f6310748ee2167b58566c4ca53e30`](https://github.com/helper-gsps/gsis/commit/ccab5f75f55f6310748ee2167b58566c4ca53e30), [Contacts/Drive answers](../../coordination/review/v1-contacts-lifecycle-and-pr184-r2-claude-review.md) and [Venues answers](../../coordination/review/v1-venue-allocation-design-claude-review.md). Use the documents' Owner responses sections; do not revive withdrawn recommendations to wait for deployment before coding.

| Merged work since the hosted release | Release impact / source inventory |
| --- | --- |
| #160, #161, #164, #163 | Deploy venue publication, saved-draft controls/clear permission and Contacts save recovery. Exact heads and merge hashes: [15 November merge inventory](../../coordination/tasks/v1-merge-records-20261115.md). |
| #165–#175, integrated together by #175 | Fortnight save, aSc subject identity, LORD cart/custody projection, Deploy/LORD recovery, venue uses/fences, Venues navigation, Roster settings, Contacts projection/classification and recovered-save status. One merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`; its product tree matches reviewed `d3f24176`. See [chain recheck and amendment](../../coordination/review/v1-pr175-chain-claude-recheck.md). |
| #176 | Contacts direct editing, eleven free-text fields, explicit Memberships, signatures and history; **stored value schema 2**, even though there is no new SQL migration. [Review and deployment conditions](../../coordination/review/v1-pr176-claude-review.md). |
| #178 | Test-only operation probe; no hosted feature. 27 missing-handler exceptions remain at the pinned main. |
| #181 | Stapler leases, baseline identity/multi-room mapping and estimated allocation when no publication exists. Merge `1754c535738adb1cad8dd328f45dd60ea6580f03`; [review](../../coordination/review/v1-pr181-claude-review.md). |
| #136, #137, #144, #157–#159, #162, #177, #179, #180, #184; intervening design/claim/review commits | Documentation, requirements, evidence and coordination, not feature activation. #156 is a v0.9 release record, not a v1 runtime change. |

PR #184 merged at `5386513881734c8b9177896b9a89bb19ae42324f`, second parent exactly reviewed `720fe385adaabde05fe2908c0fcf2968a3861d90`. Required CI [43792352877](https://github.com/helper-gsps/gsis/actions/runs/43792352877) passed at that head. Merge tree `96e962b5967931909448d6d7ffd73fcb04ccd1c4` equals the clean simulated merge against `ccab5f7`; only its design and task documents changed. No activation follows from this merge.

**Merged after the first checklist inventory:** #183 at `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`, independent Roster workload snapshots and Roster `0005_workload_snapshot.sql`. Claude approved that exact head in main `00a5e6d6a205c3ed132e9b401cf1b6cef12e1e1b`. Merge `056e003fc5da4c770fa14c80073ec82f296e5b33` has that exact second parent and tree `1fd9545fda2f4530e6f94070ba9011cd9e82f4c8`, equal to the clean simulation. All product paths match the reviewed head. Both exact-head CI runs, 43795959570 and 43795964452, passed. Roster 0005 is now part of the merged inventory; it has not been applied to a hosted database. Its code fixes Deploy editing blocked by Roster and ensures that, once a publication pointer exists, Roster uses only its verified immutable publication; saved edits do not make it estimated. A corrupt/missing pointed-to publication is still an error. Do not deploy the superseded #183 head `9d6db12`. #182 is a separate draft v0.9 absence hotfix and is not included or approved by this checklist.

## Before selecting a release

- [ ] Refresh main, PR heads, claims, exact-head reviews and CI. Select one full SHA; include the new merge inventory and actual migration diff. Ensure the workflow's resolved main SHA is the reviewed/tested candidate before approving its environment job.
- [ ] Confirm the next release label is **v1.01**, as the owner requested, and show the exact source SHA in release evidence. This checklist does not change a version or build input.
- [ ] Run the required canonical build with no generated drift, Node/LORD suite, product suite, migration upgrade checks and Worker dry runs at the candidate. A green PR alone is not combined-main proof. Record failed or omitted checks honestly.
- [ ] Obtain the owner's explicit deployment instruction and browser environment approval. Keep `main` only, required reviewer(s), administrator bypass off. Do not approve on the owner's behalf or bypass the gate.

## Data and rollback gates — before applying any migration or new build

- [ ] **#176 C-1 Memberships:** the [later owner decisions](../../coordination/review/v1-contacts-lifecycle-and-pr184-r2-claude-review.md) settle the policy: Memberships is an explicit tag; publishing overwrites all eleven tags immediately, including stored blanks. They do not prove current migrated records are complete. Record current-staff Memberships readiness and the KP/non-KP source/sink checks from C-1, or an explicit owner release disposition. The new Duplicate refresh implementation is not on this pinned main. Never fill tags or authority by inference.
- [ ] **#176 C-2:** take and verify a full Contacts D1 backup **immediately before deployment**, before any schema-2 write; record resource identity, source release, UTC/SGT time, backup/export identity, row/schema evidence, integrity digest where an export is available and recovery custodian in a private release record. Never commit the backup or staff data to this public repository.
- [ ] Take corresponding pre-release D1 recovery snapshots for **Core, Deploy, Roster, Calendar, LORD, Venues and Layout**, and record all eight owners separately. Confirm the chosen browser-accessible backup/export and recovery mechanism actually works. The current deploy workflow does not take these backups. If the dashboard/approved workflow cannot supply verified recoverable evidence, stop the deployment rather than inventing a command or treating a Drive XLSX as a D1 backup.
- [ ] Record an R2 object/version inventory for affected baseline, publication, attachment and export objects. Preserve all referenced objects and operation/audit journals; no pruning, bucket clearing or retention change is part of deployment. A D1 snapshot alone does not capture R2 bytes.
- [ ] **#181 C-1:** fix ambiguous saved-version selection before relying on no-publication estimated allocation, or verify there is one unambiguous matching saved version. Never silently choose the newest of multiple matches or report missing workload as zero. This follow-up is authorised but not yet merged at the inventory SHA.
- [ ] **#181 C-2:** export each baseline before a rollback after a multi-room save; old readers may not understand the new room arrays. Keep the source file and mapping evidence privately. Export is a safeguard, not proof that an older version can import the new format.

Owner recovery policy is **re-import through each application's own screens**, with every supported Excel import tested. There is no generic restore endpoint. The pre-release D1 backup is still required for #176's incompatible storage rollback; this checklist does not authorise a database restore. After schema-2 writes, do not simply roll back Contacts code: stop writes, preserve subsequent data and obtain an explicit recovery decision. Re-import and disaster recovery are different actions with their own validation.

## Migrations and apply order

At the inspected main, `git diff --name-status 26bbccd229962700409bb6e9c80b1e9bec170d20..056e003fc5da4c770fa14c80073ec82f296e5b33 -- v1/migrations` lists exactly one addition: `v1/migrations/roster/0005_workload_snapshot.sql`. No earlier migration changed. Stored Contacts schema 2 and multi-room baseline format also change compatibility.

For a candidate including merged #183, include `v1/migrations/roster/0005_workload_snapshot.sql` to the manifest and take the Roster backup first. Apply it only to the existing v1 Roster D1 before the updated Roster Worker. Inspect its exact SQL and the local old-schema-to-new-schema test at the selected head. It adds Roster-owned workload evidence; it is not permission to copy live data or migrate any other owner. Never renumber, delete or rerun an already applied migration as a repair.

- [ ] Diff the final candidate's migration paths and compare with each hosted owner's migration ledger under separate release authority; reconcile any mismatch before apply.
- [ ] Use the existing browser-triggered [v1 deployment workflow](../../../.github/workflows/v1-deploy.yml). The [deploy script](../../../scripts/v1/deploy.mjs) applies owner migrations and uploads Workers; verify its logs instead of assuming a successful dispatch means completion. Record per-owner migration results and all nine Worker source SHAs.
- [ ] Keep `upload_provider_credentials=false` unless separately approved. Keep sender/webhook ownership on v0.9, scheduler disabled, Drive backup inactive and retention deletion disabled. No provider test send or automatic backup activation belongs to this release.
- [ ] On partial migration/upload failure, record exactly which steps completed. Do not automatically rerun, revert schemas or clear stores. Reconcile durable results before proposing a recovery action.

## Hosted acceptance after separately authorised deployment

Every entry below is currently **Not tested**. Re-run the actual source/sink browser flows in [Run B](UAT_RUN_B_2026-11-15.md) and the [15 November queue](../V09_V1_TRACE_LEDGER_2026-11-15.md), then append actual timestamps and the hosted SHA to their evidence. Local tests and historical data-entry counts are not hosted proof. Use a separately approved test/migration dataset; this document grants no live-data access.

| Area | Required browser evidence |
| --- | --- |
| Release shell | Home/apps/Admin routes, login/session, build label/SHA, correct subpaths and navigation; no provider ownership drift. |
| Contacts, RUN-B-003/004/021/023/024 | Alias/EXT/classification round trips; ordinary one-field save preserves untouched fields; distinct qualified names; explicit Memberships; DIY and signature generation; receipt recovery and rejected/stale/unauthorised writes preserve drafts. Exercise supported Excel export, preview and re-import. |
| Deploy, B-D01/B-D02/B-D03, UAT014/019 | Both planning versions: save, reload, Fortnight save, venue controls, aSc subject identities, new/duplicate version and publication receipt recovery. Do not publish just to test without separate authority. With merged #183: publish, edit that draft, read Roster and auto-publication; workload remains verified and Deploy remains editable. No-publication allocation is explicitly estimated and automatic publication remains blocked. |
| Roster, RUN-B-011/025, B-R02/B-R03/B-R04 | Baseline upload with exact teacher bridges and multi-room mappings; unresolved choices retained after failure; inactive ad hoc identities; System Config and SMC duty save/reload; Stapler lease/save/reload; capacity and automatic allocation including negative guards. Time the save/capacity-warning path (N-1), record latency and compare with the earlier run. |
| Calendar, B-CA01/B-CA02 | Year structure matches source; multi-room event edit/save/reload; weekly PDF/Excel and import round trip; accepted receipt differs from durable save/publish. Unfixed findings stay open. |
| LORD / OVERLORD, UAT021–023 | Cart-level booking with physical trolley custody, capacity/member links, existing cancellations, owner refresh, collection/return and save recovery. No Telegram/WhatsApp delivery claim without separately authorised provider evidence. |
| Venues / Layout, B-V01 | Seed/import through app screens, timetable occupancy, booking conflicts and missing-coverage notice. Alias/capacity redesign remains future work on this inventory. Never displace existing bookings automatically. |
| Imports and recovery | Test each supported app Excel importer through its browser against the backend, including malformed/stale/foreign-school data and interruption/retry. Preserve IDs and prove the durable result after reload. Unsupported formats remain unsupported; never replace a failed import with a generic restore endpoint. |

G03 was rechecked locally on main `5386513`: an empty school's built `currentDuty` home request returns `200`, `available:true`, `people:[]`. The existing real browser/Worker/D1 regression `tests/v1-product-roster-locks-browser.mjs` passes. It is already disproved as an empty-school defect; hosted verification remains separate. The generic trace's future-date request is not the home request.

## Completion record

- [ ] Record owner release authority, exact SHA, artifact identity, backup references, migration results, per-Worker versions, UTC/SGT apply times, hosted test results and rollback limitations in [Deployments](../../coordination/DEPLOYMENTS.md), without staff data or credentials.
- [ ] Keep F5 **OPEN** until durable recovery is demonstrated. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
- [ ] Reconcile the probe's remaining entries individually. The current count is 27; future F08 removal must ship with its actual built-caller removal and tests. A static count is not acceptance.

Next owner release decision: whether to authorise deployment of a newly pinned, reviewed and green candidate **after** the backup and data-readiness evidence above exists. No deployment decision is requested merely to continue the already authorised bounded implementation work.
