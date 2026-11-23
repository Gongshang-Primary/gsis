# Re-review of PR #277 — Roster WhatsApp: URL button support; peer-change private link (W4)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #277, "Model: Claude / v1 Roster WhatsApp: URL button support; peer-change private link (W4)". Branch `claude/v1-whatsapp-buttons`. Head reviewed: `047a7984`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 047a798.** No findings.
- **This is a fresh re-review at a moved head.** The earlier approval (record a014b5d3) was at 4576abd and does not carry across. The head moved because #276 merged (5bbb9af) and this branch merged main into it — commit 047a7984, "Merge main (#274, #276) into #277; keep both regression blocks". This record reviews 047a7984 only.

## What changed since the first review

Only the conflict resolution. The PR's own change against current main (5bbb9af) is identical in scope to the first review: the same 4 files, 111 insertions, 19 deletions — task record, `tests/v1-product-roster-adhoc-delivery.mjs`, `v1/services/roster/service.mjs`, `v1/services/roster/templates.mjs` (new). The merged tree keeps both features:

- `v1/services/roster/service.mjs` contains #276's `queueContactReview` (definition and call) and #277's `linkToken` handling and `templateFor` import/call.
- `v1/services/core/service.mjs` (from #276) still exposes `/internal/contacts-power-users`.
- `tests/v1-product-roster-adhoc-delivery.mjs` contains both the #276 `contact_review` block and the #277 `button` block.
- `tests/v1-product-roster-contact-review.mjs` (from #276) is present.
- The #277 behaviour is unchanged: per-template `button: "token"` adds a URL button component carrying the private token; `button: "static"` adds nothing; a token button with no valid token refuses before send (`TEMPLATE_LINK_UNAVAILABLE`); any other value is `TEMPLATE_BUTTON_INVALID`; `mutual_override` notices now issue a private duties link. Triggers are unchanged; activation is configuration only after Meta approves each `gsis_v1_*` template.

## Scope and mergeability

- Diff against base 5bbb9af: exactly 4 files, matching the task record's scope. 111 insertions, 19 deletions.
- `git merge-tree --write-tree --name-only origin/main 047a7984` produced a clean tree (813ebc24). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44978016047, completed, success, head_sha 047a7984, attempt 1. It ran 32m29s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** run 44978012457, completed, success, head_sha 047a7984, attempt 1. All four regression shards and the full-suite gate pass. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 047a7984. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-adhoc-delivery.mjs` — exit 0. Both regression blocks pass: the token button carries the same 43-character private token as the link; the peer-change notice gets a private duties link; a token button with no link is refused before any send; an invalid button value throws; a static button adds no parameter; and the #276 contact-review cases (Power User receives, revocation cancels) still pass.
- `node tests/v1-product-roster-contact-review.mjs` — exit 0. Two Power Users receive the review; exact summary; idempotent retry queues nothing new.
- `node tests/v1-product-roster-service.mjs` — exit 0.
- `node tests/v1-product-webhook-integration.mjs` — exit 0.
- `node tests/v1-product-operation-probe.mjs` — exit 0. 404 probes, knownMissing 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): the PR's own change is unchanged from the first review; the merge only brings in #274 and #276. Pass.
- Q02 (tests): both regression blocks in the shared test file pass, and #276's own test passes at the merged head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or provider send in this PR. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): roster-service, webhook integration, contact-review, and the operation probe pass; all four Node/LORD shards pass in CI. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record unchanged from the first review; it states the owner decisions, the two problems, the change, the activation mapping, and the out-of-scope items. Pass.
- Q08 (review): this record is the fresh exact-head review. Pass.

## Findings

None.

## Release notes

- The conflict resolution keeps both #276 (contact review to Power Users) and #277 (WhatsApp URL buttons, peer-change private link) intact.
- Button templates stay inactive until Meta approves each `gsis_v1_*` template and the mapping is set in configuration.
- #278 remains serial after this PR and still needs a fresh exact-head review if its head moves.
- Hosted UAT is Not tested. No deployment authorised by this review.
