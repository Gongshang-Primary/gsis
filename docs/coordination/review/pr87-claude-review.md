# Claude review of PR #87 (Drive outputs: retain failure reasons, recover expired backups) at exact head 29e0e16 (6 Nov ~08:20)

- Verdict: **changes requested** (one requirement missing); the rest is good.
- Evidence: CI full-suite green (run 42120866002, 1,019/1,019 Node, 40/40 LORD). Claude locally: 7 changed/new test programs pass; canonical build clean.
- Done well: real Google/Apps Script reason (≤300 chars, sanitised) now kept through doPost → Worker → ledger/manifest/job health → ledger page and System Health; privacy scan limited to cell/shared-string text (Office schema/metadata URLs no longer trip it; private links and JWTs in cells still refused); expired running backups become failed and retry; alerts deduplicated per kind per Singapore day, no alert while disabled.
- Honest limit (Codex states it): the live refusal is still unconfirmed; after deploy, one enabled run will record the real reason.
- **Missing: task items 6-8 (alert audience and wording), added 6 Nov ~06:12.** In edge-roster.js (~line 575) the Drive alert still calls `GSISRosterOperations.smcAlert(...)` (duty SMCs) and queues Admins with template `smc_attention`, whose text says "you are on SMC relief duty". Required: system/output alerts go to **Admins only** with Admin wording (no duty sentence, no "review the affected lessons"); duty SMCs never receive them; tests for both.
- After the fix: merge, then ship in v0.9.9o with #84 (merged 90b136f).

## Re-review at head f91f9c3 (6 Nov ~10:15)
- Items 6-8 done: Drive/backup alerts use `GSISRosterOperations.systemAlert` → kind `system_alert`, audience `system-admin`, template `system_alert` (gsis_system_alert_v1), active Admins only; duty SMCs no longer receive them. Send-time recheck refuses legacy Drive jobs with duty wording and any `smc_attention` job without a current duty recipient. Message prefix "GSiS system alert for Admin:".
- New Meta template gsis_system_alert_v1 proposed (notification-worker/system-alert-template.proposed.json), `enabled:false` until approved: until then system alerts are recorded (System Health) but not sent by WhatsApp.
- Claude locally at f91f9c3: 7 programs pass (incl. roster-system-alert-audience.cjs); canonical build clean. CI was still running at review time.
- Verdict: **approve, conditional on full CI green at f91f9c3.** Then merge; Claude submits gsis_system_alert_v1 to Meta on the owner's word.
