# v1-browser-deployment-design: browser-only deployment approval

- Status: design prepared for exact-head review; documentation only.
- Owner/model: Codex; coordinator ChatGPT for v1; independent reviewer Claude.
- Last updated (Asia/Singapore): 14 November 2026.
- Branch: codex/v1-browser-deployment-design
- Base SHA: 02daf9378b3897c3ef6a0a8074147f3a333d5d5f
- User-authorised scope: concrete browser-only alternative to PR139 P1 for Claude review and subsequent owner approval. School machines cannot run Wrangler or terminal tools. Owner requested this proposal; implementation and acceptance of a replacement gate are not authorised.
- Exact two-file allowlist: this task; docs/v1/accelerated-delivery/BROWSER_DEPLOYMENT_APPROVAL_DESIGN.md.
- Out of scope: workflow/application changes, other PR edits or merges, creating a deployment repository, credentials/settings changes, Cloudflare access/provisioning, deployment, migration, provider sends or live data.
- Overlap: refreshed all 14 open PRs and their paginated actual file lists; neither path overlaps. Read main v1 claims; no competing deployment-design task found. PR139 remains the sole product implementation PR. This separately requested design PR does not introduce concurrent implementation. Muse's production responsibilities remain unchanged.
- References: PR139 head 957d5f05489b3329bde43da8331462aaa6afc266; main Claude review/re-review at the base above; accelerated specification f39b671ac6da3f389c58345ce4f5c035f1cb3f65, as cited by the existing product claim.
- Acceptance: evidence-backed design, browser user steps, enforceable credential boundary and bypass analysis, alternatives, exact prospective scope, negative/recovery tests, owner decision and unchanged release gates. Documentation scope/links/whitespace, canonical build and required CI recorded in PR.

## Engineering and review

Pstack Architect, How and Why skills read from cloud package skill://plugins_6a85a87df50c8191bd7f010bb7b17794; source flow and historical P1 rationale inspected. Unslop writing guidance applied. No third-party implementation copied. Q01-Q08 evidence will be recorded in the proposal/PR; Claude reviews the exact head. No approval is inferred from this claim.

## Handoff

Publish the proposed design through one documentation PR. P1 stays open until an alternative is explicitly accepted and implemented with evidence. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested. No merge/deployment authorised or performed.

## Design evidence

Recommendation: private owner-only release repository with explicit browser dispatch, isolated credentials, separate unprivileged build and trusted deployment, immutable candidate binding and blocked recovery after unknown outcomes. Existing main-only rule is verified; required reviewer absent in observed API; secret/branch-protection metadata inaccessible. Owner screenshot confirms secret name only. No policy replacement is treated as accepted.

Q01 scope/claim and overlap checked; Q02-Q05 design and negative scenarios documented; Q06 documentation/build/CI results recorded in PR, hosted tests Not tested; Q07 Claude review pending; Q08 no deployment. Implementation needs a separate scope decision. The claim landed alone at c2697bb28f39b062f7722cdd34590cf532024584; this branch adds only the proposal and task update.

Verification before publication: `TZ=Asia/Singapore npm run build` passed; generated tracked files unchanged. Two-file scope, relative links and `git diff --check` passed. No new application tests for prose. Full Node/LORD regression is delegated to existing exact-head CI, with actual results in the PR; no local full-suite pass claimed.
