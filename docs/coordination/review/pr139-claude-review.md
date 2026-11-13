# PR #139 review (isolated v1 product), Claude

Model: Claude. Reviewed 13 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `98cd5d8093c29af0c3f44919cdb73e47a8b49186` |
| Base | `f5a238527eb5661ffb4c5c889c05baf3cca4287d` (claim) |
| Size | 152 files, 56,699 added lines, 3 commits |
| Verdict | **Approve the code as an isolated, undeployed product** (advisory). **Before merge:** owner configures P1. **Before staging deploy:** owner decides P2. |

## Method and its limit

This is a risk-based review, not a line-by-line one. Nobody can meaningfully read 56,700 lines in one review. I checked authority, the deploy path, secrets, isolation from production, sign-in and sessions, Deploy authorization, Contacts acceptance rules, SQL construction, and I ran the full product suite and build. Most service logic (Calendar, Roster, LORD, Venues, Layout) I did not read in full. Staging acceptance with synthetic data is the real check for that logic.

## Evidence I produced

Separate worktree at the exact head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium:

1. `node scripts/v1/test.mjs`: **43/43 product programs pass**, including browser journeys and webhook integration.
2. `npm run build`: success, no tracked drift.
3. Merge-tree against origin/main: clean.
4. No changes to production sources, generated outputs, root `package.json`, existing workflows, or reviewed `v1/core` and `v1/contacts` contracts.

Not verified by me: full Node/LORD CI run 43382070236 (GitHub connector unavailable), Worker dry-runs, the 330-file package hash match, and the tarballs (local to Codex's environment, not in the repository).

## What is sound

1. Authority: owner instruction "build product fully" recorded in the task; scope limited to new v1 paths.
2. Deploy safety rails in `scripts/v1/deploy.mjs`, `prepare-deployment.mjs` and `verify-resources.mjs`: runs only from the owner-dispatched workflow with an exact confirmation phrase; every Worker, D1 and R2 name must be in the `gsis-v1-` namespace and verified against Cloudflare before deploy; production D1 cannot match. Refuses to take sender, webhook or scheduler ownership.
3. Sends: real WhatsApp, Telegram, email and Drive actions require `SEND_OWNER=v1`, which the deploy step refuses. Initial deployment cannot message staff.
4. Sign-in reuses the reviewed T1A Google verifier. Session cookie `__Host-`, Secure, HttpOnly, SameSite=Lax, 10-day absolute expiry; token stored hashed; CSRF token checked; origin checked on login.
5. Deploy edit/publish goes through T1A `resolveAuthority` with the T1B provider, so Package A's `AUTHORITY_EVIDENCE_MISSING` applies.
6. Contacts acceptance matches the owner's 13 Nov rule ("either role alone"): no Admin approval step; self-acceptance denied by linked Staff ID; unlinked actors cannot accept; owner-review reference required.
7. SQL: values are bound parameters throughout. Interpolated pieces are constants or identifiers validated by `^[a-z][a-z0-9_]*$`.

## Findings

### P1 (high, GitHub setting, before merge): protect the deploy environment

`.github/workflows/v1-deploy.yml` deploys with `environment: gsis-v1-owner-approved` and receives Cloudflare, GSIS, WhatsApp, Telegram, Google and email secrets. Once merged, anyone with write access can dispatch it, and `workflow_dispatch` lets them choose any branch, including one with a modified `deploy.mjs`. If that environment does not exist, GitHub creates it on first use with no protection.

Required in GitHub settings before merging: create environment `gsis-v1-owner-approved`; required reviewer = owner; deployment branches = `main` only; store these secrets as **environment** secrets, not repository secrets.

### P2 (medium, owner choice, before staging): "isolated" v1 would share production secrets

The workflow injects `GSIS_SECRET` and the live WhatsApp, Telegram, Google and email tokens. The task says to use the common `GSIS_SECRET`. That breaks isolation: a fault or leak in an untested v1 Worker exposes the production integration secret. The WhatsApp verify check also falls back to `GSIS_SECRET`.

Recommendation: give v1 its own new `GSIS_SECRET` value in the v1 environment. Leave all provider tokens unset there until cutover; `deploy.mjs` only injects tokens that are present, and sends are blocked anyway.

### P3 (medium, owner awareness): first screen is slow

Codex reports cold first-screen p95 of 7.53 s against a 3 s target, measured with 30 simultaneous cold browsers on a shared host. Staff would notice. Measure again on Cloudflare in staging before judging; if it holds, it blocks go-live, not staging.

### L1 (low): bootstrap Admin

`BOOTSTRAP_SUBJECT` and `BOOTSTRAP_EMAIL` grant the first Admin once. Remove both variables after the first Admin signs in.

### L2 (low): one unpinned action

`actions/upload-artifact@v4` is not pinned to a commit, unlike the others. Pin it.

## Status that does not change

F5 OPEN. Official T1B-01/T1B-02 and all runtime UAT: Not tested. BURROWS external application and installed-aSc acceptance outstanding.

## Next action

Owner: set P1, decide P2, then decide on isolated staging. Codex: pin L2 in a follow-up. No merge or deployment approved by this review.

## Owner decision on P2 (13 Nov 2026)

Owner: v1 gets **its own** `GSIS_SECRET`, set outside the product as an environment secret of `gsis-v1-owner-approved` in GitHub. It must differ from the production value. Confirmed against `scripts/v1/deploy.mjs`: the value is read only from the workflow environment and pushed to every v1 Worker on each deploy, so no code change is needed. A value changed only in Cloudflare would be overwritten by the next deploy; change it in GitHub. The task record's "common GSIS_SECRET" wording is superseded. Provider tokens stay unset in the v1 environment until cutover.
