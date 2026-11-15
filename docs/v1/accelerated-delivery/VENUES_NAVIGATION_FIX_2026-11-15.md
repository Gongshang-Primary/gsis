# B-V01b — Venues query navigation

Status: implementation and local focused/regression/build checks complete; publication, child exact-head CI and Claude review pending. Updated 15 November 2026, 14:12 Asia/Singapore. Codex builds, ChatGPT coordinates v1 and Claude independently reviews the exact published head. No merge or deployment is authorised.

## Exact references and scope

| Record | Exact reference |
| --- | --- |
| Frozen implementation parent | [`01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef`](https://github.com/helper-gsps/gsis/commit/01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef), `codex/v1-deploy-venue-source-fence-budget`, PR #170 |
| Accepted main claim | [`56391d911d8ba24bd1235111380871bb7ca772f4`](https://github.com/helper-gsps/gsis/commit/56391d911d8ba24bd1235111380871bb7ca772f4) |
| Claim incorporation before implementation | `5ee27aa5db075c44361150b6f2de3e491345c8a6`, tree `4838d0bfa356c938dd3b8adc0b7c292137c8b153` |
| Branch and task | `codex/v1-venues-subpath-navigation`; [accepted four-path task](../../coordination/tasks/v1-venues-subpath-navigation.md) |
| Discovery | [`ec6267b62cbca6c774e4895dfab7a422e56af804`](https://github.com/helper-gsps/gsis/blob/ec6267b62cbca6c774e4895dfab7a422e56af804/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md), `codex/v1-uat-run-b-20261115`, B-V01 |
| Requirements | [Accelerated spec at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`](https://github.com/helper-gsps/gsis/blob/f39b671ac6da3f389c58345ce4f5c035f1cb3f65/docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md), sections 2 and 4; current root/v1 instructions |
| Implementation head / PR | Pending publication; the final exact SHA and CI belong in the PR evidence |

Before claiming, the coordinator refreshed main, all branches/claims, CI, discovery/review heads and actual file inventories of all 30 open PRs. Main was `91811d9aa893a73026d53ad703bba1aef107a890`; Claude's branch was `58e22a7bf7ba4a49caa2caabe877605153b098db`. Builder overlaps were frozen same-builder PRs #161/#163/#165/#166/#168, inherited by the selected parent. No concurrent builder editor was identified. This claim changes no production coordination responsibility.

The actual change inventory is exactly these four paths:

- `scripts/v1/build-web.mjs`
- `tests/v1-product-venues-navigation.mjs`
- `docs/coordination/tasks/v1-venues-subpath-navigation.md`
- `docs/v1/accelerated-delivery/VENUES_NAVIGATION_FIX_2026-11-15.md`

## Problem and bounded repair

Native Venues `changeURL()` writes `/?view=admin` from `/venues/`; the displayed Administration view works until reload serves the launcher. Book/date and dashboard/room-selection callers have the same root-path defect. The gateway already redirects `/venues` to `/venues/` with query intact and serves a correct direct module URL.

The implementation adds one checked replacement in the existing Venues `app.js` build transform: it changes `history.replaceState(null,'','/?'+p);` to `history.replaceState(null,'','/venues/?'+p);`. The existing query construction, room order/encoding, field omission and `replaceState` behavior are preserved. No new router/history entry, arbitrary-query persistence, gateway change or original v0.9 source edit is needed. Copy dashboard link uses the corrected native URL. Existing protected-state, source-window, logout and inherited module adaptations remain intact.

This is presentation routing. It creates no record, grants no capability and changes no owner transaction, source fence or data model. Native permission checks still govern the Admin view; Core governs session/logout. Booking/transfer path deep links, initial canonical-register setup and occupancy/source readiness are separate scopes.

## Verification evidence

All local checks use `TZ=Asia/Singapore`; browser checks also set `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`.

| Check | Actual outcome |
| --- | --- |
| Pre-change investigation: `node /tmp/gsis-venues-navigation-probe.mjs` at parent `01c1db1…` | Eight observation groups, 14.679s. Actual built UI and nine local Workers reproduced native Admin writing `/`, reload into launcher and defective copied dashboard URL. This asserts the old defect, not the repaired behavior. |
| Investigation negatives | Correct direct module URLs, reader denial, real Core logout/401, protected-state clearance, unavailable source/disabled booking and 390px layout worked. No page errors, failed local assets or external egress; only reads, explicit logout and normal login-challenge initialization. Two rooms and accounts were synthetic fixtures. |
| Investigation harness corrections | Initial nonexistent readiness label and intermediate logout-navigation wait were corrected in the temporary probe. Product code was not changed. Logs remain `/tmp/gsis-venues-navigation-probe-initial.log`, `-second.log` and final `.log`; details `/tmp/gsis-venues-navigation-investigation.md`. |
| Baseline `npm run build` | Pass: 18 canonical components, no tracked generated drift at incorporated claim tree. `/tmp/gsis-venues-navigation-canonical-base.log`. |
| `node tests/v1-product-venues-navigation.mjs` | Meaningful red before the fix: expected `/venues/`, observed `/` and launcher after reload; exit 1 in 8.617s. First green: eight groups in 13.571s. Final formatted program: **8/8 in 13.592s**, exit 0; `/tmp/gsis-venues-navigation-{red,green1,final}.log`. |
| Eight unchanged regression programs, each `node tests/<file>` | All passed, exit 0. Exact programs/results below; `/tmp/gsis-venues-navigation-regressions.log`. |
| Final `npm run build`; `git status --short`; `git diff --check` | Pass: 18 canonical components, no tracked generated drift, exactly the four allowed paths, clean whitespace. `/tmp/gsis-venues-navigation-canonical-final.log`. |
| `node scripts/v1/test.mjs --list`; `node tests/run.cjs --list` | 87 product and 1,186 Node programs; the new focused program appears in both. `/tmp/gsis-venues-navigation-{product,node}-list.json`. Discovery is not a full-suite run. |
| `node --check scripts/v1/build-web.mjs`; `node --check tests/v1-product-venues-navigation.mjs` | Both pass. |
| Child full Node/LORD and product/build CI; Claude review | Pending publication and exact-head evidence |

The parent's [full CI43682564064](https://github.com/helper-gsps/gsis/actions/runs/43682564064) passed 1,185 distinct Node programs and 40 LORD checks per shard. Parent [product/build CI43683326122](https://github.com/helper-gsps/gsis/actions/runs/43683326122) has also passed all 86 parent product programs; PR #170 is ready for Claude. Neither substitutes for this child's checks.

The unchanged regression commands were `node tests/v1-product-navigation.mjs`, `node tests/v1-product-web.mjs` (25 cases), `node tests/v1-product-web-browser.mjs` (actual nine-Worker screens/workflows), `node tests/v1-product-v09-frontend-parity.mjs`, `node tests/v1-product-contacts-recovery-browser.mjs` (eight groups), `node tests/v1-product-deploy-fortnight-browser.mjs` (six groups, synthetic transport), `node tests/v1-product-asc-subject-identity.mjs` (seven groups) and `node tests/v1-product-lord-cart-groups-browser.mjs` (19 groups). Their durations were 2.263, 3.292, 17.868, 3.633, 26.909, 4.522, 4.283 and 18.337 seconds respectively. Existing assertions/timeouts were retained. No complete local 87-product or 1,186-Node/LORD run is claimed here; required child full suites remain CI gates.

The focused test used actual built UI/gateway/Core/Venues and Chromium, with synthetic accounts and two synthetic rooms. All four native views survived reload. It covered booking date, dashboard dates/room selection/clear, actual clipboard URL, unchanged history length with real-document Back/Forward, reader denial, owner403, native logout/Core401, protected-state clearance, root/other-module isolation, unavailable source and disabled booking. All 78 local POSTs were read requests, explicit logout or normal login-challenge initialization; no Venues commands, external requests, page errors or failed assets. Browser routes were drained before runtime shutdown. No successful owner route was mocked for this proof.

Screenshots and machine-readable results are under ignored `deliverables/v1/evidence/venues-navigation/`: `admin-desktop.png`, `book-narrow.png`, `admin-narrow.png`, `admin-reload.json` and `results.json`. The actual nine-Worker regression also wrote its evidence to `deliverables/v1/evidence/browser/`. At 390px, the inherited native navigation strip scrolls horizontally: Administration may be partly offscreen after direct reload until scrolled/clicked. The selected view/title/content remain correct and there is no page-level horizontal overflow. This repair does not redesign the native strip.

Frozen code SHA-256: builder `62f41ac558999ae9b3a15ac13d9cc85794b0ca765e79450f9460746d18a84ce4`; focused test `c6c99ba50f70cdc640fc68cb22b97411029c18df01c62ffe5f42d3412d2c504c`. Original Venues app remains `0bcd104fb90ee62571e1cc1627fc22ab9e82e69a606d5b4d0458e3cfb5a83d5d`. These identify tested working-tree files; they are not an invented implementation commit SHA. The published exact head and its full CI/review evidence belong in the PR.

## Gates, limitations and rollback

Q01 Pass: accepted/incorporated claim, bounded inventory and refreshed overlap evidence. Q02–Q05 Pass for this bounded presentation change: one owner/copy transformation, actual denial/session negatives, unchanged replaceState/history semantics and bounded 13.592s focused program. Owner transaction/retry changes are not applicable. Q06 local evidence Pass as listed; full child exact-head suites remain Pending. Q07 Pending: final PR/head and Claude review. Q08 Not applicable to deployment. No external skill execution is claimed for documentation preparation; repository principles were applied without copying third-party material.

Rollback reverts the v1 builder substitution and restores the defective root query URL; no database or migration action is needed. Hosted navigation has not been retested by this work. Local synthetic routing evidence cannot establish completed migration, verified occupancy, publication or runtime acceptance. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Next deployment remains v1.01, under separate authority.
