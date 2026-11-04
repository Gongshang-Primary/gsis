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
