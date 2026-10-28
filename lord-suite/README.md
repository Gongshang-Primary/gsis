# LORD in GSiS Suite v0.9.7

LORD, OVERLORD and STARLORD use patch label 0.9.1a over the GSiS Suite v0.9.1 baseline. This is the successor to the standalone LORD v1.8.1 package. The lower numeric prefix reflects suite harmonisation, not a data downgrade.

For an existing v0.9.1 installation, follow [patch installation](../HOTFIX_v0.9.7.md). It requires no new properties, bindings, schema migration or trigger setup. The patch adds directly typed booking fields and safe property retention with reserved queue capacity.

The backend retains its own verified Contacts and published Deploy reference snapshot. Ordinary booking, identity and display reads use that local snapshot. Background checks fetch changed source projections; unpublished class renames cannot enter the active directory.

Start with [Upgrade](docs/UPGRADE.md) for an existing installation or [First time setup](First_Time_Setup/FIRST_TIME_SETUP.md) for a new one. Follow [GSiS bridge setup](docs/gsis-integration/SETUP.md) to enable shared references. Runtime source reads Apps Script Properties and Cloudflare Pages settings. Preserve current secrets, IDs and session settings in those locations before replacing code; keep the private settings ledger outside the source and deployment ZIPs.

GSiS v0.9.7 includes the token-free correction retained from `v0.9-correction`. All three LORD applications use release label 0.9.1a. The earlier configured-source ZIP is superseded. This source release does not deploy the apps or change live settings.

The root GSiS Suite builder packages these components with Deploy, Roster, Calendar, Contacts and Layout. Standalone verification remains available:

```sh
python3 tools/prepare_first_time.py
python3 tests/run_all_checks.py
python3 tests/build_release.py
```

Set `LORD_TEST_CHROMIUM` to a Chromium executable for rendered browser checks. Cross application tests discover the enclosing GSiS Suite repository; set `GSIS_SOURCE_ROOT` only when checking an independently extracted component beside another source tree.

Internal schema, draft, cache and request key versions remain unchanged to preserve existing records and pending operations. Historical diagnostic entry points and approved provider template names remain supported.
