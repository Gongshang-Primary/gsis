# Review of PR #277 — Roster WhatsApp: URL button support; peer-change private link (W4)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #277, "Model: Claude / v1 Roster WhatsApp: URL button support; peer-change private link (W4)". Branch `claude/v1-whatsapp-buttons`. Head reviewed: `4576abd3`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 4576abd.** No findings.
- **Head note:** the PR body names the earlier head `c77f1caa` as the reviewed head. That head was superseded: the branch was merged with origin/main (through ab19517, the #263 merge) and the current head is 4576abd, a merge commit. This review is at 4576abd, and both CI suites below are verified at 4576abd.
- **Serial note:** the PR body states this is serial with #276 ("merge #276 first") — both edit `v1/services/roster/service.mjs` (different functions) and both add cases to `tests/v1-product-roster-adhoc-delivery.mjs` at the same anchor. #276 is approved at 5e995e5 but not yet merged. If #276 merges first and this branch's head moves (rebase or merge), this approval does not carry to the new head: a fresh exact-head review is required.

## What it does

Owner decisions 21 Nov 2026: use button templates in v1, as new v1 templates at `https://gsis.gsps.edu.sg` (10 submitted, PENDING Meta review). v1 `templateFor` only built a body component, so no button template could be sent — including the two v0.9 already used (peer request, timetable change). It also fixes a baseline gap: the peer-change `mutual_override` notice (no snapshot) got no private link, so its link field was empty.

- `v1/services/roster/templates.mjs` (new; `templateFor` moved here verbatim from `service.mjs`): per-template `button: "token"` adds `{type:"button", sub_type:"url", index:"0", parameters:[token]}`; `button: "static"` adds nothing; a token button with no valid token refuses before send (`TEMPLATE_LINK_UNAVAILABLE`, 503); any other `button` value is a configuration error (`TEMPLATE_BUTTON_INVALID`, 503). The token is validated against `^[A-Za-z0-9._~-]{1,256}$`.
- `v1/services/roster/service.mjs`: imports `templateFor` from the new module; passes `linkToken` alongside `link`; `mutual_override` notices now also issue a private duties link (previously only `mutual_request` and snapshot-backed kinds did).
- Triggers are unchanged. Activation is configuration only, after each `gsis_v1_*` template is APPROVED: set name + `button` in `WHATSAPP_TEMPLATES_JSON` (`token` for routes 1, 2, 4, 5, 6, 8, 10; `static` for 3, 7, 9). Never map v1 to v0.9 button templates (their URLs point at the v0.9 hosts).

## Scope and mergeability

- Diff against base ab19517: exactly 4 files, matching the task record's scope — task record, `tests/v1-product-roster-adhoc-delivery.mjs`, `v1/services/roster/service.mjs`, `v1/services/roster/templates.mjs` (new, 38 lines). 111 insertions, 19 deletions.
- `git merge-tree --write-tree --name-only origin/main 4576abd` produced a clean tree (c99b74bd). No conflicts — against current main, which does not yet contain #276's product changes (see the serial note above).
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44971521299, completed, success, head_sha 4576abd, attempt 1. It ran 27m39s.
- **Node/LORD ("Verify GSiS queue changes"):** run 44971516740, completed, success, head_sha 4576abd, attempt 1. All four regression shards and the full-suite gate pass. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 4576abd. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-adhoc-delivery.mjs` — exit 0. The token button carries the same 43-character private token as the link; the peer-change notice now gets a private duties link; a token button with no link is refused before any send (`TEMPLATE_LINK_UNAVAILABLE`); an invalid button value throws `TEMPLATE_BUTTON_INVALID`; a static button adds no parameter.
- `node tests/v1-product-roster-service.mjs` — exit 0.
- `node tests/v1-product-webhook-integration.mjs` — exit 0.
- `node tests/v1-product-operation-probe.mjs` — exit 0. 404 probes, knownMissing 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the template button support, the peer-change link, and one test. Pass.
- Q02 (tests): the adhoc-delivery additions prove the token button, the peer-change link (stated to fail without the fix), the refusal, the invalid-value error, and the static case. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or provider send in this PR; activation is a later configuration step. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): roster-service, webhook integration, and the operation probe pass; all four Node/LORD shards pass in CI. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the owner decisions, the two problems, the change, the activation mapping, and the out-of-scope items. Pass, with the head note above: the PR body names the superseded head c77f1caa.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- v1 WhatsApp templates can now carry a URL button whose parameter is the recipient's private duties token; static buttons carry no parameter.
- A token button is never sent without a valid token — it refuses before sending.
- Peer-change notices now include the recipient's private duties link, closing the empty-link gap.
- Button templates stay inactive until Meta approves each `gsis_v1_*` template and the mapping is set in configuration.
- Hosted UAT is Not tested. No deployment authorised by this review.
