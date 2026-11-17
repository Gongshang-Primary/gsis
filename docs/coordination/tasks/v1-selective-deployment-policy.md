# Record v1 selective deployment default

- Model/owner: Codex. Reviewer: Muse. Status: claimed; documentation only.
- Updated: 17 November 2026, 09:16 SGT.
- Branch: `codex/v1-selective-deployment-policy`.
- Base: main `53f7e9850f0d1a20a0a37df4942c0aaed9e8b143`.
- Owner's exact standing instruction: “standing instructions for v1 deployment in future: unless explicitly instructed for full deployment, perform selective deployment”. This instruction applies immediately; publication records it rather than creating new authority.
- Exact allowlist: this task and `docs/coordination/OWNER_DIRECTIVES.md`.
- Scope: append one owner directive defining selective deployment as the v1 default and full deployment as requiring explicit owner instruction. Preserve all prior directives.
- Out of scope: workflow or script implementation, application code, dependency/configuration changes, migration, live data, merge or deployment. This does not authorise any rollout or a workaround around the protected GitHub gate.
- Acceptance: exact two-Markdown-file scope, original directives preserved, whitespace clean, truthful current capability statement. Existing workflow has no selective mode and still deploys all nine Workers. Do not run it as a selective deployment or silently fall back to full deployment. Built/shared dependencies must inform the selected component set; cosmetic global labels must not silently cause an unapproved full rollout.
- Coordination: main, remote head and open PRs refreshed before this claim. PR197 owns its UAT documents, PR196 owns release records, and PR182 is v0.9. None owns these two files. Documentation claim published alone before the directive edit.
- Handoff: implement and independently review a browser-triggered selective workflow as separate work before attempting a default v1 rollout. Independent review of this record remains pending. No application tests are needed for this policy-only change; no test or deployment result is claimed. F5 OPEN; unperformed runtime UAT Not tested.
