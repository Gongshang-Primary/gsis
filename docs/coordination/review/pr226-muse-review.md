# Review: PR #226 — Preserve saved teacher membership

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `c4544efce2aaf02042021327fdabdd60efa1975a`.
- Branch: `codex/v1-deploy-saved-teacher-membership`. Base: `1abe47d039befd685a02c03ef8116278a12a2711`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised. Refs #212; hosted verification still pending; this PR does not close the issue.

## What it does

Deploy hydrated a saved version by appending every current Contacts person: a genuinely empty saved teacher list appeared populated, while Delete checked the actual stored list and failed `Unknown staff`. The corrected reader refreshes facts for saved members and supplies Contacts candidates separately.

- `model.mjs`: `mergeContacts` gains `includeUnlisted` (default true, preserving old behavior for explicit callers) and `addStaffIds`. Unlisted Contacts people are appended only when `includeUnlisted` or explicitly listed. `validateTeachingBindings` and `calculate` now use `includeUnlisted: false`, so validation and calculation never silently add the whole Contacts inventory. `removeTeacherProfile` records the removed teacher in `d.removedTeachers` (snapshot preservation; it does not repair dangling historical allocations).
- `service.mjs` `bootstrap`: hydrates the full `staffCatalog` from Contacts for choices, but the saved doc keeps only the saved IDs — empty and legacy lists stay authoritative. The catalog is returned separately. `save` merges with `includeUnlisted: false` plus `addStaffIds` from the edits (add/upsert/set-field/set-memberships/set-reporting-officer), so only explicitly edited people can join; re-adding a person clears only that person's removal marker. `previewImport`/`applyImport` allow only the workbook's Staff ID/TTb Name people; `publish` and `/export` use `includeUnlisted: false`.
- `deploy-ui.js`: the Add-existing picker permits its explicit missing-person upsert through the current v1 profile/name projection (adds only the chosen person). `setTeacherField` stays strict — a missing person still throws.
- Explicit New/create, Duplicate, and Contacts refresh keep their current seeding behavior; #207 TTb names and #210 Versions notes remain intact. No Contacts writes, eligibility/authority policy, builder, schema, migration, runtime, or generated-output change. Source hunks are disjoint from the frozen New-inheritance and department ports and the Compact-layout hunk.

## Scope, merge, secrets

- Diff vs origin/main: exactly 9 files, matching the task record's exact nine-path allowlist. 623 insertions, 18 deletions.
- The two existing fixture changes (internal-links, role-memberships, 11 lines each) explicitly acquire the owner lease and commit `acceptContacts`, asserting durable member IDs before the unchanged checks — a fixture dependency repair, not a restoration of implicit population. The storage and contacts-projection changes assert 512 unique candidates in `staffCatalog` plus unchanged saved member IDs, instead of asserting the defect's implicit population.
- `git merge-tree --write-tree --name-only origin/main c4544efce2aaf02042021327fdabdd60efa1975a` clean (tree c3a3e9fc8701ff668908868cb52fb4b649efebad).
- Secrets scan of the diff: clean.

## CI at the exact head

- Node/LORD run 44415296391: success at head c4544ef (all four shards + full-suite).
- Dispatched product run 44415312020: success at head c4544ef (all 134 product programs).
- PR-triggered product run 44417185752: first attempt failed 133/134 — the only failing program was the unchanged `v1-product-stapler-resize.mjs`, killed at the 45s per-program ceiling (ETIMEDOUT, 45151 ms), with no failed assertion in the log. Same known timing flake as #223 and #224. The failed job was rerun; the rerun was still in progress when this record was written. The approval rests on the two green exact-head runs above plus the local pass of the flaked program.

## Local checks at the exact head (Singapore time, Playwright chromium-1234)

- `npm ci` root and `v1/`: exit 0.
- New test PASS: `v1-product-deploy-saved-teacher-membership` (5/5 groups).
- Regressions PASS: `v1-product-deploy-storage`, `v1-product-contacts-projection`, `v1-product-deploy-internal-links-browser`, `v1-product-deploy-role-memberships-browser`, plus #207 guard `v1-product-deploy-ttb-modifiers-browser` and #210 guard `v1-product-deploy-note-revision-browser`.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q05 supported by the scoped inventory, the saved-only reader, unchanged mutation/capability paths, and bounded reads. Q06 supported by exact-head CI above plus the local runs. Q07 is this review. Q08 is outside this task.
- Hosted/authenticated UAT and T1B-01/T1B-02: **Not tested**. F5 remains OPEN.
