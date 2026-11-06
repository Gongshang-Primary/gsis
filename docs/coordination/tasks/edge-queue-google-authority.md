# edge-queue-google-authority: D1 as intermediary (read cache + queued writes), Google stays the record — Venues, Deploy, Contacts

- Status: changelog/authorised design (owner 6 Nov: "for venues view-port, aim for d1 intermediary for queued requests and let Google be main/fallback i/o. wish for similar system for deploy-viewport and contacts-viewport"). Spec by Claude under the standing rule.
- Reviewer/model: Claude. Builder: **Muse for all phases** (owner 6 Nov: "let muse handle the D1 intermediary over Google stored data"). Codex keeps the small live fix tasks/deploy-contacts-catalogue-sync.md; Muse's Deploy phase builds on it once merged.
- Prior art to reuse, not duplicate: LORD queued writes phase 1 (tasks/lord-queued-writes.md: signed gateway, SQL conditional admission, single dispatch claim, receipts, uncertainty recovery, retention, switch-back) and Calendar's signed short-lived gateway.

## Principle
Google (Apps Script + Sheets/Drive) remains the **system of record** for Venues, Deploy and Contacts. D1 sits in front to make the apps fast and to stop Google lock contention: it serves reads from a verified cache and accepts writes into a durable queue that one dispatcher applies to Google in order. If the D1 path is down, the app falls back to direct Google I/O (today's behaviour).

## One shared module (`shared/edge-command-queue.js` + Worker service), per app configured
1. **Reads**: D1 snapshot of the app's Google state, keyed by Google revision/digest. Served immediately with "as of HH:MM, revision N". Refreshed after every applied write, on a schedule (e.g. every 5 min while used) and on demand. If the snapshot is missing, unverifiable or older than the app's limit, read directly from Google and refresh the cache.
2. **Writes**: signed session → Worker validates identity, role and payload → **atomic admission into D1** with idempotent request ID, expected Google revision and canonical payload digest → immediate receipt "Queued" (≤1 s). Admission limits: per actor and per app pending caps, payload size cap.
3. **Dispatcher**: one claim at a time per app/document scope (FIFO), applies to Google under the existing writer lock, re-checks the expected revision there. Outcomes per receipt: Applied (new revision), Rejected (validation/permission with reason), Conflict (someone changed it first; show both and ask the user to redo), Uncertain (lost response → read-only check against Google before any retry; never double-apply).
4. **UI**: every save shows its receipt state (Queued → Applied / Conflict / Rejected); users keep working; a "Pending changes" badge; refresh shows applied results. Publish-type actions show each downstream step separately (e.g. Deploy publish → Contacts catalogues → Roster references), each with retry.
5. **Fallback**: per-app mode `direct | queued` in admin settings, default `direct` until verified. If the Worker/D1 is unavailable, the client uses direct Google with the **same request ID**, and Google rejects duplicates (idempotency honoured on both paths).
6. **Observability**: System Health per app: queue depth, oldest pending age, last applied, failures, cache age; Admin alert (Admins only, Admin wording) if oldest pending > 10 min or 2 dispatch failures. Ledger of receipts kept (owner rule: keep records; payload retention follows the LORD policy unless the owner says otherwise).
7. **Security/privacy**: same auth and role checks as today, decided at the Worker and re-checked at Google; no secrets or private links in payloads or logs; D1 rows scoped per app.
8. **Switch-back**: pause admission, drain or export pending, verify every applied revision against Google, then set `direct`.

## Phasing
- P1 (Muse): shared module + **Deploy** (saves and publish; fixes Deploy's 60 s save timeouts and the publish→Contacts partial failure together with tasks/deploy-contacts-catalogue-sync.md).
- P2 (Muse): **Venues** on the module (bookings/occupancy writes queued; reads from D1 cache; Roster occupancy already comes from D1 via VENUES_ROSTER_WORKER_URL).
- P3 (Muse): **Contacts** (Edit Info, admin tables, Deploy catalogue application as a queued command).
- Each phase: shadow period with `direct` default, then owner switches to `queued`.

## Tests (each app)
Admission idempotency and caps; ordered dispatch; conflict on changed revision; lost response → uncertain → verified, no double apply; fallback to direct with the same request ID is deduplicated; cache staleness → direct read; switch-back drain; UI receipt states; Admin-only alerts.

## Guardrails for this assignment (Claude)
- One PR at a time; each phase is its own PR series; never start the next phase before the previous is merged.
- Every PR: rebased on current main at review time, canonical build at the final head with regenerated bundles committed (gate: no diff), full CI green, exact head SHA. (Lessons from #74 and #83.)
- Files outside Deploy/Venues/Contacts/shared queue module (Roster lane R, LORD, Calendar) need Claude's OK before editing.
- Order for Muse: (1) Venues D1 route verification (tasks/venues-muse-ownership.md), (2) Stapler teacher search PR, (3) this module: design note PR first (data model, admission, dispatch, receipts, fallback, switch-back; reuse LORD phase 1 code where it fits), then P1 Deploy.
