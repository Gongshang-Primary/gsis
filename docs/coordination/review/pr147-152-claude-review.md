# PRs #147–#152 review (v1 change queue follow-ups), Claude

Model: Claude. Reviewed 14 Nov 2026 (Asia/Singapore). One record for six PRs; each verdict is for its exact head and covers only that PR's own commits (stacked parents reviewed separately).

| PR | Head | Own diff | Verdict |
|---|---|---|---|
| #147 Global Admin Toolbox | `70a210275ab477c58a46f8988dd7a152beaf09f8` | 9 files, +114/−21 (on #145) | **Approve** |
| #148 Storage inventory and prune | `a950b8b84394943a7914fea00037a8ad0dc93ddf` | 17 files, +389/−3 (on #147) | **Approve** |
| #149 Provider-secret setup | `ed6ecb5bdde4acc2a1d54cf3253526fce69980d3` | 6 files, +131/−18 (on #145) | **Approve**, owner note P-1 |
| #150 F5 evidence verification | `75e4b5695c58e8618f387fe90013232a7e9ffc34` | 7 files, +151/−26 (on #145) | **Approve**; F5 stays OPEN |
| #151 Capacity warnings and outlook | `8e653b144ed29a5f5783a7705bb9ff9a00ea6c99` | 5 files, +146/−6 (on #146) | **Approve**, note N-1 |
| #152 Results document | `85436a4…` | 1 file, +58 (on main) | **Changes requested** (C-1) |

All verdicts advisory; the owner merges.

## Evidence I produced

Separate worktree per head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium. Focused programs only, not the full 63–65 product suite:

- #148 (includes #147): toolbox, navigation, storage-toolbox, migration-packaging: all pass. Build clean, no drift.
- #149: provider-secret-setup, deployment: pass. Build clean.
- #150: evidence-recovery, core-contacts (real D1/R2 restart and restore): pass. Build clean.
- #151: capacity-notifications, roster-capacity, roster-service, roster-accounting, webhook-integration: pass. Build clean.

