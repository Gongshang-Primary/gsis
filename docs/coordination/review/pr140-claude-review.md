# PR #140 review (v1 browser deployment approval design, docs only), Claude

Model: Claude. Reviewed 14 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `da427a52c870f81a0323c0897499d2502a3bb82c` |
| Base | `c2697bb28f39b062f7722cdd34590cf532024584` |
| Verdict | **Approve as a sound design** (advisory). **But I recommend the owner not build it yet**: see S1. |

## Evidence I produced

1. Two documentation files only, matching the task. `git diff --check` clean; relative links resolve; merge-tree against origin/main clean.
2. Read the design in full against my PR #139 findings P1 and R1.

Not verified by me: CI at this head (Codex reports green); GitHub environment and branch-policy API results quoted in the design.

## What the design gets right

1. It names the real problem: P1 exists because anyone who can edit the workflow can run it with the secrets. A check inside the same editable workflow cannot fix that. Correct.
2. It is honest about the trust model: one owner approves and deploys; this is not two-person control, and anyone holding the owner's account defeats it.
3. The real boundary is repository access, and it says so: a GitHub App installed on all repositories, or a broad token held by an agent, breaks the separation. Setup must prove this, not assume it.
4. Credentials never meet product code: product builds in a credential-free job; the privileged job treats the build output as data, checks hashes and limits, and generates its own Wrangler configuration. This closes the "malicious build script reads the secret" path.
5. Approval binds exact digests (source, controller, config, artifact, migrations), expires in 24 hours, is single-use, and changes invalidate it.
6. Partial deployment and unknown outcomes are handled honestly: no all-or-nothing claim, an unfinished operation blocks the next, reconciliation is read-only, no blind retry or rollback.
7. Provider secrets removed from every deploy path (closes R1 once implemented).

## Findings

### S1 (strategic, owner decision): this is production-grade machinery for a staging deployment

The controller is 11 files, a candidate/digest contract, a GitHub Deployments ledger, a reconciliation workflow and 14 acceptance tests, plus manual browser installation of every controller change. That is right for **production cutover**, where a rogue deploy could reach real staff data and real messages. For **isolated staging with synthetic data and no provider tokens**, most of the risk P1 guarded against is gone if the credential itself is narrow.

The design already requires the key control: a **separate Cloudflare account for v1 staging** if existing tokens reach it. With that account, a staging-only token, a new v1 `GSIS_SECRET` and no provider secrets, the worst a misused source-repository deploy can do is damage an empty staging environment that can be rebuilt.

Recommendation, two stages:
1. **Staging now:** separate Cloudflare staging account; staging-only token in the existing `gsis-v1-owner-approved` environment (main-only, already set); provider lines removed from `v1-deploy.yml` (R1). Owner accepts in writing that a repository writer could trigger a staging deploy. Close P1 **for staging only** on that basis.
2. **Before any production deployment:** build this controller (or buy GitHub Team/Enterprise required reviewers, the design's own alternative). Production stays blocked until one exists and passes B01 to B14.

This gives the owner a staging site sooner, keeps production protected, and spends the controller effort when it protects something real.

### M1 (medium, if built): owner cannot verify the installed controller in a browser as written

The design requires the owner to "verify the reviewed tree digest" after pasting files through GitHub's web editor, but gives no browser method. A web-editor paste can silently change whitespace or line endings. Add a credential-free `verify` workflow in the controller that prints its own commit tree hash and file hashes, and record the expected values in the Claude review of the implementation. The owner then compares two strings on one page.

### L1 (low, if built): maintenance load

The source-read token expires and needs renewal; every controller change needs a manual browser install and re-verification. State the expected renewal interval and who reminds the owner.

## Next action

Owner chooses: (a) the two-stage path in S1, or (b) build the controller now before any staging. No implementation, setting change, merge or deployment is approved by this review.
