# Record the v1.02 and v1.03 deployments

- Model/owner: Codex. Coordinator: ChatGPT. Documentation reviewer: Muse.
- Status: claimed; documentation only. Updated: 17 November 2026, Asia/Singapore.
- Branch: `codex/v1-release-v102-record`.
- Base: main `d5c8899aeb867448ad7399f9925f46ac11371380`.
- Authority: the owner's "deploy, 195 done" instruction and the existing requirement to record releases. The authorised deployment has already succeeded; this task records evidence and does not gate the live release.
- Exact allowlist: `docs/coordination/tasks/v1-release-v102-record.md`, `docs/coordination/tasks/v1-release-v102.md`, `docs/coordination/tasks/v1-release-v103.md`, `docs/coordination/DEPLOYMENTS.md`.
- Scope: close the existing release task and record reviewed heads, merges, final-main CI, private-backup verification, protected workflow approval/results, live metadata and public smoke/asset checks. Preserve historical records and explicit UAT/recovery limitations.
- Acceptance: exact documentation-only scope, working relative links, whitespace check and source/run/hash consistency. No application, build, workflow, migration, configuration or dependency edit. No additional deployment or live-data action.
- Coordination: main refreshed; the release PR is merged. No other open v1 implementation PR owns these release evidence paths. This claim is published alone before documentation edits.
- Handoff: Muse reviews the documentation PR. The prior v1.02 release is at the base SHA. F5 OPEN; official T1B-01/T1B-02, authenticated runtime UAT and hosted restore Not tested.

## 17 November 2026 scope extension, v1.03 evidence

Same implementer and existing PR196, with no competing release-history PR. Extend the exact scope by the existing v1.03 release task only, and append its verified deployment evidence to the already claimed deployment index. Preserve the complete v1.02 record and all earlier history. Open PR197 owns the UAT ledger, PR199 owns the selective-default policy and PR182 is v0.9; none overlaps these four paths. This claim-only update starts from main `d3bba194f0dc162d38f0899dc4e0b6e5e1351fa2` and precedes dependent documentation edits.

The owner authorised a one-off full deployment for PR198, cleared PR200's label, explicitly approved the eight database exports with "pls export", then approved the protected GitHub deployment in the browser. Final-main Node/LORD44001011285 and product44001015250 are green at that exact source. Fresh private exports and local verification passed, Contacts last. Protected run44005005802 is in progress at that source; a success or live-verification claim must wait for its actual results. Provider upload is false. Do not change source, workflow, configuration, migration, data, permissions or integration activation as part of this evidence task. Future deployment scope remains selective by default. Publish a new exact documentation head for Muse; this record neither requests nor gates another deployment.

## Prior v1.02 documentation verification

The following evidence was recorded at documentation head `338c55ffbe9ea432429b8178cb6631fb43dc8f3f`, before this scope extension.


Claim published alone at `b2faf390ebdf75db721a2ef5bec0b98afc3484e7`; the branch starts from that accepted claim. Refreshed open-PR inventory contains only disjoint v0.9 PR182. This diff changes exactly the three claimed Markdown files; product, test, build, CI, configuration, dependencies and migrations are byte-identical to deployed source. Relative links and `git diff --check` pass. The old deployment entries are preserved verbatim. Application suites were not rerun for this documentation-only record; the actual deployed candidate's full results are linked in the record. Muse reviews the documentation at the PR's exact head. No additional deployment is requested or performed by this PR.
