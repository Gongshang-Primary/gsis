# P1 shared queue and Deploy — current assignment

- Model: Codex. Status: claimed before implementation, 9 November 2026, Asia/Singapore.
- Branch: `codex/edge-queue-p1-deploy`; base: `5a4ab02d9d2aee2ae8009cf8c01ebd1ca4747ef4`. Dependency #107 is owner-merged as `03782ca3` from `2247f729`. Muse coordinates/reviews the exact final head; Claude is unavailable; owner merges/deploys.
- Owner-approved scope: shared command protocol/service, Deploy saves/publish adapter and Google decision ledger under the existing writer lock, receipts/UI, verified cache, same-ID direct fallback through a surviving authenticated gateway, health/switch-back and synthetic behavioral tests. Default remains direct; queued enablement is prohibited in this PR. Preserve #90 frozen publication and separate downstream results/fenced retries. No P2/P3 or other-app product changes, live data/settings/flags/provider calls, deployment, or p bundle changes.
- Owner clarification: the design's P1 gate and full-Worker-outage browser test conflicted with the prompt excluding the independent Google recovery page. Owner answered "yes" on 9 November to amending those requirements: defer the recovery page and browser tests to a mandatory queued-enablement gate. P1 still implements/proves the shared ledger and surviving-gateway fallback with the same operation ID. Full Worker outage retains the pending proposal/ID and explains continuation is unavailable. Do not claim queued readiness.
- Files/domains: Deploy frontend/gateway/backend sources and Deploy-generated outputs; `shared/edge-command-queue.js` and new queue service/schema/adapters; associated tests; this task and the approved design amendment. Inspect shared backend/build propagation before product edits; if another app's source/output or unapproved build files must change, stop and report the concrete bounded dependency first.
- Claim procedure: owner explicitly requires this branch and prohibits main pushes, superseding WORKFLOW's main claim exception. Record this claim only on the feature branch. No existing claim is taken over.
- Acceptance: design's D1/Google ledger, atomic admission/caps/nonce/roles, scope FIFO/fences/uncertainty, publish child receipts, cache verification/high-water invalidation, same-ID fallback, switch-back and private health/alert behavior. Local shadow evidence uses read comparisons and synthetic commands only; never double-dispatch a real write. Canonical build then full local Node/LORD suite with Singapore timezone, final-head no-diff build, all 5 CI jobs green before draft PR, Muse named at exact head. No test/review/deployment is yet claimed.

---

# Edge-queue design note: current assignment

