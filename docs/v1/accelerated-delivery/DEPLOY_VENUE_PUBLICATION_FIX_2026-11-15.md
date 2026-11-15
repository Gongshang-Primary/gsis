# v1 Deploy venue publication fix — 15 November 2026

Bug: **V1-20261115-01**, owner-reported inability to publish with “Refresh current venue metadata before publication” and a disabled retry button. Queue: PR159. Claim: [v1-deploy-venue-publication](../../coordination/tasks/v1-deploy-venue-publication.md), main `bef1ac8c1d5e310a3468b92b72da38d59e49aeb1`. Branch: `codex/v1-deploy-venue-publication`. Model: Codex; coordinator: ChatGPT (v1); independent reviewer: Claude.

Status: implemented and focused checks passed; full committed-head verification and independent review remain recorded in the PR. No merge or deployment. Source base `8ec2315a162fcf48bbb5161572abbb51a3df53ed`; the base application tree is unchanged from `26bbccd229962700409bb6e9c80b1e9bec170d20`. The PR records the exact tested implementation head.

## Evidence and resulting behaviour

The screenshot's original receipt, running build and data-clone transformation have not been inspected. The separate “data clone UAT ledger” project conversation remains unavailable through current tools; owner asked for its entries or Git handoff. This fix does not claim to repair every clone/import issue or implement the separate Contacts redesign in PR158.

Actual isolated Worker/D1 tests reproduce three gaps in the base source:

1. Publication review accepts a saved version whose referenced rooms lack venue revision evidence.
2. The existing explicit venue refresh replaces room rows and drops Deploy-owned `form`/`forms` assignments.
3. Direct publication freezes an immutable payload before the missing venue evidence is rejected through Venues' source-fencing callback.

The bounded fix validates room reference evidence before review succeeds and before new immutable publication preparation. Explicit refresh obtains canonical metadata from Venues using exact room IDs and preserves Deploy's planning assignments. Missing/invalid canonical evidence must fail without altering the draft. The dialog provides a refresh/review path and binds publication to the confirmed saved revision; refresh and publication remain separate user actions. Original uncertain operations retain their identities and require receipt recovery. An existing prepared payload is never silently replaced under the same operation ID.

Venues remains authoritative for room metadata. Deploy remains authoritative for assignments and publication. Current revision checks, source fences, school isolation and permission enforcement remain required; no fabricated revision, inferred authority, cross-D1 atomicity or live success claim is introduced. No new schema or migration.

## Verification ledger

All commands use `TZ=Asia/Singapore`. Browser tests use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` locally. Synthetic identities and isolated local stores only.

| Check | Actual result |
| --- | --- |
| Initial canonical `npm run build` at claim source | Pass; no tracked drift before implementation. |
| Red reproduction: `node tests/v1-product-deploy-venues.mjs` against claim source | Expected failure (exit 1): review returned 200 for incomplete references; refresh erased form mappings; rejected direct publish left a prepared payload. |
| Focused service regressions | Pass: `node tests/v1-product-deploy-venues.mjs` (eight real local Worker/D1 groups) and `node tests/v1-product-deploy-storage.mjs` (existing coverage plus malformed/wrong-school source, missing room, outage, concurrent edit and receipt replay). |
| Built mobile/browser regression | Pass: `node tests/v1-product-deploy-venue-ui.mjs`, six actual built-browser/Worker groups including dirty notes, version guard, lost lease/refresh/publication responses, aborted/unknown/committed receipts, concurrent revision change, modal/session fencing and genuine lease contention followed by recovery. The new test reproduces the missing recovery action against the old UI. |
| Unchanged Core/Contacts regressions | Pass: all 12 `tests/v1-core-*.mjs` / `tests/v1-contacts-*.mjs` programs, 56/56 cases. |
| Product and existing runner discovery | Pass: `node scripts/v1/test.mjs --list` and `node tests/run.cjs --list`; both new tests selected, 75 product / 1,174 full programs. |
| Final canonical build and exact seven-path scope | Canonical `npm run build` passes without generated drift; seven-path allowlist and local documentation links checked before commit. |
| Full product programs | Pending. |
| Full existing Node/LORD suite and exact-head CI | Pending. |
| Independent Claude exact-head review | Pending. |
| Authenticated hosted/runtime UAT | Not tested. |

Unchanged LORD checks pass 40/40 with `LORD_TEST_CHROMIUM=/usr/bin/chromium` (also `ROSTER_TEST_CHROMIUM` and `GSIS_BROWSER_EXECUTABLE` for the other runners). Two earlier local attempts stopped at browser launch because the default Playwright binary was absent; setting only the Roster/GSiS overrides did not satisfy LORD's separate override. The failed logs remain `/tmp/gsis-deploy-venue-lord.log` and `/tmp/gsis-deploy-venue-lord-browser-configured.log`; the passing run is `/tmp/gsis-deploy-venue-lord-final.log`. No assertion was removed. New fixture setup was corrected for synthetic Google configuration, valid class metadata, the owner's actual adopted-fence state and disposal after restart; these are not claimed as product defects.

The table records pre-commit working-tree checks. Final committed-head results, CI links and the exact SHA are recorded in the implementation PR; a pending entry here is not a claimed pass. Internal peer inspection is not Claude approval.

Final local focus command after pinned Prettier 3.6.2 formatting: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium bash -c 'node tests/v1-product-deploy-venues.mjs && node tests/v1-product-deploy-storage.mjs && node tests/v1-product-deploy-venue-ui.mjs'`; exit 0, `/tmp/gsis-deploy-venue-focused-final.log`. No tracked dependency change. Internal review caught and resolved misleading refresh receipt wording, lost preparation-lease identity, delayed-response/modal overlap and a terminal lease conflict retry trap. A new lease is permitted only after the original lease's terminal outcome is confirmed. Attempt memory lasts for the current browser page; no new client-side persistent ledger is claimed.

## Recovery, rollback and remaining gates

No live receipt was checked and no live publication was retried. A recorded prepared/unknown operation is not proof of failure or success; use its existing recovery path before any new intent. A source refresh must not overwrite an unresolved publication payload or discard a local draft. Confirmed rejection/abort, pending/unknown and committed receipt cases need separate assertions; downstream delivery remains independent of the publication commit.

Rollback reverts the bounded service/UI change. It does not roll back published data, erase receipts, remove audit evidence or alter existing stores. Restoring the old refresh path would reintroduce its mapping-loss defect. Claude review, exact-head checks and separately authorised merge/deployment remain gates.

F5 stays **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. The inaccessible UAT ledger is a separate incomplete input, not an empty or cleared queue.
