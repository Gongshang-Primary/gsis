# Review of PR #108 — edge-queue P1 shared protocol and direct-default Deploy

- Reviewer/model: Muse
- Reviewed head: `541bd25fdc7cee1426b0b309f0c78a3f95b2016b`
- Base: `5a4ab02d9d2aee2ae8009cf8c01ebd1ca4747ef4`
- Date (Asia/Singapore): 2026-11-10
- Verdict: **APPROVE**

## What this PR does

Codex's P1 for the edge queue (task `docs/coordination/tasks/edge-queue-google-authority.md`):
a shared command protocol (`shared/edge-command-queue.js`), a new Worker service
(`edge-command-worker/`: schema, store, cache, Deploy adapter, worker, wrangler),
a Google decision ledger (`backend/DeployCommandQueue.gs` plus Deploy-only tagged
hooks in `backend/Code.gs` and `backend/FieldStore.gs`), a Deploy gateway and
client (`public/deploy-command-gateway.js`, `public/deploy-command-client.js`,
plus `_worker.js`, `app.js`, `index.html`), and ten new `tests/edge-queue-*`
programs. Default mode is `direct`; queued is not enabled. No P2/P3, no other
app's product code, no live data or settings, no deployment.

## Evidence

- CI: run 42609888303 at the exact head, all 5 jobs passed (Regression shards
  1–4/4 and full-suite), verified via the check-runs API, not the PR body.
- Local worktree wt108 at the exact head, `TZ=Asia/Singapore NODE_NO_WARNINGS=1`,
  Chromium `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`:
  all 11 changed/new test programs PASS — `edge-queue-app-ui`,
  `edge-queue-client`, `edge-queue-fallback`, `edge-queue-google-ledger`,
  `edge-queue-protocol`, `edge-queue-publication`,
  `edge-queue-retention-switchback`, `edge-queue-service`, `edge-queue-store`,
  `edge-queue-workerd`, `contacts-secret-consolidation-guard`.
- Guard: 52 canonical/deployed sources PASS; the `--prove-edge-queue`
  negative control was reproduced by the reviewer (deliberate legacy read
  rejected, child exit 1, source restored byte-for-byte).
- Canonical build: `TZ=Asia/Singapore npm run build` PASS, 18 components,
  no diff at the head.
- Merge-tree vs origin/main: clean (single tree, no conflicted files).
  GitHub: draft, mergeable MERGEABLE, merge state CLEAN.
- Full local suite not independently re-run by the reviewer (Codex reports
  1052/1052 Node + 40/40 LORD at the head; CI is the gate).

## Design-note gates, verified in code

- Default `direct`, queued not enabled: `deployQueueConfig_` defaults to
  `mode: 'direct'` and rejects any other mode; the `configure` handler
  returns 409 `QUEUE_RECOVERY_PAGE_REQUIRED` for a non-direct mode.
- Recovery page remains the gate: the design note now carries an
  owner-approved P1 boundary clarification (9 November 2026) deferring the
  independent Google-hosted recovery page and browser/token tests to the
  mandatory queued-enablement gate, and the task record carries the same
  owner "yes". P1 proves same-ID fallback through the surviving
  authenticated gateway only; a full Worker outage retains the proposal/ID
  with an explicit unavailable message.
- Ledger before fallback: the legacy direct path (`deployQueueLegacyDirect_`)
  routes through `deployQueueExecute_`, which looks up the Google ledger
  first (exact replay returns the attested decision; mismatch is 409) and
  writes PREPARED before mutation, with APPLIED attached to the native
  field journal (`deployQueueAttachJournal_`). The gateway continues direct
  with the same request ID after an unknown admission error, never a new ID.
- GSIS_SECRET-only transport: the guard covers 52 sources including the new
  transport; the diff adds no legacy transport read (the one `BRIDGE_SECRET`
  match in the diff is the guard's own negative-control code).
- #90 preserved: publish steps report Deploy, Contacts and Layout
  separately; the Contacts step keeps the frozen publication and a fresh-ID
  fenced retry; parent status observes a child without republishing
  (covered by `edge-queue-publication`).
- Shadow evidence: the local workerd/Miniflare test applied 16 unique
  synthetic commands; 8 concurrent exact retries produced one mutation;
  one direct/verified-projection shadow read compared equal with the
  mutation count unchanged at 16. Warm admission p95 was 95.7 ms in the
  reviewer's run (Codex reported 80.65 ms in the full-suite run), well
  under the 1 s target. No real write was dispatched twice.
- Scope: Deploy, the shared queue module/service, the owner-approved
  four-file build extension (`scripts/build-release.py`,
  `scripts/build-edge-deploy.cjs`, regenerated `operations-worker/`
  bundles embedding the gateway), tests and docs only. No Roster,
  Calendar, Contacts, Venues or LORD product file changed;
  `Roster_Backend_v0.9.9.gs` is unchanged in the diff. The release p
  bundle branch is still `21bef88`.
- No secrets, tokens, private links or staff personal data in the diff.

## Findings

None blocking. Two notes, neither a finding:

- The four integration defects found during development (partial-index
  metadata, DOM-fixture receipt cleanup, package-verifier extraction,
  native lock timing/re-entry) are recorded in the task record with their
  causes and fixes, and the final head's CI is green. They are not findings
  against this head.
- Warm admission p95 varies by run (46.72 ms focused, 80.65 ms Codex
  full-suite, 95.7 ms reviewer); all are far under the 1 s target.

## Release notes for the owner

P1 is Deploy-only infrastructure with Google still authoritative and direct
the default. Nothing changes for users until the owner stages it. Staging
order from the task record: Deploy Google backend first, then the Deploy
frontend/gateway; Worker and Apps Script GSIS_SECRET values must match;
keep direct and all existing flags, URLs and bindings. The queue service is
optional and needs its own isolated D1 database, the `DEPLOY_COMMAND_SERVICE`
binding and a retained poller; do not configure queued. The recovery page
is still a mandatory gate before queued can be enabled. Rollback keeps
Google authoritative and direct; preserve pending identities and ledger
evidence, never replay exports or clear uncertainty.
