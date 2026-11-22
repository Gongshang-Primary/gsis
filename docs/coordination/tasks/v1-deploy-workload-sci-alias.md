# Task Claim: v1 Deploy Workload Sci/Science Alias Resolution

- **Task ID:** `v1-deploy-workload-sci-alias`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-deploy-workload-sci-alias`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Deploy Workload `Sci` and `Science`)

## Scope

1. Add a pure derived helper `workloadAliasView(doc)` in `v1/web/shared/deploy-loads.mjs` handling known subject aliases (`Sci` <-> `Science`, `PE` <-> `PHE`) for workload calculation without mutating saved Deploy rows or modifying v0.9 `shared/workload.js`:
   - Exact numeric load key on the level wins.
   - When an assignment or teaching group uses an alias (e.g. `Sci`) that is omitted from `loads[level]` while its alternate spelling (e.g. `Science`) has a numeric load, remap the derived assignment/group subject to the stored load key so `shared/workload.js` resolves the numeric load without double-counting demand.
   - When neither spelling has a numeric load, preserve the missing load warning (`incomplete: true`).
   - When both spellings are explicitly present on the same level with conflicting values, refuse to guess: mark the level's conflicting load unavailable (`null`) in the derived copy and surface an explicit alias-conflict reason so workload stays `incomplete: true`.
2. Wire `workloadAliasView()` into `calculate()` in `v1/services/deploy/model.mjs` (preserving `#259`'s version-owned planning basis and publication calculation) and into the built v1 Deploy browser `workloadData()` via `scripts/v1/build-web.mjs`.
3. Add regression test `tests/v1-product-deploy-workload-sci-alias.mjs` proving:
   - Saved `Sci` assignment with numeric `Science` load resolves cleanly (no missing-load warning, exact periods counted, no demand double-count).
   - Exact key (`Sci` with `Sci` load) resolves cleanly.
   - Genuinely missing load remains incomplete/missing.
   - Conflicting aliases (`Sci: 4` and `Science: 6`) stay incomplete and never silently guess.
   - `#259` regression `tests/v1-product-deploy-workload-planning-browser.mjs` continues to pass.

## Files Planned

- `docs/coordination/tasks/v1-deploy-workload-sci-alias.md`
- `v1/web/shared/deploy-loads.mjs`
- `v1/services/deploy/model.mjs`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-deploy-workload-sci-alias.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Deployment, live school data, or live switches.

## Claude follow-up (owner-directed takeover, 21 Nov 2026 SGT)

Finding from `docs/coordination/review/v1-antigravity-pr263-273-claude-triage.md`, fixed here: `workloadAliasView` renamed load keys (`PE`→`PHE`, `Science`→`Sci`) but not level-wide group subjects. `shared/workload.js isFormSubject` compares group subjects by exact spelling, so a level-wide `PE` group stopped covering its level's class cells and class demand could be counted on top of the group. The derived view now gives groups the same canonical subject; saved rows are unchanged.

Tests (TZ=Asia/Singapore): `tests/v1-product-deploy-workload-sci-alias.mjs` case 6 fails before and passes after. Also passed: deploy-loads, deploy-workbooks, deploy-fortnight-browser, deploy-workload-planning-browser, deploy-compact-refresh-browser, table-deploy-settings, roster-accounting. Muse reviews the new exact head.
