# GSiS 0.9.9 development handover

Start here when continuing this source. This release consolidates current GSiS components and Calendar improvements while Roster remains Google-first. Worker-first Roster processing is a staged parallel programme, not an activated production backend.

Read the final release changelog, [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md) and [ROSTER_WORKER_ROADMAP.md](ROSTER_WORKER_ROADMAP.md), then the setup/manifest and validation evidence produced with the release. These files supersede stale “no backlog” assertions in old release notes. Historical statements such as “not deployed” describe their original date unless later operator evidence updates them.

## Starting state and pivotal decisions

- Source baseline for this work: Calendar Q, `50c977d79c9756dfdbee91f2922f0cd89ab6e903`, based on P. Q changed the Calendar pair; the other sixteen production components were P. 0.9.9's manifest is the final component inventory; it must be verified after generation.
- The user-supplied P rollout report records all eighteen components installed, a working Calendar command queue and an unedited native timetable export/import. It does not establish Q/0.9.9 installation or a production timetable/ledger cutover. Its sanitized evidence summary is in the requirement register.
- Roster Pages and notification entrypoints apply `rosterRecoveryEnvironment`. Keep Google authority, the existing absence pipeline and current endpoint/credential/storage/schedule ownership. Historical migration routes are disabled. Do not flip `ROSTER_EDGE_AUTHORITY=d1` to enable timetable caching.
- Deploy has its own configured authority boundary. Preserve its working route; Roster's recovery rule is not an instruction to migrate or revert Deploy.
- Calendar source is native `SpreadsheetApp`; Google Calendar API v3 is a separate provider target. Event save, durable queue acceptance and provider sync are different outcomes. Preserve `CALENDAR_SYNC_CONTINUE=false` and one continuation owner if a later operator deliberately changes it.
- Optional Calendar push tracks supported Pages writes and queue state through a D1 journal and `CalendarChangeHub`, with authenticated cursor catch-up. It is off until schema/binding setup and both `CALENDAR_CHANGE_PUSH` flags are enabled. Only enabled mode removes idle data/status polling; disabled mode retains existing 15-second queue/focus behavior. It does not detect every direct Sheet/Apps Script/older-route write; manual Refresh and explicit uncertainty remain necessary.
- Confirmed Stapler intent is independent of a changed or absent baseline. Baseline comparison cannot move cards or revoke confirmation. Suspended days skip formula calculation while keeping enabled allocation policy, verified capacity and relief accounting.
- Manual Auto-allocate and Auto-fill blanks work at any hour for eligible unstarted current/future work. Preserve started/published/manual/peer protections and the scheduled optimiser's cutoff.
- Receipt identity and unknown outcomes are durable evidence. A timeout, expired lease or code deployment is not proof that a write/send did not happen. Never clear uncertain work merely to remove a warning.

## Code map

| Area | Authoritative source and purpose |
| --- | --- |
| Roster production gateway | `roster-update/public/_worker.js`; session/authenticated operation routes and generated transport integration |
| Roster recovery and transport | `shared/roster-recovery-profile.js`, `shared/roster-absence-transport.js`; Google-first boundary and durable intake |
| Portable Roster rules | `shared/roster-operations.js`, `shared/roster-allocation.js`, `shared/roster-stapler.js`; preserve domain policy across runtimes |
| Google Roster storage | `backend/RosterOperations*.gs`, `backend/RosterTimetablePreparation.gs`; current authoritative operations and read-only native export |
| Roster UI | `roster-update/public/roster-operations-ui.js`, `roster-stapler-ui.js`, `roster-learning.js`; views, drafts, exact recovery and learning UI |
| Existing broad D1 implementation | `operations-worker/`; historical full operational route, not an activation instruction or timetable-only service |
| Isolated simulation | `rehearsal-worker/`; synthetic operation ledger, local/shared domain rules and simulated outbox |
| Native timetable preparation | `timetable-prep-worker/`; restricted admin auth, native schema/hashes, private objects and atomic import pointers |
| Calendar UI/source | `calendar-update/public/`, `calendar-backend/Code.gs`; durable command UI, native source writes and provider sync |
| Calendar command service | `calendar-job-worker/`; isolated dedicated D1 jobs, ordered dispatch and receipt-first recovery |
| Notifications | `notification-worker/`, shared job/outbox helpers and Google notification backend; preserve provider outcome identities |
| Release construction | `scripts/`, `package.json`, release manifest; regenerate copied/bundled sources using canonical builders |

Generated browser/domain copies and bundled Workers are not independent implementations. Change canonical sources, run their builders, then verify parity. Consult the release's exact scripts rather than assuming an older patch filename or component count.

## Evidence and limits

The native preparation live report proves source bytes/projection hashes, isolated storage/readback and exact replay for its snapshot. It does not prove current Calendar dated parity, current staff mapping, continuing freshness, normal-user authorization, production load or a writer handover. The separate `GSiS_v0.9.9_Timetable_Preparation.zip` harmonises its labels while retaining the compatible O wire protocol and existing isolated storage. See [TIMETABLE_HANDOVER_STATUS.md](TIMETABLE_HANDOVER_STATUS.md) and the separate preparation validation; it is not an extra production authority component.

