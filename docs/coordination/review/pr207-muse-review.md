# Muse review — PR #207: derive Deploy TTb names from the selected version's modifiers

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #207, branch `codex/v1-deploy-ttb-modifiers`, OPEN, MERGEABLE.
- Exact head reviewed: `559a760aacf7d5d1abf98f6bb07db84a4c68608f`.
- Base (claimed): `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed` (merge-base of the head against current origin/main `badd6b31`, which is one Codex claim commit ahead of the PR base).
- Verdict: **APPROVED at the exact head.**

## What it fixes

DEP-17-004 (recorded in PR #197's ledger): Deploy Teachers showed a stale TTb Name — a saved PE modifier produced a bare label, and employment modifiers were missing. Deploy now derives the TTb Name from the selected version's effective Basic Name and modifier fields, in the draft, after Save and reload, and in the Excel export. The owner asked for the quick PE fix; this is the same stale-name defect as the earlier employment-modifier report.

## Scope verified

- Diff is exactly the nine paths in the task record `docs/coordination/tasks/v1-deploy-ttb-modifiers.md`: the task record, `tests/v1-product-deploy-ttb-modifiers-browser.mjs`, `tests/v1-product-tables.mjs` (added to scope after the first CI run caught the empty fixture's missing module route), `v1/contacts/direct-fields.mjs`, `v1/services/contacts/service.mjs`, `v1/services/deploy/model.mjs`, `v1/web/shared/deploy-eligibility.mjs`, `v1/web/shared/deploy-ui.js`, `v1/web/shared/ttb-name.mjs`. 420 insertions, 75 deletions.
- `git merge-tree --write-tree --name-only origin/main 559a760` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No schema change, no migration, no dependency change, no deployment. No live data change.

## Design read

- New shared module `v1/web/shared/ttb-name.mjs` holds `previewTTb`, moved verbatim from `v1/contacts/direct-fields.mjs`, which now re-exports it. All existing callers keep working with identical behaviour: `v1/services/contacts/catalogues.mjs`, `v1/web/shared/contacts-ui.js`, the direct-fields tests, and `scripts/v1/build-web.mjs`, which embeds `previewTTb.toString()` into the generated Contacts editor — the embedded source is now the moved function, which is self-contained (no imports in its body). The only behavioural addition is the third option `{ retainBasicNameTags }`, defaulting to false, so no existing caller changes output.
- With `retainBasicNameTags: true` (Deploy only), a legacy Basic Name that already ends in a tag — "Synthetic Embedded (PE)" — has that trailing suffix stripped from the computed suffix list instead of being displayed twice. The loop removes one suffix per pass and terminates because the list is finite. A tag already in the Basic Name text is preserved once, via the text itself.
- `v1/web/shared/deploy-eligibility.mjs`: `planningName` derives the name from the version's effective Basic Name and modifier fields (Employment, Subject, MK), with the existing formatter ordering, visibility, aliases, kept suffix and 160-character limit. An Employment Modifier tag equal to the Employment Arrangement is dropped unless the accepted deployment tags contain that arrangement. If no name field was edited and a cached name exists — and either there are no Contacts inputs or the cached name is not the bare Basic Name — the cached name is kept, so unchanged teachers are untouched and a stale bare label (cached name equals the Basic Name, inputs present) is recomputed. If the formatter is unavailable, the cached name is the fallback; a read never fabricates a name. `projectPlanningNames` applies this to every teacher in a document; `planningPerson` carries the derived name into the editor's teacher view.
- `v1/services/deploy/model.mjs`: `mergeContacts` stores the projection's `ttbNameInputs` on the teacher record when present, then wraps the result in `projectPlanningNames`, so every Contacts refresh recomputes names from version-owned inputs. Stored Basic Names and stable Staff IDs are untouched.
- `v1/services/contacts/service.mjs`: the Deploy-purpose projection now also carries `ttbNameInputs` — the effective `nameSuffix` plus the retained name presentation for legacy valueSchema-2 records in effective state only — and `nameSuffix` transitions are included for the deploy purpose. The Contacts projection supplies only effective name suffix and retained name presentation for this calculation; Deploy never writes Contacts.
- `v1/web/shared/deploy-ui.js`: the editor's teacher projection sets `name`/`ttbName` from the derived view; the draft-save handler does the same after an edit; and `window.render` is wrapped (capturing the original first, so no recursion) to run `projectPlanningNames` on the current document before each render, so a draft edit updates the displayed name immediately, before Save. No network write occurs before explicit Save.
- The broader atomic TTb namespace work remains tracked in the Contacts lifecycle design; this PR does not claim it.

## CI verified at the exact head

- Node/LORD run 44218050220: head_sha verified `559a760`, completed success, all five jobs green.
- Product run 44218049449: head_sha verified `559a760`, completed success (job `product: success`).
- A duplicate product run 44219838525 at the same head was still in progress at record time; not needed. The first Node/LORD run 44216370127 at an earlier head caught the empty Deploy fixture's missing module route; the accepted scope addition (the `tests/v1-product-tables.mjs` route) fixed it, and the assertions are unchanged.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-ttb-modifiers-browser.mjs` — PASS (4/4 groups: saved PE draft derives the visible name on load; actual Contacts suffix retained; embedded Basic Name suffix not repeated; employment + subject order kept; live edit before Save; save/reload/export agreement; explicit clear saved, reloaded and exported without a stale suffix; stable identities and stored Basic Names; Contacts/authority isolation; no page errors; external requests blocked).
- `node tests/v1-contacts-direct-fields.mjs` — PASS.
- `node tests/v1-contacts-direct-compatibility.mjs` — PASS.
- `node tests/v1-contacts-catalogues.mjs` — PASS.
- `node tests/v1-product-deploy-workbooks.mjs` — PASS.
- `node tests/v1-product-tables.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS (run twice).

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the new browser test failed at the original PE heading at claim `980cbb1` and passed with the fix. The passing state is re-verified locally above.
- N2 (overlap, not blocking): the task record states the edits to Deploy's UI and model use separate hunks from the other open PRs and already-reviewed follow-up branches; the four branch-head reviews (layout cb4b347, compact 35abe1b, inheritance 0bc58d5, department-move 3895cb9) are approved and their records are on main. The layout/compact core-table.js integration note still stands for those two branches and is unaffected by this PR.
- N3 (limits): hosted runtime UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner request recorded (quick PE fix, same defect as DEP-17-004); exact scope in the task record.
- Q02: Pass. One shared formatter; Contacts supplies only effective inputs; Deploy never writes Contacts; authority and workload inputs untouched.
- Q03: Pass. Existing authority, capability and fence checks retained; no new access path.
- Q04: Pass. Atomic native saves, reload and export agreement, read-only reload/export, replay/isolation assertions in the new test.
- Q05: Pass. Bounded Deploy/Contacts projection route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a code rollback of the shared module and its callers; no stored data migration is required. Saved names remain ordinary derived display values and are recomputed from version inputs on the next load.
