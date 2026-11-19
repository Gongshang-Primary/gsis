# v1-cursor-team-kit-policy

- Status: review pending
- Owner/model: Codex
- Reviewer/model: Muse at the exact PR head
- Last updated (Asia/Singapore): 19 November 2026, 07:22
- Branch: `codex/v1-cursor-team-kit-policy`
- Pre-claim main: `184b8d0a52fe215c7d122a247e89e9b0289a44a8`
- Base: `c0e2e7843dea229d3200c895b5ae4db9eb99426c`
- Current head: the PR head
- User-authorised scope: integrate the owner-linked Cursor Team Kit into the existing v1 skill policy. Thermonuclear review execution is paused.
- Exact files: `docs/v1/skills/SKILL_POLICY.md` and this task record.
- Out of scope: installation, vendoring, skill runs, application code, workflow changes, release authority, merge and deployment.
- Acceptance: pin and verify the upstream source, identify the relevant Cursor skills, preserve GSiS review and release authority, and verify that only the two documentation paths changed.

## Decisions and changes

Checked main and the open PR file inventory. No open PR changes the skill policy. The historical policy claim was merged in #119. Keep skill selection in the existing policy and evidence in this task or its PR.

The policy links Cursor Team Kit v1.2.0 at `35a90942a7f02e1ebbc2443643179815f2147954`. Its Thermo-Nuclear rubric supports the structural review pass. GSiS still requires the separate correctness and security passes. The kit's verification, smoke-test and CI-monitoring methods may be selected within the existing claim and coordination rules. The policy references the upstream kit. The owner's pause on executing Thermonuclear remains in effect for this task.

## Verification

Read the pinned GitHub Contents API responses for the manifest, licence and all four referenced skill files. Confirmed version 1.2.0, MIT licence and the exact skill names. Used the installed Pstack Unslop skill to edit the prose. Read Cursor documentation as source evidence only.

Local policy checks passed for all three relative links, the unchanged selection rows and availability/licence safeguards, and the exact documentation scope. `git diff --check` passed. `TZ=Asia/Singapore npm run build` passed for all 18 components with no tracked generated changes. Exact-head CI will be recorded in the PR. Local application and browser tests were outside the documentation verification.

## Review and deployment

Independent review pending at the exact PR head. Runtime UAT remains untested. Rollback reverts the policy prose without affecting application state.
