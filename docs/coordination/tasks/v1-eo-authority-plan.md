# v1-eo-authority-plan: explicit EO evidence and T1D readiness

- Status: claimed; documentation only
- Owner/model: Codex; coordinator ChatGPT; independent reviewer Claude
- Updated: 13 November 2026 (Asia/Singapore)
- Branch: codex/v1-eo-authority-plan
- Base: b85304c3c8f048f464abf84ee66cc79c4c3d2d36
- Scope: owner-requested plan for explicit EO classification, completeness gate and missing-evidence denial; historical role/appointment research.
- Exact files: this task record; docs/v1/contacts/EO_AUTHORITY_READINESS_PLAN.md.
- Excluded: application/tests/configuration changes, implementation, migration, live data, deployment, merge; no production allocation or coordination changes.
- Acceptance: source-pinned findings, owner questions, proposed design and tests, documentation scope/link/whitespace checks; Claude reviews exact head.

## Evidence and overlap

Main refreshed; open PRs inspected. No open PR owns these two new documentation paths. Production PRs #127 and #126 and older production claims remain untouched. This bounded v1 documentation task does not take over those jobs. T1B is merged at 16eb139; main records closure. Reviewed Claude's updated PR125 record on claude/beautiful-dirac-uiflqu at 9e32f0127eeac3a6d2874fe982e3bc06a66de85c; main has an older review. User's latest EO clarification controls this proposal.

## Verification / handoff

Pending plan publication and exact-head documentation checks. Owner answers and Claude review pending. No skill package executed; applied repository ownership, explicit-error and recovery principles manually. No runtime tests or deployments performed. Official T1B-01 and T1B-02 remain Not tested; F5 open.

## Plan handoff

Status: review; owner answers pending. Claim accepted on main at `61c628f`; plan branch starts there. Owner confirmed Contacts Power User acceptance; requested a known-tag worksheet before answering exceptions. Plan includes source-derived labels, distinction from live assignments and remaining questions. PR/exact review head are recorded in GitHub (avoids a self-referential hash). Reviewer: Claude; no review yet.

Q01–Q05: Pass for documentation scope/design inspection: two-path allowlist, ownership and privacy boundaries, no runtime concurrency claim, no new dependencies. Q06: documentation checks pass; build, Node/LORD regressions and runtime tests not run locally (no build input changed); required exact-head CI remains pending. Q07: pending Claude review and owner answers. Q08: deployment not applicable; UAT Not tested. F5 remains open. Rollback removes documentation only.

Reproducible documentation checks, run using TZ=Asia/Singapore; repeat at the PR head:

```bash
TZ=Asia/Singapore python3 - <<'PY'
from pathlib import Path
import re, subprocess
base='b85304c3c8f048f464abf84ee66cc79c4c3d2d36'
files=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines()
assert set(files)=={'docs/coordination/tasks/v1-eo-authority-plan.md','docs/v1/contacts/EO_AUTHORITY_READINESS_PLAN.md'}, files
for f in files:
    for target in re.findall(r'\]\(([^)]+)\)',Path(f).read_text()):
        if '://' not in target and not target.startswith('#'):
            assert (Path(f).parent/target.split('#')[0]).exists(), (f,target)
print('PASS: exact documentation scope and relative links')
PY
TZ=Asia/Singapore git diff --check b85304c3c8f048f464abf84ee66cc79c4c3d2d36 HEAD
```

Initial checks at `fc4aefc`: exact two-document scope, three relative links and whitespace passed. The same checks must pass at final head after this task-record update; results go in the PR. No application, test, CI, configuration or generated files changed. Live classification, acceptance, readiness scanning, missing-evidence error changes and durable storage remain unimplemented. Next: owner answers worksheet/presentation/source questions; Claude reviews exact plan head; coordinator scopes future implementation separately.

## Owner clarification follow-up (13 November 2026 SGT)

Owner answered the worksheet: listed teaching modifiers, subjects and appointments are EO; 4/5 and Full-time are arrangements, with no requirement to track Non-EO arrangements for this purpose. MKEs are Education Officers in MOE Kindergarten, excluded from the primary-school EO tag; owner explicitly states MKEs will never be SMC. Listed support/professional categories are Non-EO. Updated the plan with the exact list, explicit employment/section/tag distinction and future negative/readiness tests. Revised the presentation recommendation so it cannot mislabel MKE as Non-EO. Individual verification source and presentation confirmation remain pending; no implementation authorised. Claude must review the updated head; prior-head evidence/approval cannot stand in for that review.