Q retained 13 inherited unpassed programs in its broad suite. Read `docs/v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md` before interpreting the count: historical source inputs are absent for four; three share the old response-size assertion; six encode superseded policy/storage expectations. Programs stopping at a failed assertion do not cover later cases. 0.9.9 must retain its own command results and classify any newly observed failures; do not reuse Q's counts as a current full-run claim.

No local test demonstrates production deployment, school sign-in, real message delivery, live throughput or safe authority cutover. The final generated-artifact/package checks and 0.9.9 feature verification are release-owner evidence, separate from this handover audit.

## Calendar receipt investigation state

The authorised live deletion at 15:22:50 Singapore time on 28 October affected only event `EVT-cf944212-4a4f-4b34-adc4-40d31ca7de90`. It used a direct Sheets atomic field/audit batch, outside the Apps Script lock, and was checked by two readbacks. Preserve the distinction between these receipts:

| Receipt | Last established state |
| --- | --- |
| `68552ad2-f1ab-44f8-81e0-7ddabc8a24a6` | New deletion receipt committed. |
| Earlier receipt beginning `9db06ad7` for that event | Rejected as `SUPERSEDED_BY_ADMIN_DELETE`; `originalOutcome: UNKNOWN` retained. Recover its full identity from retained operator evidence before further investigation. |
| `4e49bd29-dea7-422e-9467-bd5c95c6ec7f` for `EVT-d0034715-55ae-443b-b480-0c79ac0ff74f` | Separate orphan `DISPATCHED` receipt, untouched. Its outcome is unresolved. |

The P rollout report did not name the P-1 event/receipt. Do not infer that this deletion cleared every uncertain source save, or that an old provider attempt was rejected. Installing 0.9.9 does not repeat the deletion.

## Resume development

1. Verify the unpacked manifest/hash inventory and read current release validation. Run the documented build and focused checks before changing authority-sensitive code.
2. Check the requirement register's current release and operator work separately. Do not reimplement H–Q requests just because their older proposal is still present in historical notes.
3. For Roster, begin with route/writer measurement and administrator-only timetable comparison. Add current Calendar parity and Contacts identity evidence; keep Google answers authoritative. Implement a single queued-operation family only after its receipt/recovery contract is explicit.
4. Keep pending live operator tasks visible: remaining uncertain Calendar receipts (one blocked event was separately deleted with uncertainty retained), live sync completion/throughput, parent-side queue use, queue health, preparation two-tab stale race, OAuth origin review and all-app version/data-load sweep.
5. Append future scope, evidence, before/after authority, configuration and rollback limits to the roadmap/release changelog. Promote a stage to complete only with the stated evidence.

The user asked for a full release with enough history for another LLM, not an archive of every previous package. Retain current source/build files, focused contracts and selected raw validation/review evidence. Keep an included/omitted index and hashes for the delivered source. Omit duplicate production snapshots, large obsolete artifacts, secrets and raw staff data. Do not delete production records, rewrite Git history or cull live D1/R2 objects as part of delivery pruning.


## 29 October 2026 local preparation continuation

The [chunked import task](../coordination/tasks/roster-d1-chunked-import.md) now owns canonical immutable export/session/staging code in `backend/RosterEdgeMigration.gs`, `shared/roster-import.js`, `shared/edge-store.js`, `shared/edge-setup.js` and `roster-update/public/edge-roster.js`. Generated copies come from the existing builders. Resume the original actor/request/session; do not recover a failed capture by silently reading current operations under its old request ID. A verified uploaded container can be adopted after acknowledgement loss; bytes never uploaded require explicit new-request restart. Staged rows, source containers, object segments and receipts remain evidence.

The final local workerd/D1/R2 measurement passed a 14.9 MB source with an 8 MiB JSON object: 55,459,509 bytes sampled peak isolate memory and 159.78 ms maximum sampled active CPU. This fits the tested 30-second paid CPU budget assumption; the account plan, Apps Script runtime/Drive quotas, live school acceptance and free Worker CPU tier are not established. See the [task's final verification](../coordination/tasks/roster-d1-chunked-import.md) and [tracked runtime evidence](../coordination/review/roster-d1-chunked-import-runtime.json). Claude's exact-head review remains required. Both operational scopes stop at imported; Google remains authoritative and the existing activation digest fence is unchanged. No deployment or message was performed.


Retained preparation is admitted up to **eight sessions** in both Google and D1. Google checks descriptor count under its script lock before capture; D1 checks session count in the reservation transaction. Existing identities can still resume at capacity. A ninth new request fails clearly and requires reviewed archival/cleanup; no uncertain evidence is automatically deleted. This bounds repeated restart/new-request storage growth while retaining recovery evidence. Focused tests cover the cap, existing-session resume and concurrent claims for the final slot.
