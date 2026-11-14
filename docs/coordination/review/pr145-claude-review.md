# PR #145 review (v1 owner change queue, 14 items), Claude

Model: Claude. Reviewed 14 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `ec68e987e900ab84a4f6eae9ecd1195b00ed5374` |
| Base | `f8c401cd525610ed9d20c3264e3d70b948df7d2b` (main) |
| Size | 83 files, +13,603 / −495, five commits (two are merges from main) |
| Verdict | **Approve** (advisory; owner merges). Two items for the owner before Drive backup is switched on (D1, D2). One small fix before first deploy (L1). |

## Method and its limit

Risk-based, as for #139. 13,600 lines cannot be read line by line in one review. I checked authority and scope, every path outside the UI, the permission gate (`admission.mjs`), the only new delete path (REIGN cleanup), the new migrations, and what the Drive backup sends off-platform. I ran the full product suite and build. Most UI work (items 2–9, 11, 12) I judged by its tests, not by reading.

## Evidence I produced

Separate worktree at the exact head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium:

1. `node scripts/v1/test.mjs`: **62/62 product programs pass**.
2. `npm run build`: success, no tracked drift.
3. Merge-tree against origin/main: clean.
4. Every changed path is under `v1/`, `tests/v1-product*`, `scripts/v1/`, `docs/v1/` or the v1 task records. No production source, root CI or reviewed `v1/core` / `v1/contacts` contract changed.

Not verified by me: full Node/LORD CI (owner reports 1,159 + 40 green), nine Worker dry-runs, local migration upgrade, the 354 artifact hashes.

## Authority

The task record began as a four-file Admin form (item 1), then grew under the owner's instruction "work and build. clear changelog item by item" into the 14-item queue in `CHANGELOG_2026-11-14.md`. That covers this scope. Process note: the branch name and first task still say "admin-account-create"; one PR carrying 14 items makes review and rollback coarse. Future queues should be one PR per few items.

## What is sound

1. `admission.mjs`: new Contacts pin batching (up to 512). The full membership is written durably before the first remote call; overlapping attempts conflict instead of replacing it; replies are checked one by one (owner, scope, revision, expiry); expiry only shrinks. It speeds things up without loosening permission checks.
2. REIGN cleanup, the only new delete path: requires `lord.admin`, an archive in `verified` state at the expected revision, and the exact typed confirmation text; records who confirmed and when; photo deletion skips rows still referenced by bookings; unconfirmed object deletion is reported as "resume", not success.
3. Migrations are additive only (`CREATE TABLE/INDEX IF NOT EXISTS`); no DROP, DELETE, ALTER or UPDATE.
4. Item 1 Admin creation keeps a verified Google subject, explicit Admin grant (unchecked by default), idempotent retry and last-Admin protection.
5. Drive backup activation stays off; Google is synthetic in tests; no credential copied or activated (item 10).

## Findings

### D1 (medium, owner action before Drive backup is switched on): staff personal data goes to Drive

The Contacts daily workbook includes statutory names, mobile numbers, emails and day/month of birth. That matches what v0.9 backs up today, so it is not new exposure in kind, but the files inherit the sharing of Drive folder `1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k`. Before activation, the owner confirms in Drive that this folder and its subfolders are shared only with the intended Admins (no "anyone with the link", no wide school group).

### D2 (low, owner awareness): retention is manual

Drive history is owner-managed deletion; nothing purges old daily files. Personal data accumulates one file per day. Decide a retention period when convenient.

### L1 (low, before first deploy): two LORD migrations share number 0002

`v1/migrations/lord/0002-drive-backup.sql` and `0002_reign_archive.sql`. Wrangler applies both in name order, so it works, but the shared number invites a future ordering mistake. Renumber the REIGN file to `0003` while no environment has applied it yet.

## Status that does not change

Not deployed. Google backup activation and live UAT pending. F5 OPEN. Official T1B-01/T1B-02 and runtime UAT: Not tested.
