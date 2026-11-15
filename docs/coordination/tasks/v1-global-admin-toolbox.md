# Global Admin Toolbox navigation

- Status: claimed; 14 November 2026, Asia/Singapore.
- Model/owner: Codex. Coordinator: ChatGPT. Reviewer: Claude, exact head.
- Branch: codex/v1-global-admin-toolbox.
- Main observed: 96af8cc764c0fa8386e43b5693492de524334baf.
- Dependency: PR145 f1efe8a687cb640dae8731fe674acb72b33e7f9b. PR146 capacity files do not overlap this navigation implementation; same builder owns both. No legacy production UI edits.
- Owner authorisation: latest request for tenth Global Admin-only icon, central toolbox and one related PR at a time. No merge, deployment, provider activation or live deletion.
- Exact scope: v1/web/shared/{home,admin,module-shell}.js; v1/web/overlays/{index.html,admin/index.html}; tests/v1-product-navigation.mjs; tests/v1-product-toolbox.mjs; docs/v1/accelerated-delivery/GLOBAL_ADMIN_TOOLBOX.md; this task.
- Build: replace the stray home Admin link with a tenth equal tile; rename/reuse `/admin/`; index existing privileged accounts, service grants, health/backups and evidence tools; direct links and breadcrumbs work. Inventory all supplemental viewport panels and preserve business operations in their native settings with existing permissions. Storage/pruning and credential setup will be separately claimed functional tabs, not invented working controls in this PR.
- Verify: Global Admin versus ordinary/domain Admin and preview UI; existing server Core authority remains authoritative; browser deep links and native-control preservation; canonical build/no drift, focused and product/full CI. No new schema or dependencies. Runtime UAT Not tested; F5 OPEN.

## Implementation and gates

Q01–Q05 Pass: bounded navigation/label/deep-link change, same Core authority, no new datastore or dependency. All supplemental controls inventoried in `docs/v1/accelerated-delivery/GLOBAL_ADMIN_TOOLBOX.md`; native business controls stay with authorised operators. Global Admin-only tile and page gating includes preview denial; server remains authoritative.

Q06 focused Pass: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-navigation.mjs`; `... node tests/v1-product-toolbox.mjs` (actual isolated Core services plus browser; direct API denied to ordinary and domain Admin). `TZ=Asia/Singapore npm run build` passes with no generated drift. Full product/Node/LORD exact-head CI pending at commit time; PR holds updated evidence. No test failures in focused runs.

Q07 Pending Claude exact-head review; PR/base/head recorded in PR. Q08 no deployment authorised; runtime UAT Not tested. Rollback is this UI-only commit. Storage/prune/provider work remains separately claimed, not marked complete here.
