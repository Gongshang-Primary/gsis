# Deploy Duty weekday alignment

- **Status** Implemented locally; claimed on 23 November 2026, 11:32 SGT. Full CI and Muse review remain pending.
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-duty-recess-parity`
- **Base before claim** `016e03675756520b260e724b7c7e63be0bbc3256`
- **Owner request** Work on the outstanding v1 items, including DEP-23-001.
- **Exact scope** This task record, `v1/web/shared/deploy-duty-ui.js`, `v1/web/shared/deploy-ui.js`, and `tests/v1-product-deploy-duty-recess-browser.mjs`.
- **Evidence** [Duty UAT ledger at its documentation head](https://github.com/Gongshang-Primary/gsis/blob/014b2af6f4a64aa171f30e5b7a32a0b86116d100/docs/v1/DEPLOY_DUTY_UAT_2026-11-23.md)

Align equivalent weekday Recess duties in the Deploy Duty screen and print view. Keep the original duty ID, weekday, timing and assignment for every editable occurrence. Preserve same-day duplicates, visible timing exceptions, unscheduled days, permission checks and normal save and reload behavior.

Prove the duplicated-column symptom with synthetic data, then verify the built browser and Worker/D1 path. Cover six weekly duties, separately stored weekday duties, real exceptions, edit/save/reload, read-only viewing and PDF parity. Run relevant save and duty regressions. Product changes stay in v1. The task excludes hosted records, migrations and deployment.

## Implementation

Model: Codex. The accepted claim is `b952c7e402323c53c6ae3ad834a6c52552842378`.

The new v1 adapter projects the existing native print table. Recess records with the exact same name share a column only when their weekdays do not overlap. First appearance controls column order. Same-day duplicates and unscheduled definitions retain separate columns. The six-slot fixture has the native `pd 3`–`pd 8` headers. A shared column with different times says **Varies by day**, and each active cell shows its actual time.

Every editable occurrence retains its original duty ID and weekday. The native definition editor, selection handler, queue, save operation, validation and receipts remain in use. Other categories and their row spans are preserved. Screen and PDF use the same projected table; the screen restores the timing annotation after the native renderer installs its existing selector.

The adapter receives a read-only getter for the current duties. It does not replace `v()`, change the stored or draft duty list, infer a migration, or change workloads and Duty Cards. Before projecting, it verifies the native table shape and every active Recess cell's owner/day binding. An unfamiliar shape or binding returns the original HTML unchanged. Work remains bounded by the existing 200-duty limit; no dependency, schema, backend, configuration or generated source changed.

## Local verification

All commands use `TZ=Asia/Singapore`. Browser commands additionally use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. The exact committed head is supplied in the coordinator handoff; these results concern the source files committed with this record.

| Command | Outcome |
| --- | --- |
| `npm run build` | Pass: canonical 18 components, no tracked generated drift. |
| `node scripts/v1/build-web.mjs` | Pass: 332 assets, nine modules. |
| `node tests/v1-product-deploy-duty-recess-browser.mjs` | Pass: seven groups, 12.734 seconds; actual isolated Workers/D1 and Chromium. |
| `node tests/v1-product-deploy-planning-save-controls-browser.mjs` | Pass: four groups, including all six planning pages, ordinary saves, original-save recovery and read-only controls. |
| `node tests/v1-product-deploy-group-duty-validation.mjs` | Pass: group duplicate checks, Dept leadership eligibility, same-day overlapping/adjacent duty intervals, blanks and retained historical repairs. |
| `node scripts/v1/test.mjs --list` | Pass: the new file is discovered among 192 programs; the 45-second per-program limit is unchanged. |
| `node --check` on both changed UI modules and the new test; `git diff --check` | Pass. New module/test formatting checked with the existing cached Prettier. |

The new test checks 30 stored weekday records against six aligned columns; all original ID/day keys; `pd 3`–`pd 8`; three actual Export PDF popups and generated PDF buffers; a visible native selector followed by save and reload; six weekly records; same-day duplicates; partial multi-day overlap; missing weekdays; timing exceptions; escaped names; unchanged other categories; read-only access; unchanged slot counts, Duty Cards and workload; and byte-preserving fallback for malformed native layout/binding. Rendering and PDF generation send no save request and leave the owner records unchanged.

Failed attempts are retained as evidence. The claim-head baseline failed with **30 actual columns versus six expected**. The first implementation run exposed a real adapter mistake (`window.v` instead of the native lexical getter), fixed by explicit getter injection. The next run passed rendering and PDF checks, then the fixture tried to operate the intentionally hidden native source select. The final test uses its visible searchable picker; no visibility check or timeout was weakened.

Temporary logs: `/tmp/gsis-duty-recess-red.log`, `/tmp/gsis-duty-recess-green-1.log`, `/tmp/gsis-duty-recess-green-2.log`, `/tmp/gsis-duty-recess-green-3.log`, `/tmp/gsis-duty-save-regression.log`, `/tmp/gsis-duty-validation-regression.log`. The focused test's frozen SHA-256 is `8483568c2e80e386cb8f9eb574c8255c86beab019b092b8b00ce7f210d2fb187`.

## Gates, limits and handoff

| Gate | State and evidence |
| --- | --- |
| Q01 | Pass: accepted claim and exact four-file inventory; v1-only source ownership. |
| Q02 | Pass: duty records remain authoritative; this change owns only their screen/print projection. |
| Q03 | Pass: escaped labels and read-only browser controls verified; no authority, privacy or service contract changes. |
| Q04 | Pass for this scope: existing real save/reload and recovery regressions; no new write or concurrency mechanism. |
| Q05 | Pass: existing duty bound retained, one small adapter, no new dependencies. Documented debugging/ownership principles applied; no external skill is claimed as executed. |
| Q06 | Local focused evidence above; full Node/LORD and exact-head Product CI **Pending**. |
| Q07 | Muse exact-head independent review **Pending**. Codex internal read-only inspection found no blocker and is not that review. |
| Q08 | Deployment not authorised for this task. Hosted/runtime UAT and physical printing **Not tested**. |

The hosted definitions' origin remains unverified; this repair does not assert an import or conversion cause. It preserves the native positional period-header convention and does not derive timetable periods from clocks. A malformed or future incompatible native layout falls back to the prior wide view instead of hiding occurrences.

Rollback is a code revert of this bounded adapter/integration change. There is no data migration or stored-record rewrite to undo. No push, PR, merge, deployment or live-data operation is part of this local implementation handoff.
