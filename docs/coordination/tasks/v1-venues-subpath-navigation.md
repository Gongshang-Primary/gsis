# v1-venues-subpath-navigation: B-V01b preserve Venues routing on reload

- Status: merged through PR175; PR171, reviewed head `eb63f820b3d9a78fdeec528bfe0c0d990bc17db0`, carrying merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
- Owner/model: Codex; coordinator ChatGPT for v1; independent exact-head reviewer Claude.
- Updated: 15 November 2026, 14:12 Asia/Singapore.
- Branch: `codex/v1-venues-subpath-navigation`.
- Read-only source baseline: `f14543449882b47774dc2799298d8d0c1382dbb3`, frozen `codex/v1-deploy-venue-uses`, PR #169. This is inspected source, not the selected future implementation parent.
- Implementation parent: frozen B-D03 `01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef`, branch `codex/v1-deploy-venue-source-fence-budget`. PR #170 is open at this exact head. Full Node/LORD CI43682564064 is green (1185 distinct Node programs, 40 LORD per shard); product/build CI43683326122 is now green (86 parent product programs); Claude review remains pending. Parent evidence is not child verification; do not amend the frozen branch.
- Accepted main claim: `56391d911d8ba24bd1235111380871bb7ca772f4`; re-read and incorporated before implementation at `5ee27aa5db075c44361150b6f2de3e491345c8a6`, tree `4838d0bfa356c938dd3b8adc0b7c292137c8b153`. Implementation head, PR and exact-head verification remain pending.
- Discovery: Run B `ec6267b62cbca6c774e4895dfab7a422e56af804`, `docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md`, 12:00–12:07 SGT continuation and B-V01. Admin navigation was observed changing the URL to `/?view=admin`, so reload can lose the module.
- Authorisation boundary: next bounded task selected by ChatGPT as v1 coordinator in the continuing owner-authorised frontend UAT queue. The predecessor is frozen and handed forward; this main claim must be accepted/re-read/incorporated before edits. No live operation is authorised.

## Exact four-path scope

1. `scripts/v1/build-web.mjs`
2. `tests/v1-product-venues-navigation.mjs`
3. `docs/coordination/tasks/v1-venues-subpath-navigation.md`
4. `docs/v1/accelerated-delivery/VENUES_NAVIGATION_FIX_2026-11-15.md`

The v1 builder owns the copied frontend adaptation. Venues retains its native view/query serialization, selection and permission rendering. Core/gateway retain session, authorization and static routing. No original `venues-viewport/public/` edits, shared client/shell, gateway, owner service, schema, configuration, dependency, generated tracked output, import, occupancy or source-fence changes. No new navigation framework, router, `pushState`, `popstate` handler or deep-link protocol. No merge, deployment, migration, live read/write or provider send.

## Refreshed start gates and claim-first sequencing

After PR170 opened, main, all branches, claims, CI, review/discovery heads and actual file inventories of all 30 open PRs were refreshed. Main is `91811d9aa893a73026d53ad703bba1aef107a890`; Run B is `ec6267b62cbca6c774e4895dfab7a422e56af804`; Claude review branch is `58e22a7bf7ba4a49caa2caabe877605153b098db`. Builder overlaps are frozen same-builder PRs #161/#163/#165/#166/#168, all inherited by the selected parent. No competing implementer or concurrent builder editor was identified. Current root/v1, coordination and engineering instructions were read; production responsibilities remain separate.


The accepted claim advanced main from the refreshed `91811d9…` to `56391d9…`. It was re-read and incorporated into the frozen B-D03 parent at `5ee27aa…` before implementation. Parent CI/review statuses remain separate from this child. If source or overlapping allocation changes, reassess the affected work before editing.

The builder contains Contacts recovery, Deploy saved-draft/Fortnight/ASC, LORD cart/preflight and B-R01 recovery adaptations. Preserve them all. The prior known chain is PR #168 `ecaa37e87bc34ba85b8d3649184b0279e973539d` followed by #169 `f14543449882b47774dc2799298d8d0c1382dbb3`; the selected B-D03 descendant is the exact head above. No concurrent builder editor is allowed without an explicit handoff.

## Pinned source and policy evidence

