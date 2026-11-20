# Review: PR #231 — Port Deploy layout-reference PDF and remove obsolete commands caller (F12)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `99f445d4574fd8eb84e543463e404144160cfcd6`.
- Branch: `antigravity/v1-deploy-layout-reference`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Clears both remaining F12 Deploy operation-probe allowances:

- New `v1/services/deploy/layout-reference.mjs`: serves the exact `Classroom-Layout-21-Sep-2026.pdf` bytes from a base64 constant (cached `Uint8Array`), with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Classroom-Layout-21-Sep-2026.pdf"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- `v1/services/deploy/service.mjs`: `/layout-reference` is added to the READ set and dispatched to the response. The READ set maps to the Core `deploy.read` action, so the route inherits the existing authorization: no session fails 401 (`SESSION_INVALID` in `handle`), and an account without `deploy.read` fails closed — verified in the code (route descriptor at service.mjs, `deploy.read` for READ paths) and in the test (401 unauthenticated, 403/503 for an ordinary account, no PDF bytes).
- `scripts/v1/build-web.mjs`: the flag-disabled `edgeCommandSend` `/api/commands` caller in built `deploy/app.js` is replaced line-for-line with a throw ("Deploy v1 writes directly to D1 without the legacy Apps Script command queue.").
- The operation-probe allowlist loses exactly the two F12 entries (`/commands`, `/layout-reference`).

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist (task record, new layout-reference.mjs, deploy service.mjs, build-web.mjs, operation-probe-allowlist.json, new layout-reference test). 154 insertions, 16 deletions.
- `git merge-tree --write-tree --name-only origin/main 99f445d4` clean (tree 2ab79dc1), re-checked against current main c318d141.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- Pair merge-tree with #230 (642a9643): clean (tree bd0e3084), no conflicts.
- PDF bytes verified independently: `layoutReferenceBytes()` decodes to 142,756 bytes, byte-identical to the v0.9 `public/_worker.js` embedded `layoutReference` base64.

## CI at the exact head

- Isolated v1 product run 44615671125: **success at head 99f445d**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt231-review` at 99f445d4, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-layout-reference.mjs`: exit 0, PASS — 401 unauthenticated; 403/503 fail-closed for an ordinary account with no PDF bytes; 200 authorized with exact headers and exact 142,756-byte PDF match against the v0.9 reference; built `deploy/app.js` has no `/api/commands` caller and keeps `/api/layout-reference`.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 406 probes, `knownMissing` 22 (was 24).
- `tests/v1-product-deploy-storage.mjs`: exit 0, PASS.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, Core-gated read, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
