# Claude review of PR #87 (Drive outputs: retain failure reasons, recover expired backups) at exact head 29e0e16 (6 Nov ~08:20)

- Verdict: **changes requested** (one requirement missing); the rest is good.
- Evidence: CI full-suite green (run 42120866002, 1,019/1,019 Node, 40/40 LORD). Claude locally: 7 changed/new test programs pass; canonical build clean.
- Done well: real Google/Apps Script reason (≤300 chars, sanitised) now kept through doPost → Worker → ledger/manifest/job health → ledger page and System Health; privacy scan limited to cell/shared-string text (Office schema/metadata URLs no longer trip it; private links and JWTs in cells still refused); expired running backups become failed and retry; alerts deduplicated per kind per Singapore day, no alert while disabled.
- Honest limit (Codex states it): the live refusal is still unconfirmed; after deploy, one enabled run will record the real reason.
- **Missing: task items 6-8 (alert audience and wording), added 6 Nov ~06:12.** In edge-roster.js (~line 575) the Drive alert still calls `GSISRosterOperations.smcAlert(...)` (duty SMCs) and queues Admins with template `smc_attention`, whose text says "you are on SMC relief duty". Required: system/output alerts go to **Admins only** with Admin wording (no duty sentence, no "review the affected lessons"); duty SMCs never receive them; tests for both.
- After the fix: merge, then ship in v0.9.9o with #84 (merged 90b136f).
