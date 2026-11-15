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

## Re-review at `957d5f05489b3329bde43da8331462aaa6afc266` (13 Nov 2026)

**Verdict: approve** (advisory). The approval at `98cd5d8` carries forward only because nothing here touches application code. The pre-merge gate P1 is still open.

Changes since 98cd5d8: two commits, five files. No application, schema, dependency, production or T1A/T1B change.

1. L2 resolved: `actions/upload-artifact` pinned to `ea165f8d65b6e75b540449e92b4886f43607fa02`. Verified against upstream: that commit is tag `v4` and `v4.6.2`. Workflow YAML parses.
2. L1 resolved in the runbook: after the first Admin sign-in, remove the bootstrap keys from the GitHub config, rebuild, confirm no `BOOTSTRAP_*` vars in any generated or deployed Worker, and keep the bootstrap receipt and Admin grants.
3. P2 decision applied accurately in OPERATIONS, RELEASE and the task record: a new v1-only `GSIS_SECRET` as an environment secret; provider credentials unset until cutover; change it in GitHub, not Cloudflare. The old "common GSIS_SECRET" wording is replaced.
4. P1 documented as an unmet pre-merge gate. Codex's authorised attempt to create the environment returned HTTP 403 ("Resource not accessible by integration"); nothing was created and no secret was generated. Recorded honestly.
5. `git diff --check` clean; merge-tree against origin/main clean.

Not rerun by me: product suite and full CI (no code changed since my 43/43 run at 98cd5d8; Codex reports both green at this head).

### R1 (medium, recommend before staging): inherited repository secrets

The docs rightly note that repository-level secrets with the same names would still reach the deploy job even when the environment leaves them unset; Codex could not check (HTTP 403). Two ways to close this:
1. Owner checks GitHub Settings → Secrets and variables → Actions → Repository secrets for `WHATSAPP_*`, `TELEGRAM_*`, `GOOGLE_SERVICE_ACCOUNT`, `EMAIL_API_TOKEN` and `GSIS_SECRET`. If none exist, nothing to do.
2. Stronger: Codex removes the seven provider `secrets.*` lines from `v1-deploy.yml` until cutover. Then no setting can leak them. Recommended.

## Remaining gates (owner)

1. P1, before merge: create `gsis-v1-owner-approved` in GitHub's web settings, with the owner as required reviewer and deployment from `main` only. The integration cannot do this; the owner must.
2. P2 configuration: add the new v1 `GSIS_SECRET` to that environment.
3. R1: check the repository secrets, or have Codex remove the provider lines.
4. Staging: a separate owner decision.

## Re-review at `686af2fc803d9d035020d364705dbfae0b3be32f` (14 Nov 2026)

**Verdict: approve** (advisory). Application code unchanged since my 43/43 run at 98cd5d8. **Before merge: G1 and G2 below** (GitHub settings, owner only).

Changes since 957d5f0: three commits, four files.

1. **R1 resolved.** `v1-deploy.yml` now references exactly two secrets, `CLOUDFLARE_API_TOKEN` and `GSIS_SECRET`; all seven provider references are gone, so same-named repository secrets cannot reach the job. YAML parses.
2. **Outfit font licence added** at `contacts-update/public/signature-assets/OFL.txt`. SHA-256 `c676351b…a2e416` matches the pinned upstream Google Fonts file byte for byte. This sits in a production frontend path outside the v1 lane; it is licence text only, adds a missing attribution for fonts already shipped, and I accept it. Note: `git diff --check` flags one trailing space in that file. It is upstream's verbatim text and must stay, but the task record's "`git diff --check`: passed" is inaccurate.
3. **Empty stores provisioned** (owner said "create"): eight D1 databases and eight private R2 buckets named `gsis-v1-gsps-*` in Cloudflare account `803fa957…`, zero tables, public access off. Recorded only; I did not verify in Cloudflare.
4. OPERATIONS step 4 updated to match R1. Merge-tree against origin/main clean.

Not rerun by me: product suite and full CI (owner reports all CI green at this head).

### New facts that change P1

The task record states the repository is **public**, and that environment `gsis-v1-owner-approved` now has required reviewers `helper-gsps` and `songwee`, self-review allowed, branch `main` only, with administrator bypass still allowed. On public repositories GitHub enforces required reviewers, so the browser-controller design in PR #140 is no longer needed for P1. P1 closes when G1 and G2 are done.

### G1 (high, before merge): remove `helper-gsps` as a deployment reviewer

All models act as `helper-gsps`. If that account can approve the deployment job, a model holding a token for it could approve its own deploy, and the gate means nothing. Keep only the owner's personal account (`songwee`) as required reviewer. Self-review may stay allowed for that account.

### G2 (high, before merge): turn off administrator bypass

"Allow administrators to bypass configured protection rules" must be off for `gsis-v1-owner-approved`. Otherwise any admin-level identity skips the reviewer.

### G3 (medium, owner awareness): staging shares the production Cloudflare account

The stores were created in the connected account. Cloudflare API tokens cannot be limited to chosen D1 databases or Workers; Workers and D1 permissions cover the whole account. So the v1 `CLOUDFLARE_API_TOKEN` can technically reach production `gsis-jobs` and production Workers. The deploy script refuses non-`gsis-v1-` names and checks real identities, which stops mistakes, but a modified workflow would not be stopped by the token. G1 and G2 are therefore the real protection. A separate Cloudflare account for staging (my PR #140 S1) would remove this exposure; owner's choice.

### Public repository note

Being public, every record here is world-readable, including Cloudflare account and D1 IDs, Drive folder IDs in `HANDOVER_REVIEWER.md`, and staff role structure. These are identifiers, not credentials, and the owner accepted the publication audit categories as harmless. Keep secrets, staff personal data and tokens out of all commits, as now.

## Owner decisions on G1 and G2 (14 Nov 2026)

- G2 closed: owner reports administrator bypass is **off** for `gsis-v1-owner-approved` (owner statement; not verified by me).
- G1 closed by owner decision: owner keeps `helper-gsps` as a required reviewer with self-review allowed ("wish to allow helper-gsps self review"). Residual risk accepted by the owner and recorded once: models act through the `helper-gsps` identity, so if a model holds a user-level token for it, it could approve its own deployment. Current evidence suggests the models use app integration tokens (Codex's environment write returned "Resource not accessible by integration"), which normally cannot approve deployments, but this was not tested.
- With these settings, P1 is closed for the owner's purposes: required reviewer, `main` only, no administrator bypass, two secrets only.
- PR #140 (browser deployment controller design) closed by the owner as no longer needed.
