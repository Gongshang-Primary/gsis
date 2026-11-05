# roster-d1-fresh-start: start Roster on D1 without history and without baseline timetables

- Status: changelog / design (owner request 5 Nov 2026); Codex, lane R; after roster-d1-timetable-reconcile-cancels
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 5 Nov 2026 05:10

## Owner request
"write up also D1 start from no history no baseline timetable". Context: the owner is ready to forgo historical records ("not much as I just started this project") and re-upload baselines and redo Stapler plans, instead of a full import.

## Principle
Google stays frozen and read-only as the archive (records are kept, not migrated), so the "keep records" rule still holds. D1 starts clean.

## What D1 starts with
| Data | Fresh start |
|---|---|
| Staff, SMC/Admin roles | From Contacts (already live via references) |
| Published Deploy data (classes, subjects, teaching groups, venues) | From Deploy (already live via references, #54) |
| System Config (workload limits, exclusions, rules, notification settings) | Copy the small config object from Google (one step), or re-enter |
| Name bridges | Copy from Google, or re-enter |
| Baseline timetables (register + day models) | **Empty**; owner re-uploads through the normal Roster timetable upload on D1 |
| Stapler plans | **Empty**; owner redoes them |
| Relief history, absences, assignments, audit, acknowledgements, outbox, inbox | **Empty** (history stays on Google) |
| Accounting year R counts (fairness) | Owner choice: (a) reset to 0, or (b) carry one opening balance per teacher (relief done, quota) as a single dated "opening balance" record |

## Build
1. A new edge-setup path "Start fresh on D1" (Admin, behind a typed confirmation), separate from Import. Preconditions: Google frozen; D1 heads legacy or reset; optional config copy taken from a signed Google read.
2. Creates empty but schema-valid `roster` and `roster-register` states (revision 1) plus the copied config (and opening balances if chosen), marks both scopes `imported` with a `freshStart:true` manifest and a digest, and records an audit event. Parity for a fresh start = config digest matches the Google config read, plus registers/states are empty by design (no history parity).
3. Activation reuses "Activate verified owner" unchanged after this; Cloudflare flags as today.
4. The timetable upload and day-model preparation must work on D1 with an empty register (first upload becomes active). Verify the D1 upload path end to end.
5. Rollback: "Switch back to Google" restores Google as authority; D1 writes since activation are listed for re-entry (same as today). Google data is unchanged throughout.
6. Statistics, My Calculations, history views: show "since <fresh-start date>" and link to the Google archive for earlier history (read-only).
7. Tests: fresh start → upload a baseline → absence → Auto-allocate → reload twice (no cancellations) → publish → WhatsApp queued; opening balances honoured in fairness ordering; config copy digest; refusal when not frozen or not reset.

## When to use
Best at a natural break: the school holidays or the new school year (January 2027), when the accounting year resets anyway and new baselines are uploaded. Owner decides; this is the fallback if full imports keep failing.

## Owner ruling (5 Nov 2026): opening balances, entered by Admin
"give admin only place to enter. should be a filterable list of teachers with cumulative quota to date and cumulative relief done to date, like an excel sheet interface"
- Fairness option (b): one opening balance per teacher, entered by an **Admin only** (SMC can view, not edit).
- Screen: Roster → Admin → **Opening balances** (fresh start only, also usable later to correct a balance with an audit reason).
- Spreadsheet-like grid: one row per active teacher from Contacts; columns **Teacher**, **Cumulative quota to date (periods)**, **Cumulative relief done to date (periods)**, **As of date**, **Last edited by/at**. Filter box (name, department/role), sortable columns, keyboard entry (Tab/Enter moves cells), paste a block from Excel (two numeric columns aligned by teacher name, with a preview of matches and mismatches before saving), CSV export.
- Validation: whole numbers 0 to 9999; done may exceed quota (warn, not block); unknown or duplicate names in a paste are listed and not saved.
- Save: one Admin command with a receipt; each changed row becomes an audited "opening balance" record (as-of date, values, actor, reason); fairness (R% and allocation order) = opening balance + relief recorded on D1 after the as-of date. Never double-count: relief dated on or before the as-of date is ignored for fairness.
- Prefill option: a one-off read of the frozen Google Roster to propose current values (Admin reviews, then saves), so manual typing is only for corrections.
- Tests: Admin-only edit (SMC 403, teacher hidden), paste preview and mismatch handling, audit per row, fairness ordering uses balances, no double count across the as-of date, CSV round trip.

## Owner decision (5 Nov 2026, afternoon): route C chosen
After v0.9.9l timed out on the Google Assign Relief read (UPSTREAM_TIMEOUT, 6 Nov, about 30 s; Claude advised rollback to j, owner confirmation pending), the owner chose the D1 fresh start ("C") as the way to restore a working allocator, instead of a fresh Google file (B, rejected) or archive-only (A, still allowed as a stopgap).
- Status: authorised; Codex, lane R, TOP PRIORITY (ahead of the Google speed fix, which stays next).
- Step 1 (now): rebase PR #79 onto main (now containing #80 b72fb48 and #78 324062a; release label 1f759a9), retarget its base to `main`, resolve conflicts with the Stapler delink (#78) and the clock/dependency scope (#80), keep the canonical build current, full CI green, exact head for Claude.
- Add the opening-balance prefill from the frozen Google Roster (in the ruling above; #79 as built has entry/paste/export but no prefill).
- Open owner questions (Claude asked 5 Nov): cutover night; whether future-dated absences (on or after the start date, including long leave) are carried from Google automatically.
- Owner answers (5 Nov): future-dated absences are NOT carried; the owner re-enters them on D1. Timing: move fast while the school year ends (term baseline runs to 20 Nov); cutover as soon as #79 is reviewed and merged. Out of scope: any Google-to-D1 copy of absences, assignments or Stapler plans.
