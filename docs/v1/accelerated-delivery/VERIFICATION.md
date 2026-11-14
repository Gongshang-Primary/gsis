# Product verification evidence

This record distinguishes local engineering evidence from school acceptance and production operation. Exact tested commits, final command outcomes and CI URLs are attached to [PR139](https://github.com/helper-gsps/gsis/pull/139); the task/PR points here without a self-referential commit hash. No deployment, live-data access or real provider send was performed.

## Source and authority

| Reference | Exact revision / disposition |
| --- | --- |
| Product source main at start | `27fa498657965169b9d971a9caabc33c8b19bc69` |
| Published claim and current main at final refresh | `f5a238527eb5661ffb4c5c889c05baf3cca4287d`; branch `codex/v1-product` |
| Accelerated specification v1.1 | `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`, PR137 head `b6cd8f5702fbea8fc4dc22c245de00b6dfdd2a22`; read without merge/cherry-pick |
| Latest Contacts owner policy/design | PR136 `0081eea4e8924691818b68d18c5d53d6927985fa`; Admin or Contacts Power User independently, no self-acceptance, no Admin notifications, owner review, active-staff readiness |
| aSc source reference | PR138 `d573748e95addfa4dc10cb359e2ecf609d60ef0d`; disjoint reference/task paths, read without merge |
| Source specification | Full recovered Revision49 read, with later owner decisions and controlling accelerated defaults applied |

Final main refresh found no subsequently merged production change beyond the task claim. Open PR actual file inventories were inspected; PR132/136/137/138 documentation and production release/legacy branches remain disjoint. The implementation adds only the task's new v1 runtime/services/web/allocator/migrations/config/dependencies, v1 scripts/tests/workflows and five delivery documents. Existing Core/Contacts contracts, production code, root package/CI and generated production outputs remain unchanged.

## Reproducible commands

Run from the repository root with Node 24 and locked root dependencies. Local browser location was `/tmp/gsis-pw`; CI installs the locked Chromium. All test commands use `TZ=Asia/Singapore`.

```bash
npm ci
npm ci --prefix v1
node node_modules/playwright/cli.js install --with-deps chromium
TZ=Asia/Singapore npm run build
git diff --exit-code
TZ=Asia/Singapore node tests/run.cjs --list
TZ=Asia/Singapore node scripts/v1/test.mjs --list
TZ=Asia/Singapore node scripts/v1/test.mjs
TZ=Asia/Singapore npm test
TZ=Asia/Singapore node scripts/v1/build.mjs
TZ=Asia/Singapore node scripts/v1/verify-build.mjs
git diff --check
```

`tests/run.cjs` discovers every top-level `v1-product-*.mjs` without changing its selection or historical exclusions. The focused runner uses the same 45-second per-program bound and records source SHA, command result/duration and counts in ignored `deliverables/v1/evidence/product-tests.json`. Full existing Node/LORD regression and exact-head CI are required, and remain pending until the PR supplies their completed outcomes. A successful earlier development run is not assigned to a later SHA.

The canonical 18-component build passed during implementation with no tracked drift. Locked isolated Wrangler installation passed using a temporary npm cache. Build isolation tests generate all nine Worker bundles, verify eight distinct owner databases/buckets and restricted named bindings, disabled sender/webhook/scheduler ownership, absent secret/local-test transport, no Apps Script runtime dependency, and every artifact SHA256. No migration or uploading deployment command was executed. The first local `wrangler deploy --dry-run` attempt could not initialize its default global configuration directory. All nine dry-runs subsequently passed using the supported `XDG_CONFIG_HOME=/tmp/gsis-v1-wrangler-config` setting and `WRANGLER_SEND_METRICS=false`; this created only isolated local configuration and uploaded nothing. Final-head outcomes remain in the PR evidence.

## Engineering acceptance map

The programs below exercise implementation behaviour. Their exact final results come from the focused/full runner at the PR head. A row maps evidence, not an assertion that all school/runtime acceptance has been performed.

| Specification cases | Engineering programs under `tests/` | Evidence boundary |
| --- | --- | --- |
| CORE01–02, CT01–03 | `v1-product-core-identity.mjs`, `v1-product-core-contacts.mjs`, `v1-product-core-provider-deadline.mjs`, unchanged `v1-core-*` / `v1-contacts-*` | Actual D1 identity/session/accepted-fact/revision logic; coherent owner read and unchanged provider deadline; Google/JWKS providers and identities synthetic |
| CORE03 / F5 | `v1-product-core-contacts.mjs`, `v1-product-backup.mjs` | Original decision/audit association, distinct observation, immutable Contacts content, role/group/catalogue revisions, interval/evaluation/as-of, original destination receipt; restart and fresh Core+Contacts store restoration |
| DP01–06 / TV01–07 | `v1-product-deploy-storage.mjs`, `v1-product-deploy-workbooks.mjs`, `v1-product-deploy-exports.mjs`, `v1-product-integration.mjs` | Real owner transactions/R2 and nine-Worker publication; exact scope/quality/races/recovery; external export replies injected |
| RO01–04 | `v1-product-roster-service.mjs`, `v1-product-roster-storage.mjs`, `v1-product-roster-accounting.mjs` | Actual D1/immutable inputs, compatibility operations, started-time and competing source/config/week guards; domain test projections injected where stated |
| AL01–10 | `v1-product-allocator.mjs`, `v1-product-performance.mjs` | Pure replaceable engine, validated proposals, continuity/caps/spiral/backfill and bounded high-absence result |
| LED01–02 | Roster storage/accounting programs and performance annual report | Distinct period/R charge, completion/correction/retry, inclusive date ranges and immutable accounting basis |
| CAL01–02 | `v1-product-calendar.mjs`, `v1-product-calendar-provider.mjs`, `v1-product-calendar-birthdays.mjs`, `v1-product-calendar-external.mjs`, `v1-product-calendar-pins.mjs` | Actual D1 revision/audience/publication/date pins; injected direct Google API, tombstone/etag/uncertain outcomes |
| LORD01–03 | `v1-product-lord.mjs`, `v1-product-lord-declarations.mjs`, `v1-product-lord-notifications.mjs`, `v1-product-lord-recovery.mjs` | Actual capacity/loan/photo/archive states and negative races; provider responses synthetic; no physical return claimed |
| VEN01–02 | `v1-product-venues.mjs`, `v1-product-venues-staged.mjs`, `v1-product-venues-notifications.mjs` | Actual D1 booking/fence/recovery;40,800-interval staged source fixture with 160 immutable chunks |
| LAY01 | `v1-product-layout.mjs`, integrated Deploy delivery | Local metadata and immutable yearly source snapshots, wrong-year/revision/import negatives |
| INT01–03 | `v1-product-integration.mjs`, `v1-product-isolation.mjs`, `v1-product-providers.mjs`, web programs | Actual Service Binding graph, header/CSRF/school/preview denial, provider signatures/coexistence gates, zero Apps Script egress in exercised browser flows |
| CON01 | store/integration/accounting/domain race programs, `v1-product-performance.mjs`, `v1-product-web-load.mjs` | Actual D1 contention, 30 independent authenticated sessions and 30 browser contexts; CPU/network limits stated below |
| REC01–02 | backup/providers/system/Roster storage programs | Restart/uncertain dispatch, original operation identity, isolated restore/BURROWS artifacts; hosted complete-suite restore rehearsal unperformed |
| UX01 | `v1-product-web.mjs`, `v1-product-web-browser.mjs`, `v1-product-web-load.mjs`, `v1-product-web-signage.mjs`, `v1-product-web-starlord.mjs` | Nine initial screens plus selected actual write journeys, restricted device photos, cache/date/expiry privacy, desktop/narrow captures; not exhaustive manual menu UAT |
| REL01 | `v1-product-deployment.mjs`, `v1-product-isolation.mjs`, prepared workflows/runbook | Static/build and injected API identity/privacy preflight only. Hosted browser-only installation/deployment rehearsal **Not tested** |

F5 remains **OPEN** until the exact durable recovery evidence is independently reviewed and any required staging evidence is satisfied. The tests preserve original audit projection fields, attach separate durable decision evidence and recover per-read observations without incrementing content revisions on reads. No synthetic-only contract pass is presented as durable or live integration proof. Official **T1B-01/T1B-02 remain Not tested**. All unperformed runtime UAT remains **Not tested**.

## Internal findings and observed fixes

Internal Codex cross-reviews are advisory and do not replace Claude's independent exact-head review. Counterexamples drove these changes:

- A conflicting retry could return another intent's committed result or abort its prepared record. The wrapper now requires the original request/action binding; changed intent conflicts without touching the original operation. Attempt-only request IDs do not change canonical business intent.
- Equal operation IDs in two owners could bypass source pins. Exemptions now require the full destination-owner and operation-ID pair. Interrupted acquisition retains every original pin identity, fences the destination and reconciles it.
- Provider HTTP200 with malformed/missing body could be misreported as failed; headers could also finish before an indefinitely stalled body. One deadline now covers fetch and body consumption, and post-dispatch ambiguity is uncertain. Jobs acquire leases individually immediately before dispatch.
- Restore initially lacked destination R2 verification, exact non-table schema checks and writer/sender fencing. It now verifies hashes/metadata, empty targets, all schema objects and school-qualified content, fences restored preparations and retains queued/leased provider work as uncertain. Manifests are immutable under concurrent same-ID backup attempts.
- Allocator adapters could supply a false layer to evade subject continuity. The validator derives policy layer from accepted input. Weekly accounting now includes prior-day and zero-charge physical occupancy, and concurrent days cannot both spend the last slot. Started-period and newly inserted baseline changes are checked at commit.
- Calendar date/parity observations were initially outside Roster admission protection. Calendar year revisions now use durable owner pins and cancellation/recovery before source writes.
- Browser testing caught an omitted logout operation ID and private draft state surviving the shared session epoch. Logout requires the original committed receipt; protected in-memory/storage state clears with the session boundary.
- Final review caught STARLORD restoring a device cache before a current authority check, retaining it after revocation and omitting its required photo UI. The screen now binds cached rows to token/account, date and revision, clears on denial/known expiry, and renders explicitly enabled scoped photos through private header-based reads with bounded in-memory blobs. Late responses cannot restore cleared rows or photos.
- A real-D1 delayed-read regression demonstrated that sequential session/account/grant reads could exhaust the unchanged T1A provider deadline. One consistent owner query replaces those round trips; genuinely slow reads still deny with retryable `PROVIDER_TIMEOUT/503`. The CI trace itself did not contain individual query timings.
- Deployment configuration could cosmetically rename a production D1 ID. Read-only Cloudflare identity checks now precede all mutations and require distinct actual named stores plus private R2 access. These remote responses were injected in tests; no cloud inventory was accessed.

Development failures/limitations are retained: npm's default cache was unavailable so the temporary cache was used; workerd rejected a future compatibility date and the tested locked date is `2026-08-06`; local Wrangler's global-directory failure was resolved with the isolated configuration setting above; the first named-Miniflare database-proxy experiment hung and was replaced by an ephemeral local-only test transport around actual owner bindings; an aborted-receipt test incorrectly expected operation state rather than terminal receipt state and was corrected to the existing contract. Any final runner failure is reported separately rather than erased by this list.

The first committed-head product CI at `d1bae474a5d10e2126fa35776bacb38cdcabebba` passed 38/40 programs. It exposed an authority-provider deadline exhausted by sequential owner reads and a browser-load teardown that disposed the runtime before all intercepted requests finished. The partial local full-suite run at that head was deliberately interrupted for corrections; it is not a complete local pass. An additional review found STARLORD could retain a cached display after a revoked token. The corrected head must supply fresh regression, browser privacy and timeout evidence; the earlier failed run and partial logs remain with the final evidence package.

## Performance and visual evidence

Local evidence files are generated under `deliverables/v1/evidence/`: `performance.json`, `browser-load-30.json`, product runner results and desktop/narrow screenshots. The environment uses Node 24.22.1 and locked workerd/Chromium; browser evidence includes hardware/runtime details. This measures local process transport and storage, not a school network or Cloudflare production region.

Observed development run: 200 staff, 40 classes, P0–P16, 50 relief demands, 3,650 annual duty rows and 30 authenticated simultaneous sessions. Warm list p95≈360ms, committed write p95≈908ms with zero errors; annual ledger read≈134ms. Standard engine≈424ms;150-demand high-absence fixture≈441ms with a bounded useful result, including explicit unresolved demands. A bounded result is not proof no better allocation exists.

Thirty actual separate browser contexts rendered all 200 staff. Warm useful UI p95≈1.21s and warm directory request p95≈353ms; cold useful UI p95≈7.35s and cold request p95≈818ms. The simultaneous cold first-screen result **misses the proposed 3-second budget**. It must be compared with isolated first-screen and representative school-device/network results before performance acceptance; it is not relabelled as a pass. Zero API/page errors and no Apps Script requests were observed in that run. A later shared-host run measured warm request p95 1,161ms, above the 1,000ms target; its evidence is retained in `browser/load-contention-run.log`. The final isolated measurements are recorded with the PR head, without erasing either miss.

## Release status

Local product implementation is prepared for review, not production-approved. Claude exact-head review, completed final full-suite CI and any unresolved final verification failures remain gates. Hosted installation/restore, real Google sign-in, provider delivery, school-data migration, physical equipment workflows and installed-aSc import acceptance have not been performed. The next owner release decision follows that evidence; no skill, internal review or green build authorizes merge/deployment.

## Review follow-up

Claude's [review and owner P2 decision on main at `66e922f`](https://github.com/helper-gsps/gsis/blob/66e922f34307fd1f29f36f19d2f993c1114d99b4/docs/coordination/review/pr139-claude-review.md) approve isolated, undeployed code at `98cd5d8093c29af0c3f44919cdb73e47a8b49186`, with the review's stated coverage limits. The 43-program local/CI pass, full 1,138 Node + 40 LORD CI pass, nine dry-runs and 330-file artifact hash match remain attached to that exact head in PR139.

The follow-up pins the upload action to the same commit used by that successful build and updates only the operator/release/task documentation for protected `main`-only deployment, a v1-specific environment secret, provider credentials absent until cutover, and removal of bootstrap identity settings after initial enrollment. It changes no application or database logic. Its own exact-head checks and Claude review status are recorded separately in the PR; the earlier approval is not transferred automatically.

Initial read-only GitHub inspection found no `gsis-v1-owner-approved` environment. Repository-secret metadata returned HTTP403, so credentials inherited from that scope are unverified. The owner subsequently authorised GitHub setup only: owner-required review, exact-main deployment policy and a new v1-only environment `GSIS_SECRET`. The environment PUT returned HTTP403, `Resource not accessible by integration`; a subsequent list returned `total_count: 0`. No environment, secret, branch policy, Worker setting or live bootstrap record was changed, and no secret was generated. The connection lacks the required environment-write permission; GitHub plan support was not established by this response. P1 remains a pre-merge operator gate, P2 configuration remains outstanding, and staging still needs a separate owner decision. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

## Owner change queue, 14 November 2026 (PR145)

The preceding sections are historical PR139 evidence. The subsequent prototype deployment is separately recorded by PR144 and is not reassigned to this change. PR145 now implements the owner's [fourteen-item change log](CHANGELOG_2026-11-14.md), following claim `2b44f124e60d39fdbdd0de00fab34276cf633af2` on main and the explicit instruction “work and build. clear changelog item by item.” Branch: `codex/v1-admin-account-create`. Its final exact head, base, full changed-file inventory and CI run URLs are in the PR. Claude must review that head; earlier item-1 approval/checks are not transferred to it.

New tests exercise actual generated browser assets and local D1/R2 where stated. Provider responses are synthetic. Home/navigation, table import previews and unknown-save recovery, signature scrolling, Stapler resizing, Calendar PDF/XLSX and Setup, OVERLORD reference data, Drive jobs and REIGN have focused programs discovered by the unchanged root runner. Read-only/visual/lifecycle table exceptions and each canonical import's limits are recorded in the change log rather than presenting a disabled import as completed functionality.

Migration packaging preserves every deployed initial migration's bytes and emits additive migrations separately. `v1-product-migration-packaging.mjs` checks initial hashes and separate additive files using root dependencies only. `scripts/v1/verify-migration-upgrade.mjs`, called by the existing isolated build-verification stage after its locked Wrangler installation, builds a temporary installation, applies only the initial LORD migration to a local Wrangler D1, then applies both new LORD migrations. It checks the real migration ledger and resulting tables, strips cloud credential environment variables and passes `--local` explicitly. It neither uploads a Worker nor connects to a cloud database.

Development failures and corrections are retained:

- The first legacy LORD run lacked Playwright's expected browser. Installing the browser in `/tmp/gsis-pw` and using the test browser settings allowed all 40 legacy LORD programs to pass.
- An early additive-migration builder assumed every owner used `0001.sql`; Roster uses `001_roster.sql`. The builder now preserves that original input and tests all eight initial checksums.
- A product integration run during module creation finished 50/56: three builds could not yet resolve Calendar's new module, and three browser tests looked for the former Inventory/Signage controls. The tests now navigate the requested native Settings screens while retaining their business/security assertions. Final rerun results are recorded separately in the PR.
- Review reproduced shared table controls unhiding owner-hidden columns and exporting hidden descendants. Both presentation and report export now preserve the owner boundary, with negative browser coverage.
- Review found a lease-check/write gap in backup receipts, unbounded per-record REIGN cleanup statements and a changed-folder false-current result. Atomic lease assertions, fixed set-based deletes and destination checks now have restart/race/budget tests.
- School-size table tests reproduced per-record SQL/source-pin fan-out. Set-based Deploy/Roster writes and batched individual Contacts pins now pass actual local owner budget, concurrency and restart tests; no source ownership or permission rule changed.
- Calendar review found that a concurrent year release could escape lane sync-job scheduling. Native and workbook lane changes now check the complete released-year set at commit, including same-count replacement races.
- An existing LORD recovery test used today's fixed evening time after its real D1 lease had already expired. The same failure was reproduced from the unchanged committed baseline. A controlled future-day clock preserves the original assertions without depending on the test runner's time of day.
- At `9cf22863f7d85b783a938e6202c3a114b98ac03f`, product CI passed 62/62 but the local final rerun passed 61/62: the Signage browser test read a parked disclosure as closed, then clicked its summary after navigation had mounted and opened it, closing the form. The test now waits for the mounted, open Settings form instead of racing its automatic opening. Token/privacy assertions and the product's user-controlled disclosure behaviour remain unchanged. The updated head requires its own checks; the earlier CI pass is not transferred.

All commands use `TZ=Asia/Singapore`. Local browser commands additionally use `PLAYWRIGHT_BROWSERS_PATH=/tmp/gsis-pw`, `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` and `LORD_TEST_CHROMIUM=/usr/bin/chromium` where supported. The exact-head PR evidence records canonical build, no tracked production drift, focused product tests, unchanged Core/Contacts regressions, full Node/LORD checks, all nine Worker dry-runs, artifact verification and runner discovery. A development pass is not a final-head pass.

No merge, deployment, provider activation, school-data import, Google archive write or live deletion was performed for this queue. F5 remains **OPEN**; official **T1B-01/T1B-02 remain Not tested**. Hosted UAT, real Google permissions, school-size operating behaviour and durable hosted restore remain **Not tested** until separately performed and evidenced. Local archive verification does not certify physical device return or make independent databases and providers atomic.