Not verified by me: full product suites and CI at these heads (Codex reports most green; #150 and #151 final-head CI pending per #152).

## #147 Global Admin Toolbox

Admin link replaced by a tenth home tile shown only when the session has `core.admin` and is not impersonating; the Toolbox page applies the same check. Server-side Core permission still governs every action; the UI gate is convenience only. Section navigation via hash, falling back to Accounts. Sound.

## #148 Storage inventory and prune

Requires `core.admin` on every route. Only two prune kinds: expired Calendar/Layout previews (max 100), and content-addressed attempt files absent from a **committed** backup's manifest (manifest, data and every referenced object protected). Preview has a 5-minute window, a digest and typed confirmation; confirm reselects and must match exactly. D1 deletes and the journal commit atomically and are blocked while any other operation is prepared. R2 deletion runs only on explicit "finish", re-checks the unchanged manifest and each object's etag and size, and verifies absence after delete; resumable after restart. Migrations are additive `CREATE TABLE IF NOT EXISTS`. Inventory refuses to invent D1 free-page numbers. Sound.

## #149 Provider-secret setup

Re-adds the seven provider secrets to `v1-deploy.yml` behind a new boolean input that defaults **off**; when off, every provider value resolves to an empty string. Adds `github.ref == 'refs/heads/main'` to the job condition, a good extra guard. `provider-secrets.mjs` gives each secret only to the owners that consume it; the web Worker gets only `GSIS_SECRET`; formats are validated before any migration or deploy step. Upload still does not change sender, webhook or scheduler ownership.

**P-1 (owner note):** with the box ticked, an environment secret that is missing falls back to a same-named **repository** secret if one exists. This is the R1 concern, now opt-in. Before ticking it the first time, either confirm no repository-level secrets with those seven names exist, or accept that any that do will be used. Also, the guide calls `GSIS_SECRET` "the common GSiS backend secret"; for v1 it must be the separate v1 value already set (owner decision 13 Nov). Wording only.

## #150 F5 evidence verification

New sidecars (schema 2) store the final T1A decision and are sealed with a digest over event, sidecar, principal and request binding in the existing single Core row. Event and sidecar times now use the decision's own `evaluatedAt` and `requestId`, fixing a real inconsistency (request start could precede the Contacts observation). Recovery checks scope, decision fields, observation time ordering and the three role revisions, then fetches the immutable snapshot from Contacts and rejects if it is missing or differs; it never substitutes current facts. Legacy records report `incomplete`. Documentation is honest: the digest is not a signature against an administrator; rejected decisions are not captured; live durability is unproven. **F5 stays OPEN**, correctly.

Process: commit `a5ec4e3` lacks the `Model:` label (acknowledged in #152; not rewritten). Acceptable once.

## #151 Capacity warnings and weekly outlook

Legacy capacity warnings are replaced by v1 layered health; new warnings queue only when capacity is verified. At dispatch, each capacity message is **re-evaluated**; if capacity recovered, the period started, or evidence is unverified, the job is cancelled (`CAPACITY_WARNING_OBSOLETE_OR_UNVERIFIED`). Message text says "choices overlap across periods; not additive R" and "bounded projection, not a booking or minimum external headcount", which addresses my #146 note. Sends remain behind `SEND_OWNER`.

**N-1 (watch in staging):** `updateCapacityWarnings` now runs inside Roster `operations`, allocation runs and scheduled communication, building up to seven allocation snapshots per call when quotas are requested. Each snapshot reads other services. Measure Roster save latency in staging; the product already misses its first-screen target.

## #152 Results document

**C-1 (must fix): wrong secret names.** The "Browser-only provider configuration" section tells the owner to create `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` and `TG_BOT_TOKEN`. The workflow in #149 reads `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN` (plus `TELEGRAM_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT`, `EMAIL_API_TOKEN`). Secrets saved under the short names would be silently skipped. Replace the list with the exact names from `PROVIDER_SETUP.md` in #149. Otherwise the document is accurate and honest about pending checks.

## Cross-cutting: add/add conflicts (L-1)

#147, #148, #149 and #151 each conflict with main in their own task record, because the claim was committed to main and again on the stacked branch. Same as #146. Each is mechanical: after the parent merges, merge main and keep the branch's version. To stop this recurring, when stacking on an unmerged parent, merge main's claim commit into the branch right after claiming, before adding evidence.

## Merge order

#145 → #146 → #151; #145 → #147 → #148; #145 → #149; #145 → #150; #152 after C-1 is fixed. Resolve L-1 conflicts and recheck CI at each final head.

## Re-review (14 Nov 2026)

| PR | New head | Verdict |
|---|---|---|
| #152 | `af9771456b0de9a809b7463530adbd23f0020777` | **Approve**. C-1 resolved. |
| #149 | `c500998bc6beec22f5242d8a5a535358576a5989` | **Approve**. Wording note resolved. |

- #152: one documentation file. The owner instructions now list `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT`, `EMAIL_API_TOKEN`, plus the v1 `GSIS_SECRET` and `CLOUDFLARE_API_TOKEN`. I compared this list mechanically with every `secrets.*` reference in #149's `v1-deploy.yml` at `c500998`: identical, nine of nine. Also records the stacked-claim rule and the N-1 staging latency check. Merge-tree with main: clean.
- #149: only `PROVIDER_SETUP.md` changed (3 lines): states v1 uses its own separate `GSIS_SECRET`, distinct from v0.9 (owner decision 13 Nov). No workflow or script change since `ed6ecb5`, so my test results there still apply. The add/add task-record conflict (L-1) remains, deferred until #145 merges, as agreed.
- `git diff --check` clean on both. CI at both new heads not seen by me (Codex reports running).

## Recheck after #145 and #150 merged (14 Nov 2026)

Main: #145 merged as `7d7abad` at the reviewed head `f1efe8a`; #150 merged as `1d38279` at the reviewed head `75e4b56`. `git show --remerge-diff` shows both merges are clean (no hand edits).

| PR | New head | Reviewed head | Verdict |
|---|---|---|---|
| #146 | `b84f8dbd7c0eb169a5caadcbb63badfc451e1aac` | `692ea36` | **Approve** |
| #147 | `a80a3dea8bd01bf5d8b0aa4217016552d09746e8` | `70a2102` | **Approve** |
| #149 | `9734215eca7ee8551fe29401ba274fcedb18f305` | `c500998` | **Approve** |
| #152 | `8c0b72d472dd581df755bf9f19d58da26eea1455` | `af97714` | **Approve** |

Method, per PR:
1. No new non-merge commits beyond the reviewed head except those already on main.
2. Exactly one new merge commit. `--remerge-diff` shows the only manual change is the L-1 task-record conflict (#146, #147, #149); #152's merge is clean.
3. The resolved task record is byte-identical to the reviewed branch version.
4. Every other file the PR changes relative to main is the same set, with identical content, as at the reviewed head.
5. Merge-tree against current main: clean for all four.

No new code to test; my earlier focused results stand. Fresh CI at these heads not seen by me (Codex reports running). Remaining: #148 after #147 merges; #151 after #146 merges; each needs the same main sync and recheck.

## Recheck of #148 and #151 after parents merged (14 Nov 2026)

Main at `ac15953`: #146, #147, #149 and #152 merged.

| PR | New head | Reviewed head | Verdict |
|---|---|---|---|
| #148 | `c87acf8e016b75b2706e65b79bbedf6bd1dd28aa` | `a950b8b` | **Approve** |
| #151 | `1b6affcfa99efcdad9972a488264bd0e8fbea0f8` | `8e653b1` | **Approve** |

- #148: one merge commit; `--remerge-diff` shows only the task-record conflict, resolved to the reviewed branch version byte for byte. Own files identical to the reviewed head. Merge-tree with main clean.
- #151: one clean merge commit, no hand edits; task record identical to the reviewed version. It was synced before #147 merged, so a plain diff against main lists #147's files. I checked the actual three-way merge result (`git merge-tree` with current main): all eight #147 files come from main unchanged, and #151's four own files are byte-identical to the reviewed head. Merge-tree clean.
- Note: #151's CI ran on a base without #147. The two touch unrelated areas (Roster service vs Admin UI), so risk is low, but the owner should check main's CI after merging #151, or ask Codex to sync once more if a pre-merge run is preferred.
