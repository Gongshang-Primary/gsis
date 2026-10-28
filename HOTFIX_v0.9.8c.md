# Install GSiS v0.9.8c

Baseline: the Google-authoritative 0.9.8b recovery installation. Use these three matched components.

1. Save the current Roster Apps Script, notification Worker and Pages deployment for rollback.
2. Replace the existing Roster Apps Script code with `Roster_Backend_v0.9.8c.gs`. Save, then Deploy → Manage deployments → edit the existing web app → New version → Deploy. Keep the same URL and Script Properties.
3. In Cloudflare → Workers & Pages → `gsis-roster-notifications` → Edit code, replace it with `Roster_Notification_Worker_v0.9.8c.txt` and deploy. Preserve secrets, notification settings and cron triggers.
4. Upload `Roster_Frontend_v0.9.8c.zip` to the existing Roster Pages project. Do not upload the outer release ZIP as the site.
5. Refresh Roster and check v0.9.8c. Sign in as Admin to see System Health beside the other header buttons.

## Private timetable cache

Reuse the existing resources. On both the Roster Pages project and notification Worker, check Settings → Bindings:

- `ROSTER_TIMETABLE_SNAPSHOTS`: the existing private R2 bucket.
- `GSIS_JOBS`: the existing D1 database. Both components must use the same database and bucket.
- Under Variables and Secrets, `ROSTER_SNAPSHOT_CACHE` = `true`.

Keep the bucket private. Cache metadata tables are created automatically; do not import roster state or enable D1 authority. Missing cache bindings leave authoritative Google reads working, but do not provide the new R2 cache. No new Operations Worker or Queue is required.

On `gsis-roster-notifications` → Settings → Trigger Events, retain the every-minute scheduler and the daily cron `15 18 * * *` (02:15 Singapore). The daily trigger prunes the new private timetable cache in bounded batches. It does not read the full Roster or build timetables. Older cache namespaces and operational records are deliberately untouched. Cleanup may require several daily runs for a backlog.

Every timetable cache read still makes a small fresh Google authorization/source check. Saved timetable parts are reused until that source changes. Cache preparation after a save is best effort; if interrupted, the next request rebuilds the missing cache. A confirmed save stays confirmed. No browser timer replaces an active Stapler plan.

## Uncertain colleague email

Admin → System Health → load the colleague email review → review the named/date-specific row → “Mark reviewed…” → confirm the no-send review. This clears its unresolved operational warning while retaining uncertainty. It neither recalls an email nor claims it was delivered. A retry after an uncertain review response uses the same review request identity.

Last successful notification processing is not proof of WhatsApp delivery. Check recipient delivery details. Missing health evidence is shown as unavailable, not as success. System Health uses existing D1 metadata; it does not erase reports or allocations.

## Acceptance and rollback

Check a controlled absence reaches Saved, a relief edit retains its receipt, an open Stapler plan survives a background check, recess moves and saves correctly, and System Health shows the intended status. Local tests cannot verify production permissions, bindings or provider delivery.

To roll back, restore the three 098b components together. Preserve data, receipts, bindings and secrets. New cache and diagnostic metadata are additive; do not delete them to roll back code. Code rollback does not undo saved records or messages.
