# v1-asc-skills: publish consolidated aSc reference

Status: review preparation
Model: Codex
Coordinator: ChatGPT v1
Reviewer: Claude, exact-head review pending
Updated: 13 November 2026, Asia/Singapore
Branch: codex/v1-asc-skills
Base SHA: f5a238527eb5661ffb4c5c889c05baf3cca4287d

## Owner authority and scope

Owner request: "push asc-skill into v1 files on git".
Publish the already prepared asc-skills.md under docs/v1/skills/asc-skills.md.
Owned paths: that reference and this task record only.
No application, tests, configuration, generated files, other task branches, merge or deployment changes.
Active v1-product claim and PR137/136 scopes were checked; these two new paths do not overlap.

## Acceptance and handoff

Preserve the prepared document exactly. Verify GitHub readback against the local text.
The reference preserves historical source claims and clearly separates current implementation, community examples and unverified aSc import acceptance.
Existing project-specific skill text is already tracked in docs/asc-skill.md; the new gist material is a concise attributed digest, not vendored third-party code.
Content/link/scope checks apply. Builds, full suites, CI, independent review and installed-aSc UAT are not claimed.
Q01-Q05: documentation evidence recorded; Q06: content verification pending, runtime checks not run; Q07: review pending; Q08: deployment not applicable.
No additional engineering skill package needed for copying approved prose.
Main claim update was rejected by automatic approval review as a default-branch mutation. Claim was published on the dedicated branch before the reference. Main remains unchanged.
Local document read successfully; content comparison against prepared reference differs only by final newline. The reference has only absolute public-source links, so there are no relative links to resolve. No product files changed.
Next: Claude reviews the PR exact head. Owner decides merge. Build/full suites and exact-head CI remain pending, not passed.