- Model: Codex. Status: design note merged (#105 at 7c3b839 as ff44f9c, 8 Nov 20:58 SGT). Next: secret consolidation — Roster/Deploy, then edge-queue P1 (Deploy).
- Updated: 8 November 2026, Asia/Singapore.
- Branch: `codex/edge-queue-design-note`.
- Base: `0c897a4047bf4b1d7e3f8a85edaac34236dc3a55`, freshly fetched main. Calendar #104 is owner-merged as `d360069` from `fb0ee22`.
- Owner instruction on 8 November supersedes the historical Muse-builder/Claude-reviewer assignment below for this docs-only item. Codex writes the note; Muse coordinates and reviews the exact head. Claude is unavailable. Owner merges and deploys.
- Files in scope: this task record and new `docs/coordination/plans/edge-queue-design-note.md` only. No product code, shared module, Worker, Deploy implementation, live settings/data/provider calls, or deployment.
- Implementation record before note creation: inspect LORD phase-1 task, actual job Worker/schema and backend dispatch; inspect the existing Deploy publication/Contacts sync, Venues revision/receipt and Contacts mutation boundaries. Decide all three app adapters, atomic admission/ordering, receipts, cache freshness, fallback/deduplication, reconciliation, security and phased gates in the note. Proposed handlers and schemas must be distinguished from current source behavior.
- Verification gates: inspect the two-file diff and relative links; run `TZ=Asia/Singapore npm run build` at the final head with no diff; require all five full-CI jobs green at that exact published head before opening the draft PR. PR body names Muse and states exact head, files, results and omissions. Every commit and PR description carries `Model: Codex`.
- Next work stays blocked until this note is reviewed and owner-merged: secret consolidation for Roster/Deploy, then separate P1 shared queue + Deploy with `direct` default. P2 Venues and P3 Contacts each follow the prior phase's merge. Venues route suspension/#67 and the live Contacts 401 configuration alignment remain separate.

## Design-note implementation record — 8 November 2026, Model: Codex

- Added [the design note](../plans/edge-queue-design-note.md). It decides data/receipt schemas, atomic admission, per-app caps, document-wide FIFO dispatch, Google revision/ledger recovery, user receipt states and separate publish steps, verified read caches, authenticated direct fallback, switch-back, Admin health/alerts, privacy and phase gates.
- The note separates current implementation evidence from future handlers. LORD's backend handler does exist: `doPost` lowercases `queueCommand` to `queuecommand` and dispatches `lordQueueCommand_` (base lines 531 and 7485). D1 admission is in the job Worker. A case-sensitive search missed the backend dispatch. The edge service follows that admission/execute separation; a new scope gate is required because LORD's per-job lease alone is not a whole-document FIFO guarantee.
- Direct fallback requires shared durable Google operation identities and an independently reachable authenticated recovery route. It is not enabled by a missing D1 receipt or a second path on a failed Worker. Per-app implementation must prove this before queued mode can be enabled. Pending work remains uncertain until evidence or an exact cancellation fence resolves it.
- P1 preserves #90's frozen publication/Contacts and Layout outcomes. P3 makes catalogue application a Contacts child command without replaying the parent publish. New handlers are GSIS_SECRET-only. No shared module, app implementation, Roster authority change, route activation, live configuration/data/provider access or deployment occurred.
- Local documentation verification: all 9 relative links in the plan resolved before this task link was added, and the changed/untracked path union matched exactly the two authorized Markdown files. `git diff --check` passed. The build and full CI must now run at the exact final head; their results belong in the PR handoff, not an inferred runtime test claim.
- Not tested by this docs work: future queue performance/one-second receipt, new schema or adapters, fallback UI/token flow, cache/reconciliation races, owner staging, or live Google/D1/provider behavior. The note specifies those as future phase acceptance gates. No Muse review or approval is claimed.

---

## Historical task specification (6 November; assignment superseded above)

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

## P1 build-isolation dependency — 9 November 2026, Model: Codex

- Claim committed as `63663b5` on the assigned branch before implementation edits. Applied only the owner-approved design clarification: P1's surviving-gateway fallback stays required; the independent Google-hosted recovery page/browser tests move to the mandatory queued-enablement gate. No product changes have started.
- Static dependency evidence: `scripts/build-release.py` builds both Deploy and Roster backends from `backend/Code.gs`. `scripts/build-edge-deploy.cjs` extracts the shared Deploy domain from that same source; `scripts/build-edge-modules.cjs` copies the result into Roster. `operations-worker/index.js` imports Deploy's gateway, so regenerating its bundle necessarily carries the gateway integration. Adding the P1 ledger/entry/journal hooks without build isolation would propagate queue code into prohibited other-app artifacts.
- Required bounded scope extension: `scripts/build-release.py` and `scripts/build-edge-deploy.cjs` only for canonical Deploy queue-module injection and removal of explicitly marked Deploy queue blocks from Roster/legacy D1 domain generation; `operations-worker/dashboard-worker.mjs` and `operations-worker/dashboard-worker.txt` only as regenerated outputs embedding the in-scope Deploy gateway. No operations-worker canonical changes, no Roster source/output changes, and no changes to other app products, bindings or live settings are requested.
- Proposed build patch: `/workspace/edge-queue-p1-build-isolation.patch`, 42 lines, prepared without editing the two scripts. Python AST and JavaScript syntax checks passed. Applying the proposed stripping functions to the actual canonical backend with synthetic module/entry hooks restores its exact original bytes; unchanged input remains byte-identical. These are generator-proposal checks, not queue behavior or generated-product parity claims.
- The approved design clarification and claim are the only repository changes. Canonical build for this documentation checkpoint passed all 18 components with no generated diff. Full local queue tests, shadow evidence, exact implementation-head build/full suite, all-five-job CI and PR remain pending. No deployment, live reads/writes, settings, queued enablement or review is claimed.
- Status: blocked before product edits, awaiting the owner/coordinator's explicit approval for precisely those four additional files, as required by the prompt. If approved, apply the bounded build extension while implementing canonical Deploy hooks and prove all Roster/other-app product outputs remain byte-identical. Continue all P1 acceptance work on this same branch; P2/P3 remain out of scope.
