# v1-roster-absence-clash-confirm: mirror confirmed absence replacement

- **Active implementation claim (Antigravity):** Claimed on branch `antigravity/v1-roster-absence-clash-confirm` from `origin/main` (`2e93e91`). Reviewer: **Muse** (exact head commit). Coordinator / Merger: **GPT**. Clears probe allowances `F06` (`resolveAbsenceIntake`, `retryAbsenceIntake`) and implements all 9 v1 absence-clash confirmation acceptance cases without modifying v0.9 or PR #182.
- Historical read-only investigation record below (preserved verbatim):
- Status: queued before implementation; owner orders the independent Roster workload-snapshot correction first. Read-only absence investigation complete.
- Owner/model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Claude, exact head.
- Last updated: 16 November 2026, 07:32 Asia/Singapore.
- Branch: `codex/v1-roster-absence-clash-confirm`.
- Refreshed main/base: `a1606c2af30ebbab3b5ceee5ab671694bc8a48c6`.
- Implementation head / PR: none. This is the workflow-required task record only.
- Owner authority: implement the v1 mirror of Report Absence clash simplification in a separate branch and draft PR; no merge, deployment, hosted records, settings, provider operations or v0.9 changes.

## Start gates and ownership

16 November checkpoint: owner directed merging available work, then the separate [Roster workload-snapshot correction](v1-roster-workload-snapshot.md), then absence confirmation. #181 is now merged at `1754c535738adb1cad8dd328f45dd60ea6580f03`. This releases its old implementation ownership; the new correction has priority and its own explicit scope. This absence task remains documentation-only until the next serial claim/scope refresh. Historical overlap details below describe the earlier checkpoint. The v0.9 reference has since been published and remains in progress at `592fac9982b8935b1d14b8bbff500a1af78aa2c7`; refresh and confirm its final reviewed head rather than treating this provisional snapshot as final.

