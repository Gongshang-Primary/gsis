# Job 3: Roster editing and estimated allocation

Branch: `codex/v1-roster-unblock`. Claim: [v1-roster-unblock](../../coordination/tasks/v1-roster-unblock.md). Independent reviewer: **Claude**, exact PR head. This is locally tested implementation awaiting review; it is not a deployment record.

The owner authorised Job 3 after merging #180, #178 and #176. The refreshed integration base is [`71a7c5c040350b46d8332e5ba2e3b44665aebe5f`](https://github.com/helper-gsps/gsis/commit/71a7c5c040350b46d8332e5ba2e3b44665aebe5f); the accepted claim on main is [`a1606c2af30ebbab3b5ceee5ab671694bc8a48c6`](https://github.com/helper-gsps/gsis/commit/a1606c2af30ebbab3b5ceee5ab671694bc8a48c6). No open PR overlapped at claim or the pre-publication refresh. The [merge inventory](../../coordination/tasks/v1-merge-records-20261115.md#verified-merge-inventory) records each exact parent and automatic merge tree.

The controlling requirements are the 15 November [owner directives](../../coordination/OWNER_DIRECTIVES.md), [first trace ledger](../V09_V1_TRACE_LEDGER_2026-11-15.md), [follow-up ledger](../V09_V1_TRACE_LEDGER_FOLLOWUP_2026-11-15.md), and [Claude's recheck](../../coordination/review/v1-pr176-178-180-claude-recheck.md) on `2e77d3c8598fc1edb053e62280fb6cf7c92f167e`. Historical Revision 49 ownership, identity and recovery boundaries remain in force. This task does not reopen permission policy.

## Findings and resulting behaviour

| Rows | Actual request/evidence | Result in this PR |
| --- | --- | --- |
| F01/F02 (first ledger A01) | Built Stapler called `acquireStaplerLock` / `releaseStaplerLock`; the real Worker returned 404. Native creation also received no accepted plan view. | Map acquire/renew/release to Roster's existing dated lease. Return accepted views with save receipts so native create, rename, edit and save work. Remove exactly F01/F02 from the operation-probe allowlist. |
| H02, B04/B05 | Real `/upload` with two room IDs for one source label returned `VENUE_MAPPING_REQUIRED`. The previous mapping modal required every teacher again and lost choices on reload. | Exact unique current-name or saved name-bridge suggestions; only unresolved/ambiguous identities need selection. Accept multiple canonical venues or an explicitly flagged unmapped label. Retain the original source text and the user's mapping draft after rejection/cancel/reload. |
| B08, G01/G02 | Real availability/candidates/allocation could not load without a Deploy publication. | Use a bounded saved Deploy planning projection when the publication pointer is absent. Mark workload estimated in the same change, including the native allocation screen, candidates, availability, capacity/forecast, durable assignment evidence and downloadable workbooks. Keep automatic publication blocked. |
| G03 | Built home request `currentDuty` with no date returns 200, `available:true`, `people:[]` on an empty school. | **Disproved as an empty-school bug; no product change.** The historical probe supplied a future date: context loaded that range while currentDuty intentionally read today. No outage/availability guard is removed. |

The allocator previously returned only run counts where the retained browser expected the complete updated view. Its native Excel control also requires `exportContext`. The Roster owner now freezes the complete JSON view and same-revision export context in the accepted allocation receipt. The browser's `allocationMode:fill-only` maps to the existing engine mode. These are part of making the authorised allocation flow work, not a new planner or exporter.

## Ownership and concurrency

Roster owns baseline models/mappings, dated planning leases, absences and allocation writes. Contacts remains the owner of permanent Staff IDs and current accepted authority. Names and timetable labels suggest identities; they never grant EO, SMC, School Leader or application capability. Venues owns canonical room IDs. Unknown or foreign room IDs still fail validation; intentionally unmapped labels retain an explicit incomplete-occupancy warning and do not fabricate a venue.

Stapler uses the existing 120-second lease with owner/tab binding, a monotonically increasing fence, current day/plan revision and commit-time expiry checks. Another tab cannot renew or release its fence. A native save that lacks explicit lease data first obtains a deterministic child lease operation derived from its original operation ID. Reload/retry reconstructs that same binding. A committed save releases only that exact lease; a failed release cannot undo its receipt and expiry remains bounded. A stale/expired prepared save is denied, not silently rebound to a new fence.

Deploy's internal estimate read is available only through a current Roster decision. It chooses at most one nondeleted saved planning version covering the requested date, ordered by creation time and ID, and carries the exact version/revision. It reuses the existing workload calculation over the accepted projections already retained by that saved version. A compatibility-only `asOf:0` satisfies the calculator's flat projected-row input; it is **not** a Contacts read time or observation. Original retained Contacts revisions are preserved where present; missing evidence is null. No synthetic planning revision is represented as a Contacts revision or F5 proof.

Roster independently reads current Contacts authority and current Calendar/baseline evidence. An estimate can provide a finite R; absent/unavailable inputs cannot become zero or a fabricated capacity. Unknown employment caps remain blocking. Estimates do not enter verified `roster_weekly` captures or observed entitlement history. Legacy display fields that called any numeric R “verified” are corrected at the response boundary without weakening eligibility checks.

Allocation admissions bind both the selected saved planning revision and the absence of a publication pointer. Deploy edits, Contacts refresh into a saved version, and deletion use the existing source-change/pin protocol. A held destination operation must resolve or cancel before its source changes. These are owner-local checks and receipts; **no cross-D1 atomicity is claimed**. The existing check-to-commit interval and durable admission/recovery protocol remain material limits. Source outages, a corrupt/missing pointed-to publication, stale revisions, changed operation intent, wrong capabilities and current authority failures do not fall back to estimated success.

If a verified publication is present, the existing immutable-publication path remains authoritative. A publication ID alone is insufficient for automatic publishing: its workload rows must also be verified. The existing Roster service regression adds that negative case, complementing the real Worker estimate tests. This change does not add automatic publishing or provider sends. Existing verified-only capacity-warning notification gating stays intact; estimated capacity is available on screen and in explicit forecasts. Hosted scheduling/provider behaviour is not proved here.

## Visible changes for owner review

- Native Stapler controls can acquire/release their editing lease and show the accepted plan after saving.
- The mapping dialog auto-selects unique exact identities, allows several rooms per label, and keeps failed/cancelled mapping choices for that school/account/model in the browser tab. It retains at most eight drafts; unavailable browser storage falls back to memory.
- Saved timetables visibly identify explicitly unmapped room labels and incomplete occupancy after reload.
- Allocation/candidate/availability and capacity/forecast views show **Estimated workload** with the saved source/revision when applicable. They retain the v0.9 layout.
- Both native relief and full-teacher Excel downloads identify estimated workload in their existing headers. Readable published-day CSV carries the same distinction if an authorised manual publication used estimates.
- No new top-bar shortcuts, build-time text patches, settings, schema, dependencies or v0.9 files are introduced.

## Verification and limitations

Implementation/test commit: [`c89b362d676c1af3ee165a84d172011bc88962bf`](https://github.com/helper-gsps/gsis/commit/c89b362d676c1af3ee165a84d172011bc88962bf). Later documentation commits do not replace exact-head CI. The implementation PR is the final source for its head, command outcomes, CI run links and Claude review status.

Six new programs use synthetic identities with the actual built assets, nine local Workers, service bindings and persistent D1/R2. Browser programs use Chromium and the real transport; they do not replace product handlers with mocks.

| Program | Behaviour exercised |
| --- | --- |
| `tests/v1-product-roster-locks.mjs` | Competing actors/tabs, acquire/renew/release, replay, changed intent, wrong fence, expiry, ordinary-user denial and legacy lease compatibility. |
| `tests/v1-product-roster-locks-browser.mjs` | Native blank plan, rename, planner edit and save; retained original request after reload; one durable save and released fence; actual empty current-duty request. |
| `tests/v1-product-roster-baseline-mapping.mjs` | Two canonical rooms, durable mappings and both Venues occupancy scopes; replay, stale revision, foreign room and capability denial. |
| `tests/v1-product-roster-baseline-browser.mjs` | Exact bridge, unresolved-only choice, multi-room modal, rejected save and reload retention, explicit unmapped label, durable warning and preserved source text. |
| `tests/v1-product-roster-estimated.mjs` | Unknown source versus saved numeric estimate; availability, candidates, capacity, draft allocation, authority/revision/intent denial, no verified-R capture, automatic-publication denial, source pins, corrupt publication denial and original receipt after process restart. |
| `tests/v1-product-roster-estimated-browser.mjs` | Native Assign Relief and Auto-fill blanks; estimated capacity and two actual downloaded Excel archives; label after reload and no publication. |

Run with `TZ=Asia/Singapore`; browser path variables on this machine are `GSIS_BROWSER_EXECUTABLE`, `ROSTER_TEST_CHROMIUM` and `LORD_TEST_CHROMIUM`, each `/usr/bin/chromium`.

```bash
TZ=Asia/Singapore npm run build
TZ=Asia/Singapore node scripts/v1/test.mjs --list
TZ=Asia/Singapore node tests/run.cjs --list
TZ=Asia/Singapore node scripts/v1/test.mjs
# Run each index 1, 2, 3 and 4; their union is the full unchanged Node runner.
TZ=Asia/Singapore GSIS_TEST_SHARD_INDEX=1 GSIS_TEST_SHARD_TOTAL=4 node tests/run.cjs
TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py
git diff --check
git diff --name-only a1606c2af30ebbab3b5ceee5ab671694bc8a48c6...HEAD
```

At documentation preparation: all six focused flows passed before the final negative source-pin/corrupt-pointer assertions were added; those assertions remain part of the required full rerun. Existing Roster service regression passed. Canonical build passed with no tracked drift. Both runners discover all six new programs (104 product programs; 1,205 Node programs). Full product, all four Node shards, LORD and exact-head CI are required; results are recorded in the PR, not presumed by this document.

Intermediate failures were retained in the working evidence: native creation lacked an accepted plan; native allocation lacked an updated view/export context; optional legacy projection fields could not enter a canonical receipt until normalized to its actual JSON representation. Test-authoring corrections included the `/upload` route, the availability API's explicit `complete:true`, a valid ordinary-teacher fixture, native button labels/async completion, an explicit browser executable, and preventing schema reinitialisation/double shutdown in the restart harness. The initial LORD invocation lacked its specific `LORD_TEST_CHROMIUM` setting and failed to locate Chromium; the corrected invocation is a separate rerun. No security check, test timeout or runner selection was relaxed.

This is not proof of hosted sign-in, live staff mapping, actual provider delivery, scheduled allocation, Drive backup, publication under live school concurrency, or Cloudflare migration. Runtime/hosted UAT and official T1B-01/T1B-02 remain **Not tested**. F5 remains **OPEN**; locally persisted estimate metadata and synthetic restart recovery do not close durable Contacts observation recovery.

Rollback is a code revert of this PR. There are no migrations. Existing baseline mapping readers in the pre-change version do not understand multi-room arrays; do not roll back after using that new format without retaining/exporting those models and checking compatibility. Existing stable operation identities, receipts and saved data must not be deleted to manufacture a retry. Reverting does not undo any separately authorised future publication or provider effect.

Deployment remains prohibited until the owner confirms **C-1 Memberships** and **C-2 Contacts D1 backup immediately before deployment**, then explicitly authorises release of the reviewed exact head. No new owner policy question is required for this bounded implementation. The remaining probe allowances and later jobs stay outside this PR.
