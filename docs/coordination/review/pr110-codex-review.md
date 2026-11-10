# PR #110 release review

Model: Codex. Date: 10 November 2026, Asia/Singapore.

Source head: `62d24e1101b1ae0754f94e4324355ca56b89a4cc`.
Bundle head: `44fc557d0b0b788e63e21b936148ddca7efe84ac`, branch `deploy/2026-11-10-v0.9.9q`.
Verdict: **changes requested**, one P2 provenance finding. No product payload defect identified in the checks below. Hold merge/deployment until the release history description is corrected and the resulting exact heads are verified.

## P2: the stated complete merge inventory omits the baseline release merge

Locations: `docs/plans/2026-11-10-v0.9.9q.md:11`, its inventory table, `deploy-bundle/DEPLOY_STEPS.md:12` and its table, plus the PR body.

The plan says all merges since p source `0bb7033` are included, there are two PR merges, and none is omitted. Git reports three:

```text
git log --merges --first-parent --oneline 0bb7033..62d24e1
7e78799 Merge pull request #109
03782ca Merge pull request #107
c2c492c Merge pull request #106
```

Full omitted SHA: `c2c492c62133d73b3bcde8f78da0baaf0793996b`. This merged release p itself; its second parent is the named p source `0bb7033a9b2bdd953ddb5434660e2a391d960251`. The two functional updates really are #107 and #109, and this finding does not assert missing runtime code. The defect is the runbook's explicit complete-history claim against its stated range, which the release gate requires to be accurate.

Correction: either list #106 as the baseline release-publication merge, with no new q functional change, or explicitly distinguish deployed-source provenance `0bb7033` from a history range starting after baseline merge `c2c492c`. Make the plan, delivered runbook and PR body consistent. If DEPLOY_STEPS changes, regenerate its SHA256SUMS entry and record the resulting bundle head. If the source plan changes, verify canonical build and CI at the resulting source head. Do not silently change the deployed p source or claim a product omission.

## Checks performed by Codex

- Independently verified source-head CI run `42784720987`: complete, successful at `62d24e1101b1ae0754f94e4324355ca56b89a4cc`, all four regression shards plus `full-suite` green.
- Isolated source and bundle worktrees at the two exact heads. `TZ=Asia/Singapore python3 scripts/build-release.py` passed all 18 components and left no tracked diff. No diff remained after local tests.
- Seven local programs passed, all exit 0, with Singapore timezone and Node warnings disabled: `release099-metadata.cjs`, `package.cjs`, `contacts-secret-consolidation-guard.cjs`, `roster-deploy-secret-consolidation.mjs`, `roster-assign-relief-export-day.mjs`, `roster-assign-relief-export-privacy-import.cjs`, `roster714-export-ui.cjs`. Chromium variables were set to the available local executable for browser checks.
- SHA256SUMS validates all 17 listed files and covers every delivered file except itself. COMMIT.txt matches the source head and LABEL.txt is 0.9.9q.
- Delivered Roster/Deploy backends and notification/operations Worker files match the canonical source-head outputs byte for byte.
- All nine frontend archives are CRC-clean, contain no duplicate member names, and match canonical rebuilt member inventories and member bytes. The release source diff changes only package build label, generated HTML labels and the plan, with no new product logic/test change in the label PR.
- Contacts, Calendar and Venues backends plus the Calendar job Worker are byte-identical to p source; omission is valid. The emergency tool is byte-identical to the p bundle. No conditional Venues backend update is required.
- #108 queue module/service are absent from the release tree, consistent with exclusion. #103 is not merged into this release.
- Merge-tree against fetched main `e590c29` succeeded without conflicts. Rechecked the PR source SHA and remote bundle SHA before recording the verdict.

## Merge and deployment decision

The owner delegated the decision after review. My decision is to hold both for the bounded provenance correction above. I did not merge, mark ready, deploy, change settings, read live data or inspect secret values.

Even after review approval, deployment requires the documented private preflight: paired Roster/Deploy GSIS_SECRET alignment, captured current deployment versions and configuration, preservation of existing bindings/crons/flags/authority, and the ordered Apps Script new-version plus Worker/Pages rollout. This review proves local artifact integrity, not that live configuration or rollback readiness has been verified. Full backups remain explicitly not fixed.

Codex did not rerun all 1,043 Node programs or all 40 LORD programs locally for this release review; the full-suite evidence is independently verified exact-head CI. No live Google/D1/R2/Drive/provider behavior or post-deploy acceptance is claimed. The implementer should return corrected source/bundle heads for final verification. Owner delegation does not waive the release provenance or deployment preflight gates.