| Source | Finding |
| --- | --- |
| `venues-viewport/public/app.js:8` at `f145434…` | Startup accepts only book/mine/dashboard/admin; parses date/from/to/rooms from the URL. |
| Same file, line 29 | Exactly one `history.replaceState(null,'','/?'+p);` in `changeURL()`. Book writes view/date; dashboard writes view/from/to and nonempty rooms. Mine/admin write view. It intentionally rebuilds supported query fields. |
| Same file, lines 37, 73–74 and 115 | Date changes, room selection/clear, Show bookings, Copy dashboard link and native tab buttons call that function. |
| Same file, lines 33 and 91 | Native render marks selected navigation/title and gates Administration/Manage rooms using server-derived permissions. Query parameters do not grant authority. |
| `scripts/v1/build-web.mjs`, existing `module.id==='venues' && rel==='app.js'` block at line 922, `f145434…` | Already adapts shared logout, protected-state clearing, exact source-fence interval display and bounded occupancy windows. It does not adapt `changeURL()`. |
| Same builder, `replaceOnce()` at line 40 | Existing checked replacement fails on missing source text. Reuse it; do not broaden or rewrite the global helper. |
| `v1/runtime/gateway.mjs:131–150` at `f145434…` | `/venues` redirects to `/venues/` with the query preserved. Static module fallback serves `/venues/index.html`; `/` remains the launcher. No gateway repair is needed for this query-navigation defect. |
| Accelerated spec v1.1 at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`, sections 2 and 4 | Preserve familiar navigation and responsive behavior; links/assets/direct refresh must work beneath module subpaths. URL parameters do not replace server permission/session checks. This spec is read from its pinned requirements branch, not merged to obtain instructions. |
| `docs/v1/AGENTS.md`, `docs/v1/engineering/QUALITY_GATES.md` and `PARITY.md` at inspected parent | Claims/exact-head review, meaningful changed-flow browser verification, checked source-copy adaptations and unperformed-UAT disclosure remain required. Refresh current instructions before claiming. |

An actual nine-Worker/Chromium probe at frozen `01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef` now reproduces native Admin changing the path to `/` and reload serving the launcher, plus the same copied-dashboard URL defect. Eight observations completed in 14.679s. Core session/logout, reader denial, correct direct URLs, unavailable-source blocking and 390px layout remain sound. See `/tmp/gsis-venues-navigation-investigation.md` and executable `/tmp/gsis-venues-navigation-probe.mjs`; this asserts existing broken behavior, not a repaired test pass. Its initial label mismatch and intermediate logout navigation wait were probe-harness errors, both retained in its evidence. Future tests must assert `Facilities administration`, final logged-out state/Core401, and allow normal login/start challenge initialization.

The previous source-only probe `/tmp/gsis-discovery-pr167/source-probes.mjs` reproduced the root URL. This read-only preparation confirmed the target literal occurs once in the source and is absent from the builder adaptation; source has zero `pushState` and zero `popstate` occurrences. The newer actual local browser probe above supersedes the prior source-only evidence; no hosted test ran.

## Implemented change

Inside the existing Venues/app.js transform, one added `replaceOnce` call replaces:

```js
history.replaceState(null,'','/?'+p);
```

with:

```js
history.replaceState(null,'','/venues/?'+p);
```

The checked replacement has a specific Venues subpath label. The focused test verifies the original and built occurrences. The global helper and original source remain unchanged; no whole-file reformatting or tracked generated edit was made.

Use the fixed trusted module path, not a query-supplied base or current pathname. Preserve `URLSearchParams`, all current field inclusion/omission rules, room order/encoding and `replaceState(null, '', ...)`. Do not start preserving arbitrary extra query keys or add fragments/history entries as part of this fix. Copy dashboard link will naturally copy the corrected URL through its existing caller.

The existing `/b/<id>` and `/r/<id>` source path parser is separate from this query-navigation flow; this repair neither changes it nor claims booking/transfer deep-link parity. Any demonstrated issue there needs its own discovery record and scope decision.

## Browser acceptance and existing helpers

Create one focused program using the existing `tests/v1-product/suite.mjs` `productSuite()` and `seedAccount()`, actual built assets, actual local gateway/Core/Venues and Playwright Chromium. Reuse the routing/cookie pattern from `tests/v1-product-web-browser.mjs`: intercept only the synthetic origin and forward to `suite.mf.dispatchFetch`; block external egress. Do not replace the app, session or Venues responses with a mock success to prove reload behavior. One runtime with reused contexts should fit the unchanged 45-second limit.

No authoritative venue migration is needed. Begin with an empty synthetic register/source-unavailable state, then seed at most two explicitly synthetic owner records if room-selector coverage requires it. This creates no occupancy or ready-source assertion. Preserve fixture/source distinctions in the evidence.

1. Red before repair: open built `/venues/`, use native Administration, observe path `/`, and reload into the launcher. Assert the defect instead of compensating for it in routing. Do not run a red and green product runtime for every view.
2. Green native views: click Book a venue, My bookings, Room dashboard and Administration; after each check `/venues/`, supported query values, selected native button/document title, then reload and verify the same view. Use the existing `.main-nav [data-view]` selectors. Confirm `/venues?view=admin` still redirects to `/venues/?view=admin` using the unchanged gateway.
3. Query/clipboard: exercise `[name=bookingDate]`; dashboard From/To plus Show bookings; select/clear the two stable room IDs. Verify exactly the existing view/date/from/to/rooms serialization and no stale fields from other views. Copy dashboard link must produce the `/venues/` URL; where clipboard permission is unavailable, assert the existing fallback address and warning, not fabricated copy success. Reload a valid dashboard URL and retain its date range and room IDs. Do not add unrelated query persistence.
4. History: start from `/`, navigate normally to `/venues/`, record history length, then change native views/filters. The length must not grow from those actions. Back returns to the preceding real document; Forward returns to the final replaced Venues URL/view. No per-tab Back stack is promised or introduced.
5. Permissions/session: an account with Venues read but no admin must not gain administration from `?view=admin`; native denial/hidden control and backend permissions remain. Use actual shared logout and verify Core session invalidation and protected state clearance; reloading the module cannot restore authorised private content. Do not change logout's intentional launcher destination. Unexpected session defects are reported, not silently folded into this routing patch.
6. Empty/pending source and narrow view: navigation/reload works while availability is unavailable, with existing warning and disabled booking behavior intact. At 390px, native navigation remains reachable, selected view survives reload and there is no new horizontal overflow caused by the change. Capture desktop/narrow navigation evidence under ignored `deliverables/v1/evidence/venues-navigation/`.
7. Isolation: root `/` still displays the launcher; other module paths and APIs remain unchanged. No Apps Script or external egress, unexpected page errors, failed local assets or mutation requests beyond explicit fixture/logout actions. Assert the original Venues source bytes are unchanged.

Drain routed requests with `context.unrouteAll({behavior:'wait'})` before closing contexts/browser and the product runtime, following `tests/v1-product-web-load.mjs`; do not swallow active-operation failures. `tests/v1-product-navigation.mjs` covers synthetic shell placement, so retain it but do not mistake it for actual gateway reload evidence.

## Verification, limits and handoff

Actual local checks use `TZ=Asia/Singapore` and browser checks add `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. The [handoff](../../v1/accelerated-delivery/VENUES_NAVIGATION_FIX_2026-11-15.md) records exact commands, groups, timings, screenshot paths, inherited limits and tested file hashes.

