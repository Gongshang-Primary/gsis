# PR #119 review (v1 engineering policy, docs only), Claude

Model: Claude. Reviewed 12 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `4e105dceb761d4af9fc48c8bfbf03625547769e7` |
| Base | `d1839d4e5eb7cb2760733b0b5bf6860b005dbde1` (equals current origin/main) |
| Verdict | **Approve** (advisory; owner merges). Low findings only. |

## Evidence I produced

1. Inventory: six files, all documentation, matching the task scope. No code, tests, CI, config or generated output.
2. Root `AGENTS.md`: additive only; zero removed lines.
3. `git diff --check`: clean.
4. All 16 relative links in the five policy files resolve at the head.
5. `git merge-tree` against origin/main: clean. Against `claude/beautiful-dirac-uiflqu`: clean.
6. Content checked against the PR's own six-point checklist: all six hold. The six skill approaches match the owner's list and are not claimed installed. Rust principles carry no migration requirement. R07 records the F1 lesson from PR #118 (scope ordering to the request, not the session).

Not verified by me: CI at this head (GitHub connector unavailable). Not run: `npm run build` (no build input changed).

## Findings (low)

L1. `docs/v1/AGENTS.md` states the owner's ChatGPT appointment and allocation ruling, but their only record is on the unmerged branch `claude/beautiful-dirac-uiflqu`. Step 2 tells agents to read directives on review branches. That works, but it makes branches a second source of truth. Fix: owner merges the directive branch; then main is the one source.

L2. Root `AGENTS.md` still opens "Three models work here … Claude coordinates jobs and lanes". The new v1 section scopes around it but does not correct it. Not blocking; a later coordination edit should say "v0.9.9* coordination" there.

L3. The task record cites `python3 /workspace/work/check-v1-policy.py`, which is not in the repository. Its result cannot be reproduced. Either commit the script or describe its checks as manual.

L4 (advisory, not a defect). About 135 lines of process now gate every v1 task. Each gate needs Pass/Fail/Pending/N.A. evidence. For small v1 tasks this cost may exceed the benefit. Watch the first two tasks under it; trim gates that produce no findings.
