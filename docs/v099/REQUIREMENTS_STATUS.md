# GSiS 0.9.9 requirements status

Audit date: 28 October 2026. This is the current requirement register. Older changelogs retain their historical meaning; a proposal recorded before its later delivery is not a second open request. Release packaging, local verification, operator-reported deployment and production acceptance are separate states.

The release keeps Roster Google-first while preparing a Worker route in parallel. A full-suite version label does not activate the older D1 authority implementation. The future Roster route is tracked in [ROSTER_WORKER_ROADMAP.md](ROSTER_WORKER_ROADMAP.md), with starting context in [HANDOVER.md](HANDOVER.md).

## Previously requested work retained in the current source

| Requirement | Delivered scope | Evidence to retain |
| --- | --- | --- |
| Earlier Assign Relief/cache startup and Stapler save-cost work | 0.9.3 onward. Profile-scoped confirmed grid recovery, bounded Calendar windows and revision-aware allocation references; unchanged confirmed packages/digests reused for Stapler saves. Deterministic work reduction does not establish live latency or eliminate every timeout. | `tests/roster093-allocation-cache-browser.cjs`; `tests/roster093-allocation-reference.cjs`; `tests/stapler093-save-cost.cjs`; `tests/stapler093-confirmed-parts.cjs` |
| Earlier emergency absence and targeted publication notifications | 0.9.3 onward. Verified duty-SMC alerts for the defined post-publication/pre-14:00 window; recipient corrections/removals with publication fences and durable notification identities. | `tests/roster093-emergency-absence.cjs`; `tests/roster093-targeted-publication.cjs` |
| Earlier Venues sign-in and date-selected published Deploy scope | 0.9.2/0.9.3 onward. Supported server signing-key redirect handling; booking dates select verified published versions across years, with missing/ambiguous coverage unavailable. `VENUES_SCHOOL_YEAR` is ignored. | Prior 0.9.3 release notes; `tests/venues093-roster-source.cjs`; current Venues source |
| Publish controls saved-work visibility; communication is independent | H, refined in J. Publication retains permissions, privacy, source conflicts and receipts without allocation/cover/workload gates. Combined publish-then-notify keeps separate durable stages. | `CHANGELOG_v0.9.8h.md`; `tests/roster098h-publication-policy.cjs`; `tests/roster098j-publication-compact.cjs` |
| Singapore notification times; shared-secret compatibility and truthful startup errors | H. Existing bounded 32-or-more-character printable non-whitespace shared keys work without trimming or truncation. | H changelog; `tests/roster098h-communication-display.cjs`; shared-secret validators |
| OVERLORD Background work manager | H. Per-recipient preview/retry/cancel/retire and separate warning acknowledgement, with live-admin checks and retained unknown provider outcomes. | H changelog; `lord-suite/Source/overlord/assets/app.js`; LORD regression suite |
| Independent confirmed Stapler plans and reset-archive recovery | H. Baseline changes affect comparison, not confirmed intent; native restoration preserves supported provenance. The user later confirmed the three October incident plans restored. | H changelog; `shared/roster-stapler.js`; `tests/roster098h-stapler-domain*.cjs` |
| Suspended-day workload exemption with cumulative R | I, clarified and corrected in K. Skip formula calculation only; enabled business rules, verified R, daily/consecutive and employment limits still apply. | `tests/roster098i-domain.cjs`; `tests/roster098k-suspended-rules.cjs`; `tests/roster098k-ui-audit.cjs` |
| UT automatic hard cap and deliberate SMC override | H/K. Automatic capacity must be verified. Keep established manual warning/audit boundaries; do not reinterpret other contractual caps as overridable. | H/K changelogs; shared allocator |
| Actual FORM pairs and genuine single lessons; baseline comparison default | I. Pair detection uses effective dated source lessons; comparison defaults on and can be disabled without altering the plan. | `tests/roster098i-domain.cjs`; Roster Stapler UI |
| Bounded daily plaintext allocation audit export | I. Dedicated audit-only lane, retained evidence catch-up and health states. Existing critical processing retains priority. | `tests/roster098i-audit-recovery.cjs`; `tests/roster098i-audit-health.mjs` |
| Learn about Auto Allocation, exact explanation prompt and staff-category exclusions | J. Calculations, current effective rules and audit guidance; MK/OSO/SAT/SL excluded from new candidate choices without deleting records/history. | `roster-update/public/roster-learning.js`; `tests/roster098j-rules-categories.cjs` |
| Roster action toolbar and Excel export fixes | J. Separate save row, combined visibility/notification action, no `[DRAFT]` export prefix, final row-height fitting. | `tests/roster098j-ui*.cjs`; `tests/roster098j-exports.cjs` |
| Auto-allocate and Auto-fill blanks are separate; manual use at any hour | L/M. Current/future unstarted work only. Preserve started, published, manual, peer and other protected choices. Scheduled optimisation retains its cutoff. | `tests/roster098l-allocation-modes*.cjs`; `tests/roster098m-anytime*.cjs`; `tests/roster098m-edge-clock.mjs` |
| Absence capacity and shorter-report incident | N. Bounded 16M-character operational headroom, surgical working copy and guarded same-reporter/latest-editor shorter replacement. Capacity failure becomes retained review work. | `tests/roster098n-capacity*.cjs`; `tests/roster098n-intake-lazy.cjs`; `tests/roster098n-shorter.cjs` |
| Deploy class rename collisions | Existing G implementation packaged in L and retained. Live screenshot showed old 0.9.7; no distinct current-code defect was established. | L changelog and its collision/stale/replay regression |
| Calendar native Sheet I/O and resumable provider sync | J/L/O/P/Q. Native `SpreadsheetApp`, event/journal identities, durable bounded checkpoints, event-local blocking, source/provider cooldowns, one-second healthy batch yield and exact-run timeout recovery. | `docs/v098p/CALENDAR_SYNC_FIX.md`; `docs/v098q/CHANGELOG.md`; `docs/v098q/VALIDATION.md` |
| Calendar durable event queue, in-place glossary and canonical VenueID | J, retained in P/Q. Four queued mutations, actor/ordering/conflict safeguards, glossary without reload, permitted venue directory plus free text. Directory lookup is not booking availability. | `calendar-job-worker/`; `tests/calendar-jobs/`; `tests/calendar098j-venues.cjs` |
| Separate synthetic rehearsal and native timetable preparation | I/O/P. Isolated simulation, then native timetable export/import and P serializer repair. Neither is a production authority switch. | `docs/v098i/REHEARSAL_SNAPSHOT_SCHEMA.md`; `docs/v098o/TIMETABLE_EXPORT_CONTRACT.md`; `timetable-prep-worker/` |

