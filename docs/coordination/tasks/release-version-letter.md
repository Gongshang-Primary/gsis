# release-version-letter: one version label (0.9.9b, then c, d …) on every component, plus a mismatch notice

- Status: implementing (owner 30 Oct 2026: "for next deploy need to be more vigilant in harmonizing all version numbers to 0.9.9b and advance the alphabet so that frontend user can keep track")
- Owner/model: Codex (builder), Claude (reviewer; Claude also bumps the letter when building each deploy bundle)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 22:20
- Branch: codex/release-version-letter
- Base SHA: 9393377c644ee977be2573a94afd28280a06c98b
- PR: none
- Files/domains owned: scripts/package-099-suite.py (VERSION), version stamps in backends, Roster/Deploy/Contacts/Layout/LORD headers, Worker builds, release tests.

## Background
- Today the labels disagree: Roster header shows v0.9.9a (hand-edited 28 Oct, d588ae6); Deploy header and both backends (`GSIS_DEPLOY_VERSION`) show 0.9.9; Workers carry no visible label.
- 30 Oct deploy: a new Roster backend met an old (cached or not yet uploaded) Roster page. System Config failed with "Set each allocation rule to On or Off." Nobody could see that the two halves were different versions.

## Required
1. **One source:** `VERSION` in scripts/package-099-suite.py becomes the full label, starting `0.9.9b`. The build stamps it everywhere: both backends' `GSIS_DEPLOY_VERSION`, every frontend header (Roster, Deploy, Contacts, Layout, LORD/OVERLORD/STARLORD), both Workers (a `version` field in their health/status JSON), and asset query strings so browsers fetch fresh files.
2. **No hand edits:** a test fails if any header, backend or Worker label differs from `VERSION`.
3. **Mismatch notice:** backend responses already carry or can carry `GSIS_DEPLOY_VERSION`. When the page's label differs from the backend's, show a plain notice at the top: "This page is v0.9.9b; the server is v0.9.9c. Press Ctrl+Shift+R to refresh." Do not block the page for this alone.
4. **Letter rule:** each deploy bundle advances the letter (b, c, d …). After z, ask the owner. The bundle folder, DEPLOY_STEPS title and COMMIT.txt name the label. The release script refuses to build a bundle whose label equals the previous bundle's (record the last label in a tracked file, e.g. `release/LAST_BUNDLE_VERSION`).
5. The existing check that throws "The published backend version differs from the …" keeps working with letter labels.

## Acceptance
- Build with VERSION=0.9.9b: every label reads v0.9.9b; test catches a single hand-edited header.
- Page 0.9.9b against a backend fixture at 0.9.9c shows the notice; equal labels show nothing.
- Bundle build refuses a repeated label.
- Full suite green in the main checkout.

## Continuation directive, 30 Oct 2026

Owner: "do not wait for review on completion of changelog items keep on going". Build and test each item, record an exact-head handoff, then continue the next eligible item while review proceeds. Keep one branch per task, the existing PR limit, owner-controlled merges, and explicit production/deployment holds. Pending review alone is not an implementation blocker. Any overlapping pending task is reconciled before integration; do not edit another implementer's branch.

## Phases (30 Oct 2026, quiet hours)
- **Phase 1, Claude:** `package.json` `gsisBuildLabel` (now `0.9.9b`). `scripts/build-release.py` stamps it on every manifest frontend's HTML: visible `v0.9.9b` labels and every `?v=0.9.9b` asset query string. File names, `gsisRelease` and `GSIS_DEPLOY_VERSION` stay `0.9.9` (protocol and packaging unchanged). `tests/release-build-label.cjs` fails on any stale label.
- **Phase 2, Codex:** Worker health `version` field; backend exposes the build label; page/server mismatch notice (Required 3); bundle script refuses a repeated label (Required 4).
- **Bundle rule (Claude, until phase 2):** before each deploy bundle, advance `gsisBuildLabel` by one letter, run `npm run build`, run the full suite, and take frontend ZIPs only from the release build (`<App>_Frontend_v0.9.9.zip`), never by zipping folders.

## Phase 2 implementation handoff, 1 November 2026 (Model: Codex)

- Status: locally implemented; serial recovery build/focused checks pass; full local run interrupted and not green; independent exact-tree review/CI required before merge. No deployment or final delivery bundle. Root/coordinator owns publication and the serial Roster queue.
- Branch: `codex/release-version-phase2-current`. Isolated source base `bb8d72d5c08925fe56b0131eee674a66a630a2d5`, tree `a58e4e3210bcf52bb846abc1ec5249f1b00b28fd` (same source tree as observed main `4a93be79862e0bae2eebea53e1aaab26d2b1d95b`). Implementation head is the commit containing this handoff; root records the exact head/tree in the PR.
- Authorization: owner-authorized Phase 2 cross-product release scope; coordinator GO followed green Q rebase CI. Calendar/LORD queue, forms, authority, schemas, providers and saved outcomes are unchanged.
- Plan: [bounded execution plan](../../superpowers/plans/2026-11-01-release-version-phase2.md).

