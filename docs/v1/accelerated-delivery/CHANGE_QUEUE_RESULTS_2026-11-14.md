# V1 change queue results — 14 November 2026

Model: Codex. ChatGPT coordinates v1; Claude independently reviews exact heads. This is a build handoff, not merge/deployment approval. Main was refreshed at `4da8c5c9a53d5f05e0abbfa8093f8ecc387defec`; the documentation claim is `71fc8fe`. Historical source approval wording does not authorise release.

## Built items and exact Git handoffs

| Group | PR / branch | Exact implementation head | Base / state |
| --- | --- | --- | --- |
| Original 14-item UI, tables, backup and REIGN queue; migration L1 | [145](https://github.com/helper-gsps/gsis/pull/145), `codex/v1-admin-account-create` | [f1efe8a687cb640dae8731fe674acb72b33e7f9b](https://github.com/helper-gsps/gsis/commit/f1efe8a687cb640dae8731fe674acb72b33e7f9b) | Claude approved; CI green. Not merged/deployed. |
| Actual layered capacity and remaining-week read projection | [146](https://github.com/helper-gsps/gsis/pull/146), `codex/v1-relief-capacity-forecast` | [692ea365522cd90c4961b7e6fb43072848253677](https://github.com/helper-gsps/gsis/commit/692ea365522cd90c4961b7e6fb43072848253677) | Based on 145. Claude approved; CI green. |
| Global Admin Toolbox tenth tile and maintenance navigation | [147](https://github.com/helper-gsps/gsis/pull/147), `codex/v1-global-admin-toolbox` | [70a210275ab477c58a46f8988dd7a152beaf09f8](https://github.com/helper-gsps/gsis/commit/70a210275ab477c58a46f8988dd7a152beaf09f8) | Based on 145. CI green; Claude review pending. |
| D1/R2 inventory and explicit bounded scratch pruning | [148](https://github.com/helper-gsps/gsis/pull/148), `codex/v1-storage-toolbox` | [a950b8b84394943a7914fea00037a8ad0dc93ddf](https://github.com/helper-gsps/gsis/commit/a950b8b84394943a7914fea00037a8ad0dc93ddf) | Based on 147. CI green; Claude review pending. |
| Protected provider-secret deployment setup | [149](https://github.com/helper-gsps/gsis/pull/149), `codex/v1-provider-secret-setup` | [ed6ecb5bdde4acc2a1d54cf3253526fce69980d3](https://github.com/helper-gsps/gsis/commit/ed6ecb5bdde4acc2a1d54cf3253526fce69980d3) | Based on 145. Product CI green; full-suite rerun pending; Claude review pending. |
| F5 captured allow-decision recovery verification | [150](https://github.com/helper-gsps/gsis/pull/150), `codex/v1-f5-evidence-recovery` | [a5ec4e3b3a9ea12bc7183cee1977d55966d196c7](https://github.com/helper-gsps/gsis/commit/a5ec4e3b3a9ea12bc7183cee1977d55966d196c7) | Based on 145. Full-suite CI green; product rerun and Claude review pending. F5 OPEN. |
| Current capacity warnings and scheduled weekly SMC outlook | [151](https://github.com/helper-gsps/gsis/pull/151), `codex/v1-capacity-notifications` | [39125e1df5c34db7e5468458658ec9e86a7cebbb](https://github.com/helper-gsps/gsis/commit/39125e1df5c34db7e5468458658ec9e86a7cebbb) | Based on 146. CI and Claude review pending. |

The [original item-by-item changelog](https://github.com/helper-gsps/gsis/blob/f1efe8a687cb640dae8731fe674acb72b33e7f9b/docs/v1/accelerated-delivery/CHANGELOG_2026-11-14.md) records the home layout/copy, breadcrumbs, table contracts, signature graphics/scrolling, Deploy parity, Stapler bulk edits/resizing, Calendar export/setup, provider separation, relocated controls, OVERLORD reference editors, readable Drive backups and REIGN Wrapped/archive/cleanup. These are implemented, not live-UAT accepted. PR145's last bounded commit only renames REIGN to `0003_reign_archive.sql` and updates its verification comment.

## Verification record

All local commands use `TZ=Asia/Singapore`. Canonical command: `npm run build`, followed by tracked-diff checks. Product runner: `node scripts/v1/test.mjs`; browser environment uses local `/usr/bin/chromium`. Existing Node runner discovers `v1-product-*.mjs`; full regression command is `npm test` (Node plus LORD). Exact CI results and failures are recorded in each PR.

- 145: local migration upgrade, canonical build/no drift, 62/62 product; full-suite and product CI green. Claude's re-review is on main `0a6b6d4` at `docs/coordination/review/pr145-claude-review.md`.
- 146: 64/64 product; full local 1,161/1,161 Node programs and 40/40 LORD programs on the reviewed implementation bytes. CI full suite passed; product attempt 1 timed out in an existing browser test, attempt 2 passed at the same head. Claude review main `a916f9e`, `docs/coordination/review/pr146-claude-review.md`.
- 147: 63/63 local product; exact-head product and full-suite CI green.
- 148: 64/64 local product; real local migration upgrade, typed-confirmation browser flow, partial R2 deletion/restart and manifest/reference guards passed. Exact-head product and full-suite CI green. D1 unsupported free-page PRAGMAs were removed; unavailable metrics remain explicitly unavailable.
- 149: 63/63 local product, synthetic secret-leak/owner-routing/default-off tests and existing provider/webhook tests pass. Product CI passed. Full-suite attempt 1 failed shard 2; detailed log retrieval returned 403, so cause is not established. Failed jobs rerun at the same head; no false green claim.
- 150: eight focused verification groups, real Core/Contacts restart and separate-owner restore followed by actual recovery API, 63/63 local product pass. Canonical no drift. Tampered event and missing immutable content reject. Full-suite CI green. Product CI attempt 1 timed out at 45 seconds in unchanged v1-product-roster-tables.mjs; rerun pending at the same head.
- 151: focused warning/dedup/quiet-time/template tests and actual D1 stale-delivery refresh pass; all 14 real Roster service groups pass. Canonical no drift; broader product/CI pending.

Checks still running are not passes. Individual PRs carry later CI updates; recheck exact current heads before any release decision. The F5 implementation commit message omitted the Model prefix; its claim and PR explicitly identify Codex, and published history was not rewritten.

## Storage controls and retained evidence

The Toolbox is visible only to Global Admin, with server-side Core authority checks. Ordinary module settings remain with their authorised operators. The [inventory](https://github.com/helper-gsps/gsis/blob/70a210275ab477c58a46f8988dd7a152beaf09f8/docs/v1/accelerated-delivery/GLOBAL_ADMIN_TOOLBOX.md) explains placement.

[Storage controls](https://github.com/helper-gsps/gsis/blob/a950b8b84394943a7914fea00037a8ad0dc93ddf/docs/v1/accelerated-delivery/STORAGE_TOOLBOX.md) measure D1 size and paginated R2 objects. An R2 page is not an account billing total. Logical D1 row deletion does not promise immediate physical-file shrinkage. Prune is limited to expired scratch previews and unreferenced backup-attempt files under a verified committed backup prefix. Preview binds exact objects/expiry; confirmation is explicit; interrupted object cleanup resumes through a retained journal. Valid backups, operational artifacts, receipts, audit and F5 evidence are preserved. No cross-D1/R2 atomicity is claimed.

D2 Drive retention remains an owner choice; no automatic deletion was built. Drive sharing is owner-managed. REIGN remains the separately guarded archive-before-cleanup operation, not a general history purge.

## Browser-only provider configuration

Use **GitHub → helper-gsps/gsis → Settings → Environments → gsis-v1-owner-approved → Environment secrets**. Do not put credentials in Git files, frontend fields, screenshots or chat. Existing tokens need not rotate for migration.

- `WA_ACCESS_TOKEN`: WhatsApp provider token.
- `WA_APP_SECRET`, `WA_VERIFY_TOKEN`: existing WhatsApp webhook verification secrets when ingress is separately approved.
- `TG_BOT_TOKEN`: existing Telegram token; a separate bot-ID secret is not needed because its numeric prefix identifies the bot.
- Keep `GSIS_SECRET` and `CLOUDFLARE_API_TOKEN` as already configured.

Nonsecret `GSIS_V1_SCHOOL_CONFIG.settings` values include `WHATSAPP_PHONE_NUMBER_ID`, approved `WHATSAPP_TEMPLATES_JSON` (exact names/languages/parameter order) and `LORD_MONITOR_TELEGRAM_CHAT_ID` (destination chat, not bot ID). Optional Drive/email credentials and exact owner routing are in the [provider setup guide](https://github.com/helper-gsps/gsis/blob/ed6ecb5bdde4acc2a1d54cf3253526fce69980d3/docs/v1/accelerated-delivery/PROVIDER_SETUP.md). Upload is a default-off, separately chosen protected workflow option. No token was read, changed or uploaded in this queue; no scheduler, sender, webhook or Drive backup was activated.

## Remaining gates and next decision

After Claude reviews each exact head and CI is green, the owner decides which groups may merge. 145 must precede its children; 147 precedes 148; 146 precedes 151. Reconcile claim-record conflicts against then-current main and obtain review of changed heads. Claude specifically identified the mechanical task-record add/add conflict in 146; do not resolve it by merging an unapproved base. The documentation handoff has no release side effects.

**F5 remains OPEN**: the new recovery verifies captured allow decisions, actual observations and immutable Contacts history. It does not close rejected-decision capture, live durable recovery, destination-commit verification or retention policy. See [recovery evidence and closure requirements](https://github.com/helper-gsps/gsis/blob/a5ec4e3b3a9ea12bc7183cee1977d55966d196c7/docs/v1/core/F5_RECOVERY_VERIFICATION.md).

Official T1B-01/T1B-02 and all unperformed runtime UAT: **Not tested**. Merge, deployment, live cleanup, provider sends, migration and backup activation still require their separate owner instruction. The next owner decision is release scope after review, not whether tokens should be rotated or automatic deletion should be enabled.
