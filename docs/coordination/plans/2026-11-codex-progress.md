# Codex changelog progress — 30 October 2026

Model: Codex. Reviewed the full pending changelog, the November queue, task files and open/merged PRs against main `3c839bb2bb168d3097b492e91186f8305a0fa3ab`. This is a progress ledger, not a release or deployment record.

## Open PRs

| Queue | Work | Status |
| --- | --- | --- |
| S | Split Google Roster operations files | [PR #19](https://github.com/helper-gsps/gsis/pull/19), draft; **hold merge** until the owner deploys bundle 6bb4844, sets ROSTER_OPERATIONS_MAX_CHARS and supplies the Storage screenshot. Exact head `1edab936193c6a2bcd226207ef5e7c4abeb182f7`: Node 880/880, LORD 38/38. |
| 2b2 | Timetabled SRE relief calculation | [PR #20](https://github.com/helper-gsps/gsis/pull/20), ready for review. Exact head `16624d4de46caf8b3a1547069eea1e6ab9ab24aa`: Node 879/879, LORD 38/38. |
| Other | Collapsible teaching group exceptions | Claude's [PR #21](https://github.com/helper-gsps/gsis/pull/21). Overlaps the settings file used by 2c; integrate after review and rerun the settings browser checks. |

No additional PRs have been opened. Owner queue policy allows two open PRs; the independently opened #21 means a slot must clear before opening another.

## Prepared implementations

These branches are stacked in queue order and have not been merged or deployed. The CI links below verify the listed exact heads. Full-suite results were pending when this ledger was written.

| Queue | Work | Exact implementation | Full CI |
| --- | --- | --- | --- |
| V | Release labels and version mismatch notice | [`40280ed61f4bbd8e912691cf0a63c48e748c889e`](https://github.com/helper-gsps/gsis/commit/40280ed61f4bbd8e912691cf0a63c48e748c889e) | [run 41075417708](https://github.com/helper-gsps/gsis/actions/runs/41075417708) |
| 2c | FAJT annual relief levelling | [`ab58e67ca1dbd08bd2a6267858a4b6d51f414281`](https://github.com/helper-gsps/gsis/commit/ab58e67ca1dbd08bd2a6267858a4b6d51f414281) | [run 41075627007](https://github.com/helper-gsps/gsis/actions/runs/41075627007) |
| 15b | SIUE by specialism | [`2d308db69247ad27606515dfa0bd32eaa098b847`](https://github.com/helper-gsps/gsis/commit/2d308db69247ad27606515dfa0bd32eaa098b847) | [run 41075870965](https://github.com/helper-gsps/gsis/actions/runs/41075870965) |
| 4 | Published-day scheduler cheap check | [`49071d7caba1bbfdd7ff0597cba40c0af44a6a49`](https://github.com/helper-gsps/gsis/commit/49071d7caba1bbfdd7ff0597cba40c0af44a6a49) | [run 41075952104](https://github.com/helper-gsps/gsis/actions/runs/41075952104) |
| 5 | Provider delivery timestamp formatting | [`40f4197f23701e49f081aecd57c6e150e2fec533`](https://github.com/helper-gsps/gsis/commit/40f4197f23701e49f081aecd57c6e150e2fec533) | [run 41076006555](https://github.com/helper-gsps/gsis/actions/runs/41076006555) |
| 6 | Permanent publication time chip | [`46d264dcf5900e66da58a90511f89a080bef7aac`](https://github.com/helper-gsps/gsis/commit/46d264dcf5900e66da58a90511f89a080bef7aac) | [run 41076064751](https://github.com/helper-gsps/gsis/actions/runs/41076064751) |

The full Linux runs found and prompted repairs to shared release-notice loading, serializer fixtures, FAJT metadata expectations and the SIUE explanation assertion. The version notice uses a root URL for deep links; the Layout viewer keeps its inline bootstrap first; the private timetable installs the notice before its immediate API read. A direct comparison of 180 ranked teachers proves default-off FAJT preserves every existing ranking field and ordering after excluding the newly declared `fajt:false` metadata.

## Already merged

- Row 1, ended published relief completion: PR #12.
- Row 2, assignment provenance: PR #13; its task file retains the owner's presentation follow-up.
- Row 2b, daily SRE priority: PR #14.
- Central absence review, latest-wins handling, bounded allocation attempts, quiet mode and shorter notification summaries are present in the earlier implementation history. This review does not establish that any particular build is deployed.

## Unbuilt queue

| Queue | Next work or gate |
| --- | --- |
| 3 | Check every Roster Excel export for absent-teacher labels, including combined relief. The task remains proposed; do not infer completion from one exporter already having the label. |
| D1 | D1 record and Google backup/mirror work waits for S to merge. Activation stays an owner action; do not change ROSTER_EDGE_AUTHORITY. |
| 7 | LORD queue phase 1: durable receipts, idempotent execution, user status list, Google remains authoritative. Next implementation in the owner's latest order. |
| 8 | LORD queue phase 2: cart booking, open/collect, collect photos, return, return photos. Requires phase 1. |
| 8b | Deploy queued writes preserving conflicts, original actors and draft recovery. Depends on the LORD queue design. |
| 9 | Calendar receipt-first save, stable edited-cell position, year-loading overlay and up to six venue chips. |
| 10 | All upcoming suspended dates visible to teachers; SMC-approved permission to help plan. Create the task file before claiming. |
| 11 | Notify both peers when their arrangement is released. Create the task file before claiming. |
| 12 | Show year relief count and accumulated annual R% in My Relief Duties. Create the task file before claiming. |
| 13 | Align suspended/published day and usual baseline under shared period columns, including exports. Create the task file before claiming. |
| 14 | Published relief overlay in teacher, class and TG day timetables and exports, with unpublished visibility restricted to SMC/Admin. Create the task file before claiming. |
| 15 | Exclude FAJT from specialist headcount and core capacity; keep full demand and show FAJT supplementary periods separately. Create the task file before claiming. |
| 17 | OVERLORD/STARLORD queue phase 3 only after one clean week of phase 2 use without double bookings. |

The relief-board proposal also remains in the pending changelog. Its cached editing, confirmation/conflict and live school-morning trial requirements are not completed by these branches. Its Google-record design should be reconciled with the later D1 direction before implementation.

The broader annual-accounting proposals (off-system relief entry and an exportable report) are not silently included in row 12's narrower owner decision.

## Resume conditions

The original Windows execution environment disconnected during row 5. The row 5 patch was recovered to GitHub, row 6 was implemented through repository tools, and all six prepared branches have fresh Linux CI. There is currently no usable local execution environment for the next implementation cycle.

Before resuming: restore a working checkout, fetch current main and the prepared branches, inspect the exact CI results above, preserve S's hold, integrate reviewed predecessor work serially, and continue at row 7. Retain row 3 and every later unbuilt item in the backlog. Do not claim the whole changelog implemented or deployed.
