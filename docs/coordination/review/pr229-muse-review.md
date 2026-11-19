# Review: PR #229 — Register Deploy teachers by derived TTb Name

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `fb3411a2ca3f3d584b286f64d185036d57ecfa9a`.
- Branch: `codex/v1-deploy-ttb-registration`. Base: main `b0ff2f3b` (v1.07 05eedeee plus three docs-only claim commits on main). PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Deploy Teachers can register two people with the same Basic Name when their derived TTb Names differ. The v1.07 form sent Basic Name alone and Contacts rejected any same Basic Name with `IDENTITY_SELECTION_REQUIRED`, even when a subject modifier produced a distinct TTb Name. Pinned v0.9 already compared derived TTb Names.

- `scripts/v1/build-web.mjs`: the Add-teacher form now forwards only the typed naming inputs as `nameModifiers: {schemaVersion: 1, employmentTags?, subjectTags?, mkTags?, role?}` (tags split on comma/semicolon, trimmed, filtered) to `/staff/register`, for new teachers only. The committed-state/staffId check and the retry error are unchanged.
- `v1/services/deploy/service.mjs`: `/staff/register` forwards `nameModifiers` to Contacts (one line).
- `v1/services/contacts/service.mjs`: the register handler no longer blocks on same Basic Name. `nameModifiers` are strictly validated (Deploy service only, no `tags` alongside, object, schemaVersion 1, only the five allowed keys; each tag field an array, values validated). Basic Name and nameSuffix are validated. `previewTTb` (the shared #207 formatter, also used by `deriveDisplay`) derives the TTb Name; an over-long derivation fails 400. Required subject tags are appended. A known TTb collision fails 409 `IDENTITY_SELECTION_REQUIRED` ("Use a distinct TTb Name or select the existing person."), unless the operation already exists, in which case exact receipt replay applies. The intent carries a `registrationModifierDigest`, so changed intent is rejected. The atomic TTb uniqueness guard in the delegated `/staff/create` path (lower(ttb_name), inside the commit retry loop) is unchanged and covers the race the pre-check cannot see; its message is unified to the same wording, as is the staff_id existence message. The delegated call now mutates `ctx` (`Object.assign`) instead of spreading it, so the Worker can fence a delegated 4xx rejection against the original owner intent, including a collision that wins after the read. A role contributes a display tag only; it writes no Contacts role, activity, or authority. The existing-ID choice and legacy `tags` path are unchanged.

## Scope, merge, secrets

- Diff vs origin/main: exactly 7 files, matching the task record's exact-file list (task record, build-web.mjs, deploy service.mjs, contacts service.mjs, new registration test) plus the two disclosed CI supplements (LORD cart-groups fixture date, compact-on-load wait). 207 insertions, 35 deletions.
- `git merge-tree --write-tree --name-only origin/main fb3411a` clean (tree 3119c03a).
- `git diff --check`: clean. Secrets scan of the diff: clean.
- The three claim commits on main (af9e9d78, 0d11b24c, b0ff2f3b) are docs-only (task record only). #228 (v1.07 release) is merged.

## CI at the exact head

- Node/LORD run 44572055525: **success at head fb3411a** — all four shards pass, full-suite check passes (1,253 Node + 40 LORD programs per shard, per the PR body).
- Dispatched product run 44572083304: **success at head fb3411a** (152 product programs).
- Automatic PR-triggered product run 44574454758: **pass at head fb3411a** (22m17s).
- All three run head_shas verified via the API as fb3411a.

## Local checks at the exact head

Worktree `wt229-review` at fb3411a, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-ttb-registration.mjs`: exit 0, 3/3 groups pass — built browser flow saves two Staff IDs sharing a Basic Name with distinct TTb Names; exact replay preserves the ID, changed intent 409 `OPERATION_INTENT_CONFLICT`, duplicate TTb 409 `IDENTITY_SELECTION_REQUIRED`, concurrent registration creates one person with no stranded prepared operation; role-derived tag stays separate from Contacts role, activity, and authority; invalid modifiers 400.
- `tests/v1-product-contacts-direct-authority.mjs`: exit 0, 10 groups pass.
- `tests/v1-product-deploy-saved-teacher-membership.mjs`: exit 0, 5/5 groups pass.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 operations, 24 retained known-missing, 130 parsed scripts.
- `tests/v1-product-compact-on-load-browser.mjs`: exit 0.
- `tests/v1-product-lord-cart-groups-browser.mjs`: exit 0.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None. One note, not a finding: the derived-name invariant rests on the register pre-check and `deriveDisplay` both using the shared `previewTTb` formatter — verified in the code (catalogues.mjs calls `previewTTb(profile, presentation)`), and the new built-browser test exercises it end to end. Cross-draft reservation for future renames/imports remains out of scope, as the task record states.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, shared derivation, exact-head CI green across three runs, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
