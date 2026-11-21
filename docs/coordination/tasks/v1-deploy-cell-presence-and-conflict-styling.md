# v1 Deploy IP cell presence (`UI03`) and duplicate FT / class conflict styling (`UI01`, `UR03`, `D08`, `D09`, `TV07`)

- Task ID: `v1-deploy-cell-presence-and-conflict-styling`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-cell-presence-and-conflict-styling`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-cell-presence-and-conflict-styling.md`
- `v1/services/deploy/service.mjs`
- `v1/web/shared/deploy-ui.js`
- `tests/v1-product-deploy-cell-presence-browser.mjs`

## Scope
1. **`UI03` / `D08` / `TV07` — Concurrent cell editing & orange collaborator indicator in IP Deploy**:
   - Acquire, renew, and release cell-scoped leases (`<versionId>|cell:<rowId>:<subject>` and `<versionId>|cell:<rowId>:row-name`) when opening/closing `chooseTeacher` or `renameClass` in IP Deploy.
   - Return active leases (including `clientId` and actor identity) in Deploy `bootstrap`/`sync` and `/leases` so concurrent editors see active collaborator cells via live background lease polling.
   - Decorate any IP Deploy cell (`td[data-cell]` or `td.row-name`) actively leased by another editor/session with an **orange outline and translucent orange tint** (`.gsis-cell-collaborator`), **actor identity on hover** (`title` / `data-collaborator-actor`), and **cell lock** against concurrent editing while held.
2. **`UI01` / `UR03` / `D09` — Nonblocking live duplicate FT & duplicate/undefined class validation**:
   - Permit temporary duplicate Form Teacher (`FT`) assignments in the local draft without blocking input with an alert, while blocking **Save to online** (`UI02`) until resolved.
   - Give every FT cell containing a duplicated FT teacher and every duplicate/undefined class-name cell (`td.row-name`) a **thick red outline and subtle red tint** (`.gsis-cell-error`) with contextual conflict explanation.
   - Within affected FT cells, style **only the duplicated teacher name(s) in red text** (`.gsis-chip-duplicate-ft`) while unaffected FT teacher names in the same cell retain normal text styling (`D09`).
   - When a cell has **both** a red validation error and an active orange collaborator lock (`.gsis-cell-error.gsis-cell-collaborator`), keep both states simultaneously visible and discoverable (`UI03` / `D08` / `D09`).
