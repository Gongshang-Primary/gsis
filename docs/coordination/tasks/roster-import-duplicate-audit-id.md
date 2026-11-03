# roster-import-duplicate-audit-id: retained audit identity investigation

Model: Codex. Lane R, read-only investigation.

## Claim

Status: investigating. Owner/model: Codex. Reviewer/model: Claude. Updated: 4 November 2026, Asia/Singapore.

Branch: `codex/roster-import-duplicate-audit-id`. Base: main `a38b17464d4cb8d75183569d9c7cc5219fb7da88`, tree `8eaaa41c09eedd93f9c4eb8662849bc56949c27a`. The local base materializes that exact tree; publication uses the actual main commit as parent.

The owner requested a separate read-only task after Claude's review of #69 at `2c0c17c`. Only this task file is owned. No overlap with #69's implementation files. The task claim is published on this separate branch; the default branch remains for the owner's merge.

Scope: identify both retained audit rows using dates, kinds, IDs and timestamps only; trace the writer and retry/export paths; compare three repair rules for owner approval; propose a guard against new collisions. No staff names, actor identities, comments or record payloads enter the report.

Out of scope: product changes, scripts, live Google/Drive/D1 writes, data repair, import execution, freeze, restart, deployment and authority changes.

Acceptance: verify the retained source digest, identify both rows without private content, reproduce the cause with synthetic data, cite the code and assess #61, explain parity/history effects, record a recommendation and guard, and post the findings to Claude.

## Findings

Investigation in progress. No repair rule is approved or applied.

## Verification

Pending the bounded read-only investigation. No live acceptance or successful import is claimed.

## Review and deployment

Claude reviews the final published head. This task changes documentation only. Nothing is deployed.
