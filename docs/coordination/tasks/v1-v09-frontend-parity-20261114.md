# v1-v09-frontend-parity-20261114: Capture 14 November v0.9 updates and preserve v1 release labels

- Status: implementation complete; exact-head CI and Claude review pending
- Owner/model: Codex; v1 coordinator ChatGPT; independent reviewer Claude
- Last updated (Asia/Singapore): 15 November 2026
- Branch: codex/v1-v09-frontend-parity-20261114
- Base SHA: 7c9315124344e204819538697f1369edcc5ace31
- Current head/PR: claim first; exact implementation head and evidence will be recorded in the PR.
- User-authorised scope: "read v0.9 repo. capture all updates done today. ensure that the updates are also integrated into v1 where applicable". The source window is 14 November 2026 Singapore time, 2026-11-13T16:00:00Z through 2026-11-14T16:00:00Z. This authorises the bounded implementation and its tests/PR, not another deployment or provider activation.
- Exact file scope: `scripts/v1/build-web.mjs`; `tests/v1-product-v09-frontend-parity.mjs`; `docs/v1/accelerated-delivery/V09_UPDATES_2026-11-14.md`; this task record.
- Out of scope: legacy/shared code, release bundles and labels, package/dependency changes, Core/Contacts identity/authority, Roster behaviour fixes (separate claim), infrastructure/configuration/live data, provider/Drive activation, merge or deployment.

## Decisions and ownership

Read current root/v1 instructions, workflow, lanes, status, directives, engineering gates and relevant reviews. Main now includes reviewed PR142 and PR153. PR153 is merged despite its historical claimed task status, so this v1 task does not take over the completed v0.9 hotfix. Parked PR40/72/103 and the coordinator's release-y assembly are untouched. Muse is retired; Claude coordinates v0.9, ChatGPT coordinates v1.

Inventory found two new v0.9 behaviour changes in the window: PR142 Stapler teacher-row editing and PR153 dated ad hoc relief eligibility. Release w/x packaging, historical carry-ins and reported deployment are recorded separately. v1 already builds the shared Stapler implementation; no duplicate port is needed. Release x changed the source label from p to x, exposing a hardcoded p-only v1 label rewrite. Correct only current application chrome, retaining asset query versions, scripts and historical version text. A separate Roster claim will cover any proven context/final-send gaps from PR153.

The inventory is evidence, not permission to import parked/unreviewed work or activate legacy cutover paths. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

## Acceptance and verification

1. Capture every identified 14 November v0.9 change with exact source/merge/release references, distinguishing new behaviour, older carry-in, inherited v1 code, required adaptation and unperformed deployment/runtime evidence.
2. Show the current v0.9.9x source reproduces incorrect v1 chrome before the fix, then verify built viewport labels identify v1 after it. Cover a future source release label and preserve asset URLs, inline code and historical text.
3. Verify existing Stapler reuse/overlay boundaries and relevant frontend tests; no shared legacy source edits.
4. Run meaningful focused tests, runner discovery, canonical build/no tracked drift and required exact-head Node/LORD/product CI with TZ=Asia/Singapore. Record actual commands, failures and omissions.
5. Exact allowlist and whitespace/link checks; Claude reviews the final head. Rollback affects v1 presentation/build adaptation only, with no schema or data changes.

## Skill use

Pstack blast-radius applied from `skill://plugins_6a85a87df50c8191bd7f010bb7b17794/blast-radius/SKILL.md`: trace source changes through v1 builders, shared consumers and distinct authority contracts; separate source ancestry from tested behaviour. No skill repository or new dependency is copied.

## Handoff

Claim-only publication precedes implementation. No live operation is authorised by this record. Runtime UAT is Not tested; independent Claude review and owner merge/release decisions remain separate.

## Implementation evidence

The builder now reads `package.json.gsisBuildLabel` and replaces only current application chrome text with v1. Original HTML text-node offsets preserve asset query stamps, attributes, scripts, comments and historical/about content; the existing jsdom development dependency is reused. No production source or dependency changes. The inventory records all identified source changes and separate Roster adaptation at claim c3b4aa2aa99e0ae4f29203dcd07d359c7d666de4.

Red proof: the new actual-build test failed before the fix because Roster chrome contained `v0.9.9x`, not v1. Green focused checks, all with `TZ=Asia/Singapore` and browser executable `/usr/bin/chromium`: `node tests/v1-product-v09-frontend-parity.mjs`; `node tests/v1-product-stapler-resize.mjs`; `node tests/v1-product-web-browser.mjs`; `node tests/stapler-teacher-row-write-across-browser.cjs`. The new test covers all nine real source viewports, a future `0.9.9zz` label in memory, unchanged source files/cache stamps/scripts/history and Landmark historical text. One fixture assertion was corrected to inspect Venues' separate adjacent footer spans rather than assume whitespace between them; no production assertion was weakened.

Canonical `TZ=Asia/Singapore npm run build` passed with no tracked generated drift. Existing runner discovery includes the new test (1,169 programs). `git diff --check`, exact four-path scope and all ten inventory relative links pass. Focused checks tested the code tree committed by this PR; full product/Node/LORD exact-head CI remains pending until its recorded runs finish. No school runtime UAT was performed.

Q01/Q02: published claim, exact sources and independent-domain disposition recorded. Q03–Q05: build-time presentation only, no authority/persistence/concurrency change or new dependency; original source/URLs and historical text preserved. Q06: focused and canonical evidence above, exact-head full CI pending. Q07: Claude exact-head review pending. Q08: no merge/deployment or activation included; rollback is the builder/test change only. F5 remains OPEN.