### Result and routes

`package.json` `gsisBuildLabel` remains the single input, still `0.9.9f`. The build stamps additive `GSIS_BUILD_LABEL` constants and HTML metadata. `gsisRelease`, all eighteen component versions and protocol checks remain `0.9.9`.

The six Google backend JSON boundaries expose `gsisBuildLabel` for successes and errors. All nine frontend gateways forward observed metadata in `X-GSiS-Build-Label`, separately identifying their executing build in `X-GSiS-Worker-Build-Label`. Roster D1 envelopes identify their executing build; Google responses retain their actual upstream label, including sanitized errors and authorized immutable-cache responses. Layout sanitization and LORD/OVERLORD/STARLORD live/cached responses preserve observed labels. A cached old Worker header cannot replace the current executing gateway identity. Unknown legacy backend labels remain unknown.

The shared browser helper observes bounded headers through existing request helpers, without cloning/parsing payloads or adding requests. It writes plain accessible text with the exact page/server labels and `Ctrl+Shift+R`; it never changes save controls, focus, retries, return values or outcome handling. Equal explicit labels clear the notice; unknown metadata cannot clear an established mismatch. A malformed label or DOM failure cannot fail the request.

Notification, operations and Calendar job Workers expose metadata-only `GET /health` with a `version` field before any configuration, authority, schema, storage or provider work. The existing signed operations health result also identifies its build.

Final `npm run package:suite` packaging is the mandatory delivery path: it rejects the recorded label before output, uses a full-label folder and `DEPLOY_STEPS.md`/`COMMIT.txt`, verifies the exact committed full-label tag and source commit, and records the consumed label only after successful archive creation. Build-only and verification previews remain repeatable. Existing archive inventory, hashes, source completeness, dirty-source, tag/HEAD and baseline-diff checks remain effective. See [operator instructions](../../../release/README.md). Initial tracked `LAST_BUNDLE_VERSION=0.9.9f` records the already-existing cutover bundle label supplied by the coordinator; this task does not advance it.

### Independent review fixes after `764fc75`

The independent review found three Important issues. All three were reproduced and fixed in one bounded RED→GREEN pass; reviewer recheck and full exact-tree CI remain pending.

1. Final packaging now holds a nonblocking per-source Git-directory lock across label checks, packaging, output promotion and ledger replacement. Two synchronized real processes using different output directories reproduced two successful `g` bundles before the fix; now at most one succeeds. A ledger-write failure removes only the transaction's own newly promoted folder while the lock is held, preserves the prior label and permits safe retry. Build/preview behavior remains repeatable and the lock does not relax clean-source checks.
2. A shared bounded metadata selector preserves observed labels through Layout's `since`/unchanged rewrite, Calendar's definite rejection envelope, OVERLORD's dashboard-to-reference-cache seed, and LORD/OVERLORD reference errors through their outer handlers. Real Worker route/function tests cover missing/malformed labels, definite save outcomes, cached reads without extra upstream work, and HTTP 200/503 rejection paths. Setup mirrors match their canonical Workers. No extra provider calls, payload clones or payload parsing were added for metadata.
3. New archives carrying `buildLabel` report Roster as `unchanged configured authority`, while legacy archives without that field retain the strict Google-baseline contract. The verifier rejects guessed D1 claims, Google claims on new-format archives and changed legacy authority claims. Source-review instructions distinguish the historical Google baseline from the owner's reported later D1 cutover. Packaging neither probes nor changes live authority; exact tag/HEAD/source provenance checks remain unchanged.

Final review-fix verification: one serial build plus 22 focused commands passed (`TZ=Asia/Singapore`), including nineteen metadata/notice checks, three zero-config health routes, three original cached gateway cases, five new actual transformation cases, nine isolated bundle/concurrency/authority/provenance tests, fourteen existing packaging tests, real D1 and Google backend/storage fixtures, Calendar gateways/commands, LORD Worker/reload/static/setup checks, generated dashboard parity and Apps Script syntax. Current build and recorded last-bundle labels remain `0.9.9f`. No existing assertion was removed, skipped or weakened.

### Interrupted-session recovery, 1 November 2026 (Model: Codex)

The owner requested continuation after the connection interruption. Current remote main remains `4a93be79862e0bae2eebea53e1aaab26d2b1d95b`, with the same source tree as the isolated base above. Existing Calendar #43 and LORD #44 are ready with exact-head green CI. Roster #38/#40/#41/#42 remain open and held through Monday's first busy period and owner clearance. No new lane-R PR is opened while that queue is occupied; Phase 2 may have a verification branch only.

