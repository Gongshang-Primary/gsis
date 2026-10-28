# GSiS v0.4.11 — 29 September 2026

Authorized by “commit to next ver about such incidents happening (stuck when editing contacts list)” at 07:12 Singapore. Baseline: v0.4.10, c154671. This is a source/package release, not a live installation.

- **Q85 — Recover an interrupted Contacts save after reload.** An authenticated Admin can review the original saved changes from the blocked sign-in screen and explicitly complete that request. The backend uses its durable payload, original ID and actor; rechecks current Admin permission; checks payload integrity/current values; holds the writer lock; and preserves the journal. Recovery actor/start time are recorded separately. Partial writes and retries retain the same request. Conflicts and damaged/missing journals remain blocked for review. A different pending save rejected before a new write does not lock the new unsaved draft.
- **Targeted contact writes.** An unrelated edit, including Active Y → N, no longer reformats the stored phone number. Requested phone edits still normalize it. Existing derived-name/role rules remain.
- **Q85 / Deploy error follow-up.** Contacts recovery blocks carry a distinct code through Deploy. Gateway errors distinguish timeout, HTTP failure, invalid response, configuration and interrupted connection. Reference 78316f65 alone does not identify its cause or prove a link to the Contacts incident.
- All three suite labels are v0.4.11; Deploy write protocol is 411. Model geometry and workload rules are unchanged.

## Live incident separately recovered

At the user's request, the existing Danial Woo Active Y → N transaction was completed directly in the backend at 07:12 Singapore: contacts!P132=N and contact_save_journal!E3=Applied in one atomic update. The original journal content was retained and a recovery note added. Readback showed no Pending contact-save entries. No record, session token or Script Property was deleted. This manual recovery is distinct from installing v0.4.11.

The original save's failure cause, successful rerun of preparation and live Deploy error attribution remain unverified. The release supplies a recovery path; it does not claim that network failures can no longer occur.
