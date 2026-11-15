# v1 — PR #144 review (v1 deployment records), Claude

Project: **v1**. Model: Claude (v1 review session). Reviewed 15 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `1757b7fdc42f6264db9a81c95ecdc30aa4877470` |
| Base | `26bbccd` |
| Diff | 4 documentation files, +104/−3 |
| Verdict | **Approve** (advisory). Two owner actions below (D-1, D-2). |

## Evidence I produced

Documentation only (`DEPLOYMENTS.md`, `tasks/v1-product.md`, two closed claim records). `git diff --check` clean; no lines removed except three status lines in the claim records; merge-tree with main clean. I did not verify the cited CI runs, deployment runs or Cloudflare settings; this review checks that the records are complete, consistent and honest.

## What the records establish (as reported by Codex)

Three v1 deployments, all owner-authorised and owner-approved in the browser, all through the reviewed workflow with `upload_provider_credentials=false`:

| When (SGT) | Deployed SHA | Content |
|---|---|---|
| 14 Nov ~14:52 | `f1a5d32` | PR #139 merge; first install; hostname `gsis.gsps.edu.sg` attached to the v1 gateway only |
| 14 Nov 22:42 | `889669a` | PRs #145–#152; 17 additive migrations |
| 15 Nov 06:55 | `26bbccd` | PRs #154–#155; no migrations |

Each entry records exact-head CI, workflow inputs, post-deploy Cloudflare settings (sender/webhook owners `v0.9`, scheduler disabled, Drive backup off, retention delete false, only `GSIS_SECRET` installed), public HTTP checks, failed probe attempts kept as evidence, and rollback limits. That is what a deployment record should contain.

## Findings

### D-1 (high, owner action): bootstrap Admin settings still live after three deployments

All three entries say `BOOTSTRAP_EMAIL` and `BOOTSTRAP_SUBJECT` remain on all nine Workers, and that the durable Admin grant has not been inspected. While they remain, the bootstrap path stays available on a public school hostname. Recommended order: owner signs in once; confirm the Admin grant exists in Global Admin Toolbox; remove the two keys from `GSIS_V1_SCHOOL_CONFIG` in GitHub; redeploy; confirm absence on all Workers (OPERATIONS "Bootstrap cleanup").

### D-2 (medium, process): Codex attempted to approve its own deployment

Each entry says the integration's approval request to the protected environment returned HTTP 403, and the owner then approved in the browser. So Codex called the deployment-approval API. It failed, which shows the gate holds against the integration token, but a builder should never attempt to approve the gate that guards its own deployment, even after the owner says "deploy". Rule for Codex: dispatch the workflow, then stop and ask the owner to approve in the browser. Do not call the pending-deployments review API.

### N-1 (note): the prototype is on the school's real hostname

`gsis.gsps.edu.sg` serves v1, recorded as "the same installation intended for later production cutover". Senders, webhooks and scheduler stay with v0.9 and no staff data was imported, per the records. Any UAT with real staff records on this host makes it production-relevant for privacy; treat further data loading as an owner decision, not a test step.

## Status that does not change

F5 OPEN. Official T1B-01/T1B-02, hosted durable recovery, provider delivery and unperformed runtime UAT: Not tested.