Read the root/v1 instructions, workflow, lanes, status, owner directives and v1 engineering policy; refreshed remote heads, current main and open PRs. Current open implementation is [PR181](https://github.com/helper-gsps/gsis/pull/181), head `8b15cb2d3c79717828ab66a8359e30522f82b901`. Its exact file inventory includes `v1/services/roster/service.mjs`, the authoritative Roster operation dispatcher/transaction boundary required here. It also owns `context.mjs`, `client.js` and `roster-import.js`. Its code remains frozen for Claude review. This task does not edit those files, inherit its unreviewed head, expand its PR, or claim concurrent ownership.

`git ls-remote --heads origin codex/roster-absence-clash-confirm` returned no remote branch at the inspection time. The owner says this v0.9 reference is still in progress. No final reviewed reference head is available or claimed. Fetch its published final head and exact review before treating it as completed reference; preserve the v0.9 branch unchanged. The owner requirements below remain authoritative while that reference is provisional.

Current file ownership is **this task record only**. Release the overlap by merging/releasing PR181 through its own review/owner process, or obtain an explicit scope/ownership handoff. Then refresh main, actual PR files and claims before activating implementation scope. No draft PR is opened before the required checks/CI are green, as the owner specifically requested for this task.

## Required behavior

Accept a same-teacher/date absence without confirmation when periods do not overlap. For overlap, show existing conflicting records and ask for replacement confirmation. Cancel preserves both stored records and the reporter's draft. Confirmed replacement validates the new report, atomically supersedes only conflicting old absences and saves the new one, retaining history. A changed conflict set requires a fresh acknowledgement, including when a queued submission is resumed. Exact retries, concurrent requests and lost responses must not duplicate reports, replacement effects or notifications.

Keep existing server identity, school, role, absence validation, revision and idempotency controls. Confirmation binds to the exact actor/school, proposal and conflicting record versions/content. Reuse established cancellation for affected future relief; completed work, unrelated absences/duties, instructions/history and notification deduplication remain intact. No allocation-policy change or Google Apps Script fallback.

## Read-only findings and proposed design

At the recorded base, `context.mjs` sets `resubmission:true`. The shared `applyAbsenceResubmission()` automatically merges/replaces overlapping coverage and reuses row identities; it does not implement this new explicit confirmation policy. Do not edit that shared v0.9 implementation. Introduce a v1-owned replacement operation within the existing Roster clone/validate/commit boundary, using existing validators and cancellation behavior and atomic owner records, audit, receipt and outbox writes.

The retained UI exposes `retryAbsenceIntake` and `resolveAbsenceIntake`, but v1 has no handlers; the operation probe records both as F06/404. Queued reconfirmation therefore requires an actual durable proposal/acknowledgement design, not browser-only state. Existing operation receipts retain intent hashes, not the complete proposal. Reuse owner-local record storage where adequate; preserve immutable operation intent and use a new acknowledgement operation when the user changes consent after an already-prepared attempt. Recheck proposal/conflict versions at commit, not only when displaying a dialog. No cross-D1 atomicity claim.

Candidate bounded implementation inventory (not activated while the ownership gate is blocked; confirm against the final reference and queue design before editing):

1. `v1/services/roster/service.mjs`
2. `v1/services/roster/absence-clash.mjs`
3. `v1/services/roster/absence-intake.mjs`
4. `v1/web/shared/roster-absence-clash.js`
5. `scripts/v1/build-web.mjs` — v1 module inclusion only; no new legacy function text patches.
6. `tests/v1-product-roster-absence-clash.mjs`
7. `tests/v1-product-roster-absence-clash-browser.mjs`
8. `tests/v1-product-roster-absence-clash-recovery.mjs`
9. `tests/v1-product/operation-probe-allowlist.json` — remove F06 only after actual handlers pass.
10. `docs/v1/roster/ABSENCE_CLASH_CONFIRM_HANDOFF.md`
11. `docs/coordination/tasks/v1-roster-absence-clash-confirm.md`

No schema/migration change is included in this proposed inventory. If durable queue design requires one or any other path, revise the bounded scope before implementation. Roster owns the proposal, absence and relief transitions; Core owns actor/capability evidence; Contacts owns permanent identity/accepted staff facts. Browser acknowledgement cannot grant authority.

## Acceptance and verification to run

Use synthetic identities and actual built browser plus local Workers/D1. Required cases: (1) disjoint immediate acceptance; (2) conflict details and no-write Cancel retaining draft; (3) replacement limited to conflicts; (4) invalid replacement leaves old rows intact; (5) changed conflict requires new consent; (6) unauthorized replacement fails; (7) exact retry, concurrent requests and lost response have one durable result; (8) queued changed-conflict/restart/reconfirmation without duplicate notification; (9) superseded history, completed duties, instruction history and unrelated allocations retained.

Run canonical build with no tracked drift, runner discovery, focused behavior/recovery checks, unchanged relevant regressions and all required Node/LORD/product exact-head CI using `TZ=Asia/Singapore`. Record actual commands/failures/exclusions and exact reference/base/head, visible changes and changed deployment components (anticipated: v1 Roster Worker and v1 web assets only). Label every commit and PR description `Model: Codex`. Claude reviews the exact new head. No merge or deployment.

These absence tests have **not run**; no implementation is claimed. Skill packages: none executed for this read-only trace; repository ownership/recovery principles applied. Q01 is blocked on overlap/reference verification; Q02-Q06 are proposed/pending; Q07 pending Claude; Q08 not applicable to deployment. F5 OPEN; hosted/runtime UAT and T1B-01/T1B-02 Not tested.

## Separate SMC duty-save finding (outside this implementation)

The owner's preceding confirmation request was reproduced against the same main using the built Roster page and nine local Workers/D1, with explicit synthetic accepted SMC/EO evidence. Native `Save duty list` returned HTTP200 and a committed receipt, persisted one named list and one daily membership, and queued zero notifications. The page nevertheless showed zero lists; reloading showed the saved list. The mutation returns IDs/revision/receipt but not the full duty view expected by the page. This is a confirmed display/response-contract defect, not evidence that the owner's live save was lost. PR181 does not fix it. No live data was read; no product files were edited. Initial fixture without accepted SMC correctly exposed no eligible members; the corrected fixture used explicit acceptance, never inferred authority from Role.

Reproduction command: `TZ=Asia/Singapore node /tmp/gsis-smc-duty-probe.mjs /workspace/gsis-v1-fortnight-save-check`. Local temporary script/evidence is not a repository test or durable handoff artifact; the observable request, receipt, storage and reload outcomes above are recorded here. Future/multi-day duty editing and deletion need separate investigation; static range concerns have not been proven. Keep this bug separate from the absence implementation.

## Next action

Obtain the published final v0.9 reference and exact-head review, and release the PR181 file overlap. Refresh and activate the exact v1 claim, then implement and verify the nine cases before opening the separate draft PR. This record grants no permission to merge PR181 or deploy the current main.

## Antigravity Implementation & Local Verification (`TZ=Asia/Singapore`)

- **Branch:** `antigravity/v1-roster-absence-clash-confirm`
- **Reviewer:** Muse (exact head commit) · **Coordinator / Merger:** GPT
- **Implemented files:**
  - `v1/services/roster/absence-clash.mjs`: v1-owned clash detection, conflict-token binding, authorized confirmed replacement (superseding only conflicting absences with retained history, cancelling only affected future unpublished relief, preserving completed duties/instructions/unrelated allocations), and durable `absenceIntake` resolution/retry (`resolveAbsenceIntake`, `retryAbsenceIntake`, clearing `F06`).
  - `v1/services/roster/service.mjs`: wired explicit absence-clash check before `saveAbsence` preparation (disabling silent resubmission on v1 `saveAbsence`), plus `resolveAbsenceIntake` and `retryAbsenceIntake`.
  - `v1/web/shared/roster-absence-clash.js` + `scripts/v1/build-web.mjs`: v1-owned confirmation dialog helper included in built Roster HTML (zero legacy JS text patches).
  - `tests/v1-product/operation-probe-allowlist.json`: removed both `F06` entries (`resolveAbsenceIntake`, `retryAbsenceIntake`).
  - `tests/v1-product-roster-absence-clash.mjs`: synthetic Workers/D1 regression covering all 9 required acceptance cases plus `resolveAbsenceIntake` and `retryAbsenceIntake`.
- **Verification commands (`TZ=Asia/Singapore`):**
  - `node tests/v1-product-roster-absence-clash.mjs` — PASS (all 9 cases + `F06`)
  - `node tests/v1-product-operation-probe.mjs` — PASS
  - `node tests/v1-product-roster-service.mjs` — PASS
  - `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift; PR #182 untouched)
  - `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
  - `git diff --check` — PASS
- **Remaining gates:** Independent exact-head review by Muse; merge by GPT. Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy or provider activation performed.
