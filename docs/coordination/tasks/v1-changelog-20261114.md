# v1 owner change log implementation — 14 November 2026

Owner: “work and build. clear changelog item by item.” This ends the recording-only hold. Model: Codex; v1 coordinator ChatGPT; exact-head reviewer Claude. Continue the single implementation PR145 on codex/v1-admin-account-create; supersede its narrow four-file scope for this queue. No merge/deployment/live data operations or deletion authorised by this instruction. PR144 deployment documentation remains separate.

Base main: 51e5054568620f17f88a02f1d959d1980e204618. PR145 item1 head 34dafbcd257615df79975c778508156c21c07469 has green product/full-suite CI, review pending. Other active PR scopes remain untouched. Legacy code is read-only reference, including PR142 Stapler dbd9fb432ba2a7fb6a485a2f94333f23b22d3818.

Scope: v1/web/**; v1/services/lord/**; v1/runtime/{backup,providers,worker}.mjs; new v1/runtime/drive-backup*.mjs; v1/migrations/*/0002*.sql; scripts/v1/**; tests/v1-product*.mjs; docs/v1/accelerated-delivery/{CHANGELOG_2026-11-14,OPERATIONS,VERIFICATION}.md; this task and v1-admin-account-create task. Existing v1/core and v1/contacts contracts, legacy runtime, root build/CI and production outputs unchanged. Necessary scope expansions must be recorded before edits.

Queue, in owner order:
1. Add other Admins: existing PR145 implementation, verify and retain.
2. Home: equal rounded-square 3x3 icon tiles. Roster, Contacts, Calendar / Venues, Layout, Deploy / LORD, STARLORD, OVERLORD. Reuse icons; clean geometric fallback. Exact owner descriptions from chat.
3. Compact breadcrumbs across viewports; app home and current section. No top feature shortcuts; permission-scoped functions inside native tabs. Preserve dirty navigation checks.
4. Enforce canonical Core table specification, not an invented subset: partial filters, sorting, columns, scrolling, import/export and preview/permission semantics.
5. Signature uses v0.9 assets; expanded Outlook/Gmail instructions remain vertically scrollable.
6. Deploy v0.9 UI parity, all items visible with explained unavailable states; version management under Versions.
7. Stapler v0.9 row/column write across/down with existing-only versus fill-empty modes; horizontal divider resize and Card Pit lower-right resize.
8. Calendar PDF/Excel exports, visible but disabled without data; v0.9 formatting preserved.
9. Calendar Setup reorganised into compact connections, diagnostics, recovery, advanced/danger sections; remove obsolete Apps Script/v0.9 wording.
10. OVERLORD Telegram existing bot/token retained; credentials external to source/assets/packages, backend secrets only; no integration activation.
11. Audit and relocate all appended/top-bar extra options across nine viewports into appropriate existing sections. Preserve functionality and security; no detached panels.
12. OVERLORD direct reference tables: classes/groups, subjects/activities, trolley/cart/type/quantity/accessories, periods; staff from Contacts. Core table standard and history/reservation safeguards.
13. Readable mostly importable Excel Drive backups under folder 1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k, children Calendar/Contacts/Deploy/Layout and Venues/LORD/Roster. Names YYYY MMmmm DD (hhmmss only if necessary), one logical file/day overwritten. Async catch-up, 23:50 Asia/Singapore revision/integrity check; unchanged months-old is current. Admin System Health status only. Drive history manually deleted; do not recreate deliberately removed historic days. Cloudflare retention preview/design; no automatic general cleanup without retention policy.
14. LORD REIGN: preserve Wrapped-style recap, Drive-readable and complete recovery archive, verify then show cleanup summary; explicit confirmation before eligible period-specific D1/R2 removal. Preserve active/future, unresolved custody/incidents, retained references and minimal archive receipts. No actual data cleanup in implementation.

Parallel subagents allowed on disjoint assigned files; root owns build wiring/integration, records and commits. Tests use synthetic data and TZ=Asia/Singapore. No external backup writes or messaging. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested. Claimed items remain pending until implemented and verified, with omissions explicit.