The interrupted working tree contained a final portability correction after `15d90da`. The packager no longer imports POSIX `fcntl` when merely importing, building or previewing on Windows. Final packaging selects the standard-library nonblocking lock for its host, using a fixed one-byte `msvcrt` lock on Windows and `flock` on POSIX. Acquisition failure refuses the transaction without consuming a label; release runs after failure as well as success. The real two-process concurrency check uses independent subprocesses instead of POSIX-only `fork`. All twelve isolated bundle checks pass, including three new portability regressions whose pre-fix failures are retained in local diagnostic evidence. Windows lock behavior is exercised through a native-module fixture on Linux; no native Windows run is claimed.

All eighteen components rebuild successfully. Full exact-tree Node/LORD CI and Claude review remain pending until recorded with their exact branch head. Current `gsisBuildLabel` and `LAST_BUNDLE_VERSION` both remain `0.9.9f`; no final delivery, deployment, live setting, authority or record changed.

Fresh serial recovery checks passed: the metadata/notice, zero-config Worker health, cached gateway, transformation, build-label parity, twelve bundle, fourteen existing packaging and actual D1 operational programs. This is eight complete commands after the successful build, with `TZ=Asia/Singapore`. The earlier overlapping incomplete local full-suite runs remain diagnostic failures, not claimed passes.

The first exact-tree remote run, `41277596213` at `706f9b38f4609584d2cdf2a36af357d43a8b57dd`, caught a genuine privacy regression before the regression shards: the notice script preceded the private page's referrer meta policy and sent a referrer on its own fetch. The existing private-link browser assertion was unchanged. A new all-page label assertion reproduced the missing policy locally, then the canonical builder gave the notice script its own explicit `referrerpolicy="no-referrer"`. This preserves script loading order and the private page's existing policy. A new exact-head full run must verify the correction; the failed run is retained evidence, not a pass.

### Verification recorded before snapshot

- RED then GREEN: 19 metadata/notice checks in `tests/release-version-phase2.cjs`; three real bundled Worker health routes with all configuration reads and provider calls forbidden; three real LORD cached gateway flows, including different cached/current Worker identities; actual Roster D1 success/error metadata in the unchanged operational fixture.
- GREEN: five temporary-root final bundle/provenance tests and all fourteen existing 0.9.9 packaging tests. Full-label provenance rejects a different source label, arbitrary tag and a correct-named tag pointing at a different source commit.
- GREEN, final serial recovery run: one build and 24 subsequent focused commands, all using `TZ=Asia/Singapore`. These include metadata/notice, zero-config health, LORD caches, 139-label/helper parity, actual Roster D1, Google backend secrets, backend behavior/storage, five new bundle/provenance and fourteen existing packaging tests, notification/operations dashboard `--check`, Apps Script syntax (88 files), and eleven unchanged geometry scripts. `git diff --check` passes. Repeated builds were verified without advancing `LAST_BUNDLE_VERSION`.
- Real regression caught in the partial full run: the new external script shifted static campus geometry harness indices. Ruling: verified static landmark/privacy pages retain meta but do not load an unused backend observer. Request-bearing apps/admin/external pages retain the helper. All eleven current inline-model geometry scripts passed with their original assertions unchanged.
- Full local `TZ=Asia/Singapore npm test` and the overlapping baseline were interrupted (exit 130). Their results are diagnostic only: missing `/tmp/chromium`/Playwright headless-shell failures and later corrupted-source failures are not final proof. No browser/dependency installation attempted. The overlapping runs exposed a zero-byte canonical `backend/Code.gs`; its exact writer was not proven. It was restored from immutable base `bb8d72d` plus exactly the intended build-constant/envelope assignment, all changed tracked files were audited, and the final 25-command recovery run was serial. Local historical-Git availability is not a comparison pass. Root supplies exact-tree full Node/LORD CI and independent review. Native gstack runtime was unavailable; no native gstack review is claimed.
- No existing assertions were removed, skipped or weakened. The existing D1 fixture adds one success/error metadata assertion; the label parity test adds runtime meta/helper coverage. New gate tests use isolated synthetic roots and never create a real delivery or consume the repository label.

### Rulings, risk, rollback and next action

Rulings: preserve unknown backend metadata; initialize the last-label record from the supplied existing `f` bundle; load the notice only on pages that request backend data. The cost of unknown metadata is that an old unlabelled backend cannot show a mismatch until upgraded. A legacy cached response without metadata also remains unknown; no extra backend probe is added merely to identify it.

The last-label record changes after final packaging, so later provenance verification should use the exact tagged source checkout named by `COMMIT.txt`, rather than pretending the subsequent bookkeeping commit was the packaged source. A ledger-write failure rolls back only that transaction's new output while holding the source lock; the unconsumed label remains retryable.

Rollback is a code revert followed by the canonical rebuild; existing deployed settings, authorities, records, receipts and provider work require no migration. The operator follows the mandatory full-label packaging instructions only when explicitly preparing a future delivery. Next action: root reviews the stable implementation head/tree and runs complete exact-tree Node/LORD CI, reconciles Calendar/LORD metadata-only overlaps, then handles publication when the Roster lane permits.
