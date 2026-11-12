# v1-queue-designs — Packages B–D and results index

- Status: claimed; design/documentation only, owner-authorised 13 November 2026 SGT.
- Model/owner: Codex; coordinator ChatGPT v1; independent exact-head reviewer Claude.
- Branch: codex/v1-queue-designs
- Base: f7014a1 (main after Package A claim); source implementation baseline e996dfdb3a69bee76355ba60500468679d0963de.
- Pinned source: docs/v1/CODEX_WORK_QUEUE_2026-11-13.md at 110bf5838b4a9c95735d503f42587dd0d1f34a40, unmerged PR132. Owner's explicit later authorisation supersedes historical planning-only publication restrictions; B–D implementation remains prohibited.
- Exact documentation scope: docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md; docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md; docs/v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md; docs/v1/CODEX_QUEUE_2026-11-13_RESULTS.md; this workflow-required task record.
- Actual open-PR changed files inspected with Package A: no intersections with these paths. Package A has a disjoint eight-path allowlist; owner explicitly permits this documentation PR alongside its sole implementation PR. No existing production claim is taken over.
- Acceptance: evidence-backed B transaction/audit design, C pagination/reactivation design, D recoverability alternatives and exact future scopes; concrete positive/negative/restart tests; source and result index with commit references; scope/link/whitespace checks; Claude exact-head review.
- Excluded: application/test/configuration changes, acceptance writes, schema execution, stores, live-data access, migration, infrastructure, merge, deployment. No claim of cross-D1 atomicity.

## Handoff status

Designs and verification pending. F5 OPEN; official T1B-01/T1B-02 and runtime UAT Not tested. Future durable storage and retention decisions need separately approved scope; no invented existing authoritative Contacts store. Skill packages not executed; repository ownership/recovery/simplicity principles applied manually. Rollback removes documentation only.

## Published design content and checks

B–D design content committed at `d6a9747bce6e0d2d475193f2c1b8de82ae24593a`; results index links exact A implementation head `0213160a7d45810849d5ed859818d09c55bdb4e2` and those design sources. No A code is included in this branch. Three designs specify versioned interfaces, ownership, concrete interleavings, proposed future allowlists and genuine retention/cutover gates. No new school policy is invented. Q01–Q05 pass for bounded documentation evidence; Q06 scope/link/whitespace checks pass, documentation CI pending; Q07 Claude review pending; Q08 deployment not applicable. Future-design tests and runtime UAT Not tested, F5 OPEN.

Reproducible checks at the documentation head (TZ=Asia/Singapore):

```bash
TZ=Asia/Singapore python3 - <<'PY'
from pathlib import Path
import re, subprocess
base='f7014a1'
expected={'docs/coordination/tasks/v1-queue-designs.md','docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md','docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md','docs/v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md','docs/v1/CODEX_QUEUE_2026-11-13_RESULTS.md'}
files=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines()
assert set(files)==expected, files
for f in files:
    for target in re.findall(r'\]\(([^)]+)\)',Path(f).read_text()):
        if '://' not in target and not target.startswith('#'):
            assert (Path(f).parent/target.split('#')[0]).exists(), (f,target)
print('PASS five-document scope and relative links')
PY
TZ=Asia/Singapore git diff --check f7014a1 HEAD
```

Full build/regression checks are run for A, not claimed as local B–D implementation tests. No build input changed in this design branch. Final PR/head and exact-head CI results are GitHub handoff evidence; each new head requires Claude review. Reverting these five documents has no runtime/data effect. No merge authorised.

Package A exact-head CI run 43313064264 completed successfully: all four shards and full-suite green at `0213160a7d45810849d5ed859818d09c55bdb4e2`. Results index updated. This does not establish B–D durable behaviour; documentation exact-head CI and Claude review remain separate. Publication PR134; final documentation head is available in that PR.