The older pre-H feature queue was superseded by the recorded H–Q releases. Old 0.9.3/0.9.5 “no backlog” statements are not the current status of the parallel Worker programme.

## Current 0.9.9 release work

| Request | Acceptance boundary |
| --- | --- |
| Harmonise the full GSiS suite at 0.9.9 | Matched component manifest, generated source and runtime packages; preserve existing URLs, credentials, resource ownership and separately installed preparation service. |
| Calendar compact yellow work status | Visible status does not resize the table unnecessarily. Keep saving-to-Google distinct from provider syncing; detailed errors and recovery stay available. |
| Calendar refresh without jumping or draft loss | Preserve unaffected row identity, focus, selection, viewport anchor and active local drafts. Late stale snapshots cannot replace newer edits. |
| Calendar venue lookup generic failure | Retain canonical ID/free-text behavior and expose the diagnosed integration outcome. Local success cannot establish that the live school's provider configuration is correct. |
| Calendar change awareness without fixed browser polling | Optional D1 journal/`CalendarChangeHub`, cursor catch-up and permission-scoped changed-data reads for supported Pages writes and job state. No idle data/status polling applies only when enabled through both flags/schema/binding setup; disabled mode retains existing 15-second queue/focus behavior. Out-of-band spreadsheet/helpers/older routes require manual Refresh. |
| Enough history for another LLM | Current source, build scripts, selected contracts, pivotal decisions, reproducible validation and explicit remaining work. Exclude duplicate old archives, secrets and raw school snapshots. |

The release owner records final implementation and verification results in the 0.9.9 changelog and validation evidence. This acceptance table does not itself claim those checks passed.

## Live evidence and operator work still open