- Test-first red: new `tests/v1-product-venues-navigation.mjs` failed before the builder change in 8.617s, observing `/` and launcher on Admin reload. First green passed eight groups in 13.571s; final formatted program passed **8/8 in 13.592s**. Logs `/tmp/gsis-venues-navigation-{red,green1,final}.log`.
- Eight unchanged regression programs passed: navigation, shared web (25 cases), actual nine-Worker browser, v0.9 frontend parity, Contacts recovery (eight groups), Fortnight (six groups), ASC identity (seven groups) and LORD cart browser (19 groups). `/tmp/gsis-venues-navigation-regressions.log`.
- Baseline and final `npm run build` passed all 18 canonical components with no tracked generated drift. Syntax checks for both JavaScript files and `git diff --check` passed; final inventory is exactly the four claimed paths. `/tmp/gsis-venues-navigation-canonical-{base,final}.log`.
- Runner discovery lists 87 product and 1,186 Node programs, including the new test in both. These counts are discovery, not a local full-suite pass. Child full Node/LORD/product CI, PR and Claude exact-head review remain pending publication; parent passes are not child verification.

This presentation repair changes future query navigation only. Rollback restores the defective root URL; no schema/data action is needed. At 390px the inherited horizontally scrolling native strip can leave Administration partly offscreen after direct reload; selected view/title/content are correct, controls remain reachable and there is no page overflow. The patch does not redesign that strip. Initial register setup, source readiness, uses metadata, source-fence budgets, publication recovery and booking/transfer path deep links remain separate scopes. Local synthetic routing checks do not establish hosted UAT or completed migration.

Q01 Pass: accepted/incorporated claim and overlap evidence. Q02–Q05 Pass for the bounded presentation change, unchanged ownership/history and actual permission/session negatives; no owner mutation or retry contract changes. Q06 local checks Pass, required full exact-head CI Pending. Q07 Pending publication/review. Q08 Not applicable to deployment. F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. No live product was fetched or changed by this task. Next deployment remains v1.01 under separate authority.

Skill record for documentation preparation: repository engineering/skill principles were applied; no external skill was executed or represented as installed. No third-party material was copied.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR171](https://github.com/helper-gsps/gsis/pull/171) at reviewed head `eb63f820b3d9a78fdeec528bfe0c0d990bc17db0` is included in main by [merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`](https://github.com/helper-gsps/gsis/commit/334731cdb1d4fc5d37d7bdf6de761d668c062994). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/afeba886cd97f365cfb530200bcf46309812cd1b/docs/coordination/review/v1-pr175-chain-claude-recheck.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

The owner amended the sequence to merge PR175 once, preserving all eleven reviewed heads. This head is an ancestor of that carrying merge; it was not separately reimplemented or resolved by hand. The resulting product tree equals the tested tree outside two review documents. [The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
