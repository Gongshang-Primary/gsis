# Physical room register repair: B-V01a

Model: Codex. Branch `codex/v1-venues-physical-register`. Base `bd77b27deab417afce859cd80465d7c608ae0ab2`; accepted claim `360853c32ce5f0a07b5e385fea3647fea5c63b6e`. [Exact scope and authority](../../coordination/tasks/v1-venues-physical-register.md). Independent exact-head reviewer: Muse under the current owner substitution. Implementation is local; no merge, deployment, migration or live operation is claimed.

## Behavior

Venues Administration now exposes its existing authoritative physical register. An administrator can add a room, edit its physical metadata, export a canonical Excel workbook and preview/confirm a register import. Empty registers have a usable entry point. The existing shared table tools provide Export All and Import Excel; visible exports remain reports. The existing bounded XLSX codec rejects formulas, macros, external links and malformed archives. No new parser or format is introduced.

The editor creates an explicit permanent UUID for a new room and shows it before confirmation. Imported existing IDs are preserved exactly; imported new rows require explicit IDs. Names, units and aliases never infer a different identity. Existing units cannot be reassigned through import. Blank seating capacity remains `null`, including through preview and XLSX. Class-slot capacity is separate future work. New rooms start not bookable; their existing room-policy editor controls subsequent booking policy.

The server preview validates the current school, schema, exact worksheet columns and row revisions without writing. It shows new/updated rooms. Confirmation uses the existing `importVenues` owner transaction and the exact previewed IDs/revisions. Omitted rows are retained; omitted fields retain existing metadata, aliases and booking policy. Imports cannot set owner IDs, grants or private source fields. No room import creates timetable coverage or changes bookings, source snapshots, closures or provider jobs.

At most 1000 rooms are accepted, within the existing 1 MiB HTTP body bound and 8 MiB/30000-cell XLSX codec bounds. Names and metadata, features, aliases, opening hours, buffers and flags are validated. Duplicate units and cross-room aliases are rejected. The owning D1 transaction checks the validated catalogue count/revision sum in addition to per-row revisions and existing source fences. This covers catalogue-wide uniqueness without serializing booking operations. Ordinary alias edits use the same catalogue guard so an import racing an alias edit cannot create an ambiguous mapping.

The browser retains the original operation and payload in school/account-scoped session storage before sending. It checks the durable owner receipt before reporting saved; reload offers recovery of that same operation. Pending outcomes retain the original intent. Terminal aborts require a refreshed preview. Account changes discard protected in-memory views. Core remains responsible for authentication, current capabilities, CSRF, school binding and read-only impersonation.

## Evidence and limits

All local commands use `TZ=Asia/Singapore`; browser runs use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. The task/PR records the final exact head and CI results. Do not transfer an intermediate run to a later changed head.

| Check | Recorded result |
| --- | --- |
| Baseline actual nine-Worker/D1 probe at `bd77b27…` | Admin response lacks `register`; unknown-capacity import returns HTTP400 `INVALID_VENUE`; zero room writes. |
| `node tests/v1-product-venues-register.mjs` | Intermediate local pass, 16.683s including process restart. Final rerun pending after the additional ordinary-alias race assertion. Tests actual guarded creation, null capacity, sparse update preservation, invalid/duplicate inputs, school/capability/preview denials, exact retry, changed intent, stale revisions, source fence and receipt recovery. |
| `node tests/v1-product-venues-register-ui.mjs` | Intermediate local pass. Actual built browser and nine Workers: Add/Edit, unknown capacity, real XLSX export/import preview, no write before confirmation, lost response/reload recovery, stale workbook refusal, reader/impersonation controls and 390px viewport. Final rerun pending. |
| `npm run build` | Pass, 18 components, no tracked generated drift. |
| `node scripts/v1/test.mjs --list` | 135 discovered product programs; both new files included. |
| Existing regressions / full Node/LORD / product build and exact-head CI | Pending; no earlier head's pass claimed. |
| Hosted/runtime UAT, production stores, providers and migration | **Not tested.** No live access or sends. |

Initial checks exposed a real null-projection error (unknown capacity became an empty string), which was corrected. Two test-fixture errors were also corrected: comparing D1 response timing metadata instead of rows, and disposing the old Miniflare instance twice after restart. These failures are not hidden as successful runs.

## Separate open work

This closes the code path for physical-register creation and metadata editing only, subject to final tests/review. B-V01's hosted cross-module recheck remains unperformed. Its navigation fix (#171), Deploy metadata preservation (#169) and distinct lesson-demand preservation (#189) were already merged and are not new results here. Source-generated booking/transfer deep-link parsing remains separate.

The approved [venue lifecycle design](VENUE_ALLOCATION_LIFECYCLE_DESIGN.md) and [owner clarification](../../coordination/review/v1-venue-allocation-design-claude-review.md) still control future implementation: one-slot/whole-venue demand, blank/no-coverage bookability with a notice, independent timed-source adoption, retained visible booking conflicts and Layout's timed view. This task does not change their current implementation or claim their V01–V22 scenarios passed. F5 stays **OPEN**; official T1B-01/T1B-02 stay **Not tested**.

## Rollback

A reviewed code revert removes the new browser flow. Already-created stable room IDs, references, receipts and history must remain. Do not delete rooms or restore old database snapshots as an implied rollback. There is no schema migration, new secret, binding, permission or provider configuration.