The supplied **0.9.8p Rollout: Live Verification Report**, dated 28 October 2026, reports all 18 P components installed with all 45 package files matching its manifest. It reports five Calendar command jobs saved (three saves, one relocation, one deletion), and unedited P native export accepted by the unchanged O preparation service: revision 2, 31 dates, six parts and 15 projection hashes. These update the historical “P not deployed” statements. They do not prove a later Q or 0.9.9 deployment, a full-year provider sync or present source freshness. The report's school account, resource IDs and raw data are deliberately not reproduced here.

| Open item | Needed evidence or action | Owner/type |
| --- | --- | --- |
| Remaining uncertain Calendar source-save evidence | The earlier blocked event was explicitly deleted by the operator-authorised action described below. A separate orphan `DISPATCHED` receipt remains untouched; inspect its exact source/journal evidence. Do not assume all P-report uncertainty is cleared. | Operator/read-only diagnosis, then supported recovery |
| Live Sync Staff completion and throughput | Install the matched release; finish the current run, inspect completion and explicitly initiate any retry of historical errors. Verify full-year and incremental results without duplicate provider events. | Operator/production acceptance |
| `saveParentSide` through Calendar queue | Verify on a suitable authorised use; record exact receipt and Google result. Other three successful operation types do not cover it. | Operator/production acceptance |
| Queue health and continuation | Monitor retained `CHECKING`/`NEEDS_ATTENTION` work. Preserve `CALENDAR_SYNC_CONTINUE=false`; any future change needs its own evidence and single continuation owner. | Operator/ongoing operation |
| Optional Calendar push activation | Apply additive change schema/DO setup to the existing Calendar jobs service, enable both push flags only after verification, and confirm authorized two-tab change/job delivery and reconnect. Until this setup, legacy queue status polling remains. | Operator/optional setup needed for no-poll behavior |
| Preparation two-tab stale revision | Race concurrent imports against one observed head; one winner, one stale refusal, exact replay stable and no wrong pointer advance. | Operator/live isolated verification |
| Preparation sign-in configuration | Review the rehearsal origin currently on the production public OAuth client and document the chosen separation. This does not imply that the public client ID is a secret or that access checks failed. | Operator/configuration review |
| Post-deployment sweep | Record displayed version plus one permitted data load for each application; verify roles and existing schedules. P report did not record a complete sweep. | Operator/release acceptance |
| Earlier reported Assign Relief/STAPLER production latency | Measure foreground usable-grid and authoritative save/reopen latency with the current matched versions, representative plans and safe request diagnostics. Retain ambiguous saves under the same request identity; a synthetic operation-count improvement is not a live timeout resolution. | Operator/production performance acceptance |
| Current dated timetable identity/freshness | Verify Calendar school-day/parity and Contacts/Name Bridge identity mapping, source-change invalidation and permission-scoped readers. Existing native import proves byte/projection preservation only. | Future implementation and live evidence |
| Worker-first Roster operations and later authority handover | Complete staged route/receipt/projection work in the roadmap. Current Google route remains required. | Future implementation; no cutover in 0.9.9 |

The historical LORD reminder was retired by the user without resend; its provider outcome stayed unconfirmed. A separate historical-warning acknowledgement was not confirmed. This is an operator evidence gap, not an unimplemented Background work manager.

Later on 28 October, at 15:22:50 Singapore time, the explicitly authorised deletion of the blocked Calendar event completed through a direct Sheets atomic field/audit batch. The new receipt was committed; the previous receipt was rejected as `SUPERSEDED_BY_ADMIN_DELETE` while retaining `originalOutcome: UNKNOWN`. Audit evidence was read back twice. This was a distinct live operator action, not a change performed by installing 0.9.9, and it did not use the Apps Script lock. Another orphan `DISPATCHED` receipt (`4e49bd29…`) remains untouched. The earlier P report did not identify its P-1 target, so neither report proves that all uncertain source receipts are resolved.

## Verification debt

Q's broad run is **841/854 passing across initial and targeted rerun evidence**, with 13 inherited failures, not a clean all-green run. Four lack historical comparison inputs, three share a 3,073/3,000-byte size assertion, and six reflect superseded K/M/native-storage expectations. Some programs stop before later cases, so do not count those later cases as covered. The precise list is in [the retained Q classification](../v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md).

0.9.9 must report its own checks and retain every material failure classification. Update or replace obsolete assertions only with an explicit current contract; do not silently remove failed programs or treat missing history as passing. Tests and operator reports prove different things.
