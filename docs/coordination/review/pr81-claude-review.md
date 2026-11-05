# Claude review of PR #81 (D1 Drive backups, ledger, restore) at exact head 644108f (6 Nov ~00:45)

- Verdict: approve for merge (owner decides). CI full-suite green at 644108f (run 42046311671, 1,005/1,005 Node, 40/40 LORD). Claude locally at 644108f: all 8 new test programs pass; canonical build leaves no diff.
- Checked: allow-list tiers (TIER_ONE/TIER_TWO; everything else, incl. privateLinks and Tier 3, is never read); `sanitizeBackup` drops keys matching token/capability/secret/password/authorization/private link/signature/nonce and replaces private-link URLs and JWT-like strings in text; change capture via D1 triggers into gsis_backup_changes for hourly increments; ledger rows with lease; restore into inactive targets with historical sends quarantined.
- Deploy steps the owner must do by hand (not applied by pasting code):
  1. gsis-roster-notifications → Settings → Triggers: **add cron `1-59/2 * * * *`** (wrangler.toml adds it; the dashboard does not read wrangler.toml). Without it, Drive outputs never run.
  2. Admin → System Config → Drive backup: set the home-base folder ids (01 Live Data/Roster/Backups) and turn it on.
  3. First run: check the ledger shows a verified row; within 2 weeks run the manual restore drill in docs/ROSTER_DRIVE_BACKUP_RUNBOOK.md.
- Risks (not blockers): every backup and output write is an Apps Script Drive call; volume is small (hourly increments, 2-minute coalesced outputs) but it is Google load; watch the ledger durations. Removing token-like keys means a restore cannot resend old WhatsApp links (intended).
