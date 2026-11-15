# v1-contacts-projection: canonical Contacts projection and current Deploy eligibility

- Status: merged through PR175; PR173, reviewed head `f7f9ea2b0a6c7667e128a0752ad2c6f3551b91dd`, carrying merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
- Last updated (Asia/Singapore): 15 November 2026, 15:50.
- Owner/model: Codex. Coordinator: ChatGPT for v1. Independent exact-head reviewer: Claude.
- Branch: `codex/v1-contacts-projection`.
- Owner authority: continue the frontend UAT repair queue, one bounded group at a time, refreshing Git discovery recursively. This authorises implementation, tests and an implementation PR within the sixteen paths below. No merge, deployment, live settings/data writes, migration, live Contacts acceptance or provider activation.
- Frozen parent: [`d3d76fc571fecbcd335ee9c5552ca869fd329a3a`](https://github.com/helper-gsps/gsis/commit/d3d76fc571fecbcd335ee9c5552ca869fd329a3a), tree `48264d153aaa4f8d27a7ebc36a1edeb2703c14b4`, branch `codex/v1-roster-admin-settings`. It inherits Venues navigation `eb63f820b3d9a78fdeec528bfe0c0d990bc17db0`, B-D03 `01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef`, B-R01 recovery and the preceding Contacts recovery fixes. Parent CI/review is pending; none of its checks counts as this task's evidence.
- Refreshed main before prospective claim: `52468a2c6573aaf77a803c88346a09100c0b4590`. Latest discovery: Run B `1a00d6f94a4caa3ceac85930ecc859353887d8f1`; Claude branch `claude/beautiful-dirac-uiflqu` at `58e22a7bf7ba4a49caa2caabe877605153b098db`.
- The coordinator refreshed the actual files of all31open PRs this turn. The only current overlap is frozen inherited work owned by the same builder; no editor remains on it. ChatGPT permits this serial successor after the parent's source freeze while its automated checks/review remain pending. Never amend the frozen parent.
- Before edits: publish this claim through the existing expected-head workflow, re-read the accepted claim/main, refresh actual competing files and immediately incorporate the accepted claim into the selected parent. Record the resulting branch/base/head. No cherry-pick of private patches or reset to an older builder/client.

### Accepted-claim checkpoint

The preceding discovery and pre-edit instructions record the claim's original sequence. The coordinator published the claim on main at [`4d7aa7c216edd9e15f4899702d8f02623e3fa4cd`](https://github.com/helper-gsps/gsis/commit/4d7aa7c216edd9e15f4899702d8f02623e3fa4cd), then incorporated it into frozen parent `d3d76fc571fecbcd335ee9c5552ca869fd329a3a` before source edits. Local incorporation is `cf399969f3a43b6c8912e42dfc3162aa4311126e`; its public equivalent is [`0d8e974044a2ef8e234a0d6c3c042d415605c89c`](https://github.com/helper-gsps/gsis/commit/0d8e974044a2ef8e234a0d6c3c042d415605c89c). Both have complete tree `c89b4bfc3f07ef65131d7522030ed4dd4d5a6066`. Worktree: `/workspace/gsis-v1-contacts-projection`, branch `codex/v1-contacts-projection`. Neither incorporation is an implementation or tested final head.

The [projection contract](../../v1/contacts/PROJECTION_CONTRACT.md) records the ownership, formatting, selected facts, eligibility and recovery boundaries. The Deploy field whitelist contains **thirteen** fields; names and permanent ID are separate top-level fields. The sixteen-path file allowlist is unchanged.

Subsequent recursive discovery after PR172 found Run B [`4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd`](https://github.com/helper-gsps/gsis/blob/4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md), adding RUN-B-022–024. RUN-B-022 reports completed182-record reconciliation by the separate migration actor; this task neither performed nor independently certified that live operation. RUN-B-023 reports classification-editor selection/data loss and remains a separate fix, outside this claim. RUN-B-024's467 blank EXT/iCON/CES cells recheck the projection problem addressed here; its new signature designation/formal-role mapping defect and role-label authoring remain separate. These reports grant no live-data authority or allowlist expansion. Source inventory is now48 IDs; facets of existing B-V01 are not additional source IDs.

## Requirements and bounded outcome

Read root/v1 instructions, current workflow/lanes/status, owner directives, deployments, engineering policy and relevant Claude review branches. Production responsibilities and release restrictions stay unchanged.

Controlling source: [PR158 direct-authority job](https://github.com/helper-gsps/gsis/blob/16b718600d9a391afe90c00df5129095c73f8b57/docs/v1/contacts/DIRECT_AUTHORITY_CODEX_JOB_2026-11-15.md), exact pin `16b718600d9a391afe90c00df5129095c73f8b57`; Revision49 specification and staged addendum; accelerated specification `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`; existing EO/readiness owner decisions. This task is the bounded **A projection/eligibility** slice. **B catalogue-free direct authoring remains separate** and is not implicitly authorised here.

Repair current schema1 Contacts display, expected-value and export parity through one pure projector. Supply the accepted/effective facts Deploy actually consumes. Require current eligible teaching facts for new/repointed planning references while preserving inactive, excluded and unresolved historical identities/assignments. Preserve current schema1 writers, catalogue ownership, acceptance and recovery.

## Exact sixteen-path allowlist

```text
v1/services/contacts/grid-projection.mjs
v1/services/contacts/service.mjs
v1/services/contacts/grid.mjs
v1/services/deploy/model.mjs
v1/services/deploy/service.mjs
v1/runtime/drive-backup-data.mjs
v1/web/shared/client.js
scripts/v1/build-web.mjs
tests/v1-product-contacts-projection.mjs
tests/v1-product-contacts-projection-browser.mjs
tests/v1-product-drive-backup.mjs
tests/v1-product-deploy-storage.mjs
tests/v1-product-deploy-workbooks.mjs
tests/v1-product-web.mjs
docs/v1/contacts/PROJECTION_CONTRACT.md
docs/coordination/tasks/v1-contacts-projection.md
```

New paths are the pure projector, two focused tests, contract and task. The others already exist. No Contacts store/schema/authority files, Core/runtime admission, SQL/migrations, workbook codec, shared legacy domain, native source frontend, Roster/Calendar services, infrastructure/configuration, CI/dependencies or generated-output changes. A necessary additional path requires a demonstrated counterexample and coordinator scope decision before that edit; continue independent authorised work.

## Source findings and implementation contract

### One privacy-preserving Contacts grid projection

Current browser and Drive formatters read nonexistent `extension`, derive dedicated email columns from general aliases and fill blank EO Appointment Level from `eo`. Grid expected-value formatting differs in email domain case, birthdays and name fallback. Centralise these rules in the pure projector after existing `publicStaff` privacy filtering; no SQL, authority inference or acceptance belongs in it.

- Preserve the public17-column order beginning Basic Name then TTb Name; preserve existing FIELD_MAP/GRID_FIELDS exports and workbook/baseline formats. Internal FIELD_MAP insertion order differs and must not become public column order. Avoid circular imports.
- Read canonical `ext`, `email`, `iconEmail`, `cesEmail`. Show a local part only for the expected domain, case-insensitively; preserve full stored addresses and local-part spelling. Use the owning configuration for the school alias domain and existing fixed iCON/CES domains. Wrong-domain/malformed values remain visible or fail existing validation; never rewrite them silently.
- General `aliases[]` is not a dedicated editable-field fallback. Clearing a dedicated value cannot resurrect another alias. EO Appointment Level comes solely from its own accepted/effective field; EO=true with blank appointment stays blank.
- Preserve unknown/null distinctions, Basic/TTb fallback, birthday formatting and literal formula-looking text. Schema1 cells retain canonical reference codes, including duplicate-label/retired assigned definitions; labels are not identity.
- Service, expected-value comparison and Drive Staff workbook consume the same pure formatter. Browser consumes completed rows while preserving independent bootstrap capability/role/people adaptation: the current early return for preformatted rows must not bypass that adaptation.
- Keep computed/editable/self-service rules, conversion/validation, contribution and acceptance behaviour, 64-cell/16-staff save bounds and original durable request recovery unchanged.

### Purpose-specific accepted facts and normalized Deploy inventory

Contacts service currently discards `fields` while Deploy mergeContacts expects accepted/effective records; existing native-profile test doubles hide this mismatch. Add only the Deploy-purpose selected-field whitelist below, with state/value/effective/revision/valid interval/revocation evidence as needed. Reuse existing record selection, strip timelines and preserve school/schema/revision/as-of/dependencies.

Approved fields: `role`, `eoAppointmentLevel`, `appointmentStatus`, `employmentActive`, `schoolSection`, `employmentArrangement`, `employmentTags`, `subjectTags`, `mkTags`, `memberships`, `eo`, `smc`, `schoolLeader`. Basic/TTb names and permanent Staff ID already have explicit top-level fields. Do not expose statutory names, birthdays, mobile/email/aliases, signatures or full timelines to obtain those names/facts. Keep other purpose payloads unchanged. Retain catalogue dependencies while schema1 values still reference them.

Normalize current accepted facts, qualified TTb labels, activity, section and permanent ID once in Deploy. Keep a complete reference inventory separately from eligible choices; retain missing IDs as unresolved orphans. Preserve Deploy-owned notes, assignments and proposals. Stored Deploy profiles, names, labels or proposed Active/EO values cannot establish current eligibility. Source revision/sequence identifies content, not each read; observation/as-of remains separate.

Explicitly excluded non-teachers with missing teaching-only fields must not make eligible staff's whole-school workload unavailable. Missing facts for potentially eligible teachers remain truthful unknown/unavailable. Existing teaching-rule exclusions remain negative checks; A introduces no new category policy.

Coordinator correction,15:13SGT: new-choice eligibility and workload completeness are separate. Require current accepted/effective activity=true, EO=true and primary section; apply existing negative classifications only when known. Missing optional Role, EO appointment, tags or other classifications does not add a teaching-choice prerequisite. An ordinary EO teacher with blank Role/EO appointment is eligible when the three required facts hold, while incomplete workload facts remain unknown/unavailable. Known P/MK/support exclusions still apply. Schema1 `reference()`/`validateFields()` reject an accepted null scalar reference; grid clears become `superseded`, not accepted-null records. Empty arrays remain valid where the existing array schema permits them. Do not fabricate blank accepted records. This corrects an earlier technical assumption, not owner policy; Core/grants and School Leader rules are unchanged.

A synthetic512-person/thirteen-fact payload measures about1.3MiB, exceeding the existing1MiB service response limit. The coordinator approved a bounded internal Deploy-purpose page mode within these same paths: at most64rows and512KiB actual encoded bytes per page,512staff,32pages and8MiB aggregate. Use stable Staff ID ordering, one epoch/catalogue digest, owner before/after epoch checks and the earliest validity boundary; the collector checks its final clock. Mixed, truncated, changed-source or expired collections fail honestly. Other purpose contracts and the runtime response limit remain unchanged. The later actual local integration below reads an explicitly seeded512-person synthetic fixture through Core/Contacts/Deploy: eight pages,1,680,903 aggregate UTF-8 bytes and210,543 bytes maximum per page. This does not claim512 owner-create operations, hosted scale or durable F5 recovery.

### Enforce eligibility at owning writes and imports

Use one pure before/after teaching-binding validator in model/service. Require fresh accepted/effective activity=true, EO=true and applicable primary-section/established teaching eligibility for new or repointed IP, FT and TG references and explicit Add existing actions. The complete Contacts inventory is not itself a teaching assignment.

- Compare assignment ID, permanent Staff ID, stable class/TG target, subject and effective teaching level/pupil scope. Reused assignment/TG IDs with changed target/subject/levels are not unchanged references. Display-name changes alone are unchanged.
- Resolve legacy class display targets against the ORIGINAL stable class refs in a private clone before workbook validation. Otherwise a renamed class can cause the existing codec to allocate a new FT ID even when teacher/class identity is unchanged. No workbook-codec edit is required.
- Keep unchanged inactive/non-EO/MK/orphan references, including current/future FAJT/SRE assignments. Removal, unrelated notes and non-teaching reporting/committee edits must remain possible. Do not require every inactive person's teaching facts or Contacts availability for unrelated edits.
- Enforce the same rule on ordinary saves and import preview/fresh apply; pickers alone are insufficient. Remove copied Add existing's Active=Y promotion only through the v1 builder. Preserve current source teaching exclusions and historical display/unavailable states.
- Resolve an original committed operation BEFORE fresh Contacts/preview checks. Current applyImport reads expiring preview/Contacts before save's receipt replay; a committed response lost across preview expiry/outage must still return the original receipt. Keep the original request/body/digest/prepared operation; do not invent a new intent or replace old receipts with today's eligibility.
- Carry relevant Contacts/catalogue revision dependencies through existing admission/pins and clamp each validUntil by the projection boundary. Unchanged revision across interval expiry is not fresh eligibility. Keep per-read observation/as-of out of preview dependency hashes. Preserve school/actor/action/version/operation/lease/revision checks and provider-failure distinctions. No new pin protocol or cross-D1 atomicity claim.

## Inherited fixes and explicit exclusions

Carry forward B-R01 exact final-wire/lease identity, pending-capacity reservation, receipt binding, withdrawal, reload/context fencing and explicit direct-success compatibility for imports/publication/Calendar exports. Preserve Contacts UAT004 terminal receipt recovery, retained drafts and account/form fences. Projection changes do not authorise rewriting generic pending state.

Keep Deploy's Admin-only clear guard, publication/preparation race protection, exact venue ID/form/forms/uses preservation and source fences. Keep the shared builder's Venues subpath fix and `updateRosterAdminSettings` helpers/call sites, complete-view confirmation before pending cleanup, retained compatibility values and ACTIVE consecutive exclusions. Inherit Roster settings/order/budget and Calendar dates fixes without editing those services.

Latest discovery RUN-B-021 is historical evidence, not live authority. Duplicate Basic Name rejection before modifiers is an identity-authoring issue for separate B/follow-up; missing LT/Security/Music lookup definitions do not authorise A to create definitions or bypass schema1 writers. The inherited Contacts recovery recognises matching terminal noncommit regardless of rejection reason; a hosted old UI lock is not proof that this frozen source still fails. Do not claim it fixed without a focused current-source reproduction. A preserves all returned identities and inactive references, but performs no register completion/import or retrospective repair.

Owner rules remain settled: Admin or Contacts-scoped Power User acts independently; no self-acceptance by permanent identity; proposer/accepter/time/operation audit; no Admin notification; MKE+SMC rejection; owner's review as verification; inactive excluded from readiness, incomplete reactivation denied. Ordinary teachers/ST/TC are EO; MKE retains employment status with MK section. No label creates an authority record. A changes neither acceptance nor Core grants, and does not satisfy B's zero-catalogue authoring acceptance. Role P without a catalogue remains an invalid schema1 write in A.

## Acceptance and verification

Capture meaningful red regressions before fixes. Use synthetic identities, current accepted records, controlled clocks and actual owner handlers/D1. New focused programs remain under the existing45-second runner limit; reuse fixtures/built output and serialize heavy local runtimes. Do not increase limits, introduce a new test framework or weaken existing recovery assertions.

1. Actual Contacts writer/store→purpose projection→Deploy→built browser: distinct permanent IDs with the same Basic Name, qualified labels/modifiers/sections, two planning versions. Use supported current owner registration/selection, not an identity-rule change. Preserve notes/assignments across reload and unrelated saves.
2. Independently expected17-column rows across `/data`, browser Export All and decoded Drive workbook: EXT, three dedicated aliases/domain case/blanks, birthdays, Basic/TTb fallback, literal formula text and EO=true/blank appointment. A permitted real edit using projected expected values succeeds without false conflicts; dedicated clear does not refill.
3. Schema1 code/pinned-definition round trips with duplicate labels and retired assigned definitions; no new catalogue/authority writes. Ordinary/self/manager/other-module Power User/preview/foreign-school privacy negatives. LORD/Calendar/Roster/Layout purpose consumers remain compatible.
4. Eligibility matrix: accepted active eligible EO; ordinary EO teacher with blank Role/EO appointment remains eligible but has unknown workload quality; known P/MK/support exclusions remain denied. Cover inactive, explicit non-EO, MK/MKE, unknown/orphan, pending/future/expired/revoked EO and missing activity/section. Retained inactive current/future assignments survive bootstrap, export and unrelated edits; labels never grant eligibility. Do not create accepted-null scalar reference fixtures, which schema1 rejects.
5. Direct API/import IP/FT/TG bypasses reject new/repointed references. Cover unchanged historical references, removal, notes, class-display rename with legacy FT, reused assignment ID, retained TG ID with changed levels/scope, and non-teaching roles.
6. Change accepted activity/EO/section between preview/apply and source-read/commit; expire an interval without source-revision change. No new ineligible reference or partial row/revision/audit write. Keep original operation/receipt and normal recovery; source outages stay unavailable.
7. Lost committed import reply then preview expiry/Contacts outage returns the exact original receipt. Uncommitted stale preview still rejects. Preserve request digest, current authorization and replay order; no fabricated success or automatic replacement request.
8. Measure projection payloads and dependent-save query/bind/interval bounds, including maximum supported inventory shape where practical. Do not count synthetic projection-size tests as durable whole-school/live integration. A concrete extra consumer/budget need stops only affected work for coordinator scope review.

Run the two new programs plus affected Drive backup, Deploy storage/workbook and all25existing shared-web cases. Required unchanged regressions include Core/Contacts product and twelve contract programs; Contacts save/recovery browser/UI; Deploy save recovery/browser, clear authority, draft status, Fortnight, venue/publication; Drive adapters; LORD reference/notifications/cart groups; Calendar birthdays; both Roster administrative-settings programs and Venues navigation. Full product tests cover untouched purpose consumers. Record every actual command/count/failure/omission.

All commands use `TZ=Asia/Singapore`; browser uses `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` where available. Run `node tests/run.cjs --list` discovery, canonical `npm run build` with no tracked drift, `node scripts/v1/test.mjs`, `npm test`, and required full/product exact-head CI. Confirm the exact16-path diff, no production imports/config/generated changes, tested base/head and runtime limitations. Parent test/CI/review results are not inherited passes.

Publish one bounded PR labelled `Model: Codex`, with exact head/base, claim, inventory, evidence, limitations and rollback. Claude reviews that head without editing the branch; later changes require updated-head review. No merge or deployment is authorised by this claim.

## Completion and rollback

No owner policy question blocks this task. Pure helper names, compatible metadata, fixture layout, stable-target comparison and dependency filtering are engineering decisions within the contract. Do not pause for hypothetical scope questions; report concrete exceptions before affected edits.

Rollout and code-only rollback must treat the Contacts thirteen-fact producer and Deploy paged consumer as a pair. An older Deploy consumer does not request pages; with the new producer and a large register it can exceed the unchanged1MiB response limit and fail closed. The512-person paging guarantee requires both current services. The release coordinator must verify both versions before claiming capacity readiness; there is no atomic cross-Worker rollout or new deployment workflow in A. Rollback does not erase legitimate later owner writes, source evidence, audits or receipts. Legacy TG class targets normalized during explicit class rename or IP/TG import use the already-supported stable-reference representation, not a bulk schema/history conversion. F5 stays **OPEN**. Official T1B-01/T1B-02 and all unperformed runtime UAT remain **Not tested**. Build/test/review/release gates remain separate.

### Verification — completed local checks, publication gates pending

| Evidence | Actual outcome at this checkpoint |
| --- | --- |
| Baseline `TZ=Asia/Singapore npm run build` | Pass: all18 canonical components; coordinator confirmed no tracked build drift. Log `/tmp/gsis-contacts-projection-canonical-base.log`. This precedes implementation and is not the final build gate. |
| New `tests/v1-product-contacts-projection.mjs`, actual local Workers/D1 | Two expected failing regressions: `/data` returns four fields instead of the public17; Deploy-purpose records omit the selected field evidence. Log `/tmp/gsis-contacts-projection-first-red.log`. Synthetic staff, no live data. |
| Expanded `tests/v1-product-deploy-workbooks.mjs` | Expected failure: normalized `teachingEligibility` is absent. Log `/tmp/gsis-contacts-a-deploy-red.log`. Pure model evidence, not a Worker/browser pass. |
| Expanded `tests/v1-product-drive-backup.mjs`, owner-local D1 and decoded workbook | Expected failure against an independently specified17-cell row: missing EXT, invented EO appointment, obsolete alias fallback and padded birthdays. Earlier existing Drive assertions pass before this new failure. Log `/tmp/gsis-contacts-drive-projection-red.log`; program exits1. |
| `TZ=Asia/Singapore node tests/v1-product-drive-backup.mjs` after the formatter integration | Pass, exit0: all three existing reported groups retained; independent17-cell row, decoded two-sheet workbook, literal formula text, dedicated-clear/no-alias-resurrection and wrong-domain checks pass. Real isolated D1/R2/restart evidence and fake-provider/race cases are retained. Log `/tmp/gsis-contacts-drive-projection-green.log`; no duration measured and no live Drive access. This is an intermediate working-tree pass, not final exact-head verification. |
| `tests/v1-product-deploy-storage.mjs` intermediate run | Three reported groups pass in20.056s: owner save/import eligibility, retained inactive/legacy FT, source-change/interval commit fences and committed import expiry/outage/restart replay, plus existing venue/storage cases. Actual owner D1/R2; Core/Venues dependencies are explicitly synthetic adapters. Log `/tmp/gsis-contacts-a-deploy-storage.log`. Further model/paging changes require a final rerun; this is not final exact-head evidence. |
| `TZ=Asia/Singapore node tests/v1-product-contacts-projection.mjs` | Intermediate working-tree pass: eight groups in12.644s; log `/tmp/gsis-contacts-projection-eight-groups-corrected.log`. Actual nine local Workers, actual owner writes/reads and synthetic identities. Covers independent17-cell values, real edits/clears, privacy, thirteen selected facts, stable revision versus observation, retirement/history, selected interval evidence, two Deploy versions, inactive retention/new-target denial and bounded paging. |
| Maximum-inventory page evidence in that program | An explicitly seeded local512-person D1 fixture is read through actual Core/Contacts/Deploy: eight pages,512 unique identities,1,680,903 aggregate bytes,210,543 largest page. Forged/public/stale cursor and513-person bound negatives pass. This is actual local read integration over synthetic seeded data, not512 owner-write operations or hosted UAT. |
| `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-contacts-projection-browser.mjs` | Intermediate working-tree pass: six groups in14.751s; log `/tmp/gsis-contacts-projection-browser-green-4.log`. Actual nine local Workers/Chromium, owner-created facts, two versions, independent XLSX decode, permitted native edit/clear/reload, qualified IDs, historical references and IP/FT/TG choice filtering. Four screenshots/results under `deliverables/v1/evidence/contacts-projection/`;1440px/390px inspected by the UI implementer. Zero page errors; two inherited Google script attempts blocked, no completed provider calls. |
| Runner discovery | Both new programs found:91 product and1,190 Node programs. Lists `/tmp/gsis-contacts-product-list.json` and `/tmp/gsis-contacts-node-list.json`. Discovery is not a full-suite execution. |
| Final `TZ=Asia/Singapore node tests/v1-product-deploy-workbooks.mjs` and `node tests/v1-product-deploy-storage.mjs` | Pure workbook/model program: two logged groups pass (`/tmp/gsis-contacts-a-deploy-pure.log`). Owner storage: five logged groups pass in21.555s (`/tmp/gsis-contacts-a-deploy-storage-final3.log`, `-time.log`). Full dependent owner request is34 SQL statements under strict50, max11 binds and3,932 cumulative JSON bytes. Actual owner D1; Core/Contacts/Venues adapters are synthetic. Its separate512-staff/eight-page synthetic consumer fixture measures106,702 maximum encoded bytes/page and rejects ten exact-code malformed/stale/expired cases; do not substitute it for the real producer measurement above. |
| Final source reruns in `/tmp/gsis-contacts-projection-final-regressions.log` | Eight service groups pass, process12.670s; six actual browser groups pass, process13.923s (browser's inner timer12.993s); existing25-group shared-web program passes in3.286s and three-group Drive program in8.326s. Drive's clear fixture now correctly uses schema1 `superseded`. These results follow the TG-rename/provisional-proposal fixes. |
| Pre-consumer-correction38-program focused/regression selection | Pass,38/38, exit0: the two new programs plus36 selections (two changed existing web/Drive programs and34 unchanged), including12 Core/Contacts contract programs/56 cases. Logs `/tmp/gsis-contacts-projection-final-regressions.log` and `/tmp/gsis-contacts-final-regressions-results.json` record each command result/duration; longest program26.546s. The coordinator verified all14 non-document file hashes unchanged across this run. This is not the full91-product/1,190-Node suite. |
| Final historical-inventory/Offload browser correction | Seven groups pass in15.010s, `/tmp/gsis-contacts-projection-consumers-green-1.log`, after an actual browser red in14.737s. Only builder/new browser test changed after the38-program pass. Retains orphan, assigned active non-EO, explicit empty-note and proposal-only rows without adding teaching choices; fixes the one Offload Staff tag classification filter. The separate Role list is unchanged. |
| Five affected post-correction programs | All five pass: web4.686s, v0.9 frontend parity3.135s, Deploy save-recovery browser14.567s, Fortnight browser4.601s and draft status13.044s. Logs `/tmp/gsis-contacts-projection-post-consumers-regressions.log` and `/tmp/gsis-contacts-post-consumers-results.json`. All14 non-document file hashes remained unchanged during these reruns; final manifest `/tmp/gsis-contacts-final-tested-source-sha256.json`. |
| Final canonical/syntax/scope | Pass: `TZ=Asia/Singapore npm run build`,18 components/no tracked build drift,14 JavaScript module syntax checks, stable tested source hashes, exact16-path inventory and scoped whitespace. Final log `/tmp/gsis-contacts-projection-canonical-publish.log`. Earlier pre-correction canonical/syntax/scope pass is retained separately; this final check follows the consumer correction. |
| Publication/full exact-head CI/review | Pending: no implementation commit is invented in this document. Full1,190-Node/LORD and91-product CI remain required after publication; no local full-suite run is claimed. Claude must review the exact published head. |

Retained fixture failures are distinct from the initial product regressions. `/tmp/gsis-contacts-projection-first-full.log` stops after four passes in10.063s because the test expected current reference revision1 after retirement had correctly rebound it to revision2; the historical snapshot remains revision1. `/tmp/gsis-contacts-projection-eight-groups.log` stops after five passes in9.674s because the fixture expected EO1 rather than current EO2; the corrected case also distinguishes future wrapper revision3 from selected current revision2. Neither is claimed as a product failure. Browser intermediate green-1/-2/-3 logs preserve corrections to the native versus catalogue export locator, existing read-only EXT and module-local state access. The original browser red remains `/tmp/gsis-contacts-projection-browser-red.log`.

The Deploy final2 run stopped in15.564s because one negative page fixture mutated a later reused page. Final3 deep-clones each page and retains all exact-code assertions; the failed harness log is `/tmp/gsis-contacts-a-deploy-storage-final2.log`. Separately, the actual legacy-TG rename counterexample led to a source fix: preserve original stable class targets during explicit rename/import, while new/repointed bindings and changed teaching levels still require current eligibility. Removing an existing binding remains permitted; an unrelated note does not normalize targets. Provisional profile proposals remain proposals and may be recorded without granting new-assignment or Add existing eligibility from proposed Active.

Post-verification review found that native HR filtering hid four retained categories despite the complete service inventory, and the staff-metadata predicate emptied Offload classification labels. The meaningful red retained five passing original groups, then identified four missing HR rows, the active orphan disappearing with Show inactive off, and an empty Teacher Staff tag option. The final seven-group test retains all original six groups. Real owner paths create/update the non-EO, empty-note and proposal cases; the missing-owner orphan is an explicitly synthetic old-version D1 row/assignment because there is no supported owner-delete route. It proves neither live deletion nor a permitted new orphan assignment.

A separate cheap exact-engine comparison (`/tmp/gsis-contacts-a-classification-parity-probe.mjs`, `.log`) preserves original catalogue resolver/negative results for Teacher, FAJT, SRE, P, MK and custom Support/SL/SMC definitions. Only Offload's Staff tag filter uses this classification helper; actual teachers still require current eligibility metadata, with no missing-ID fallback. The separate Role list is untouched. Final builder SHA256: `fc3723a87e12ccf65ef6fee8b4fadbbad639dbc1dcc811d97566096e0b337698`; final new browser SHA256: `334d61d123466e3b9ae6af767ff65b634c2c6abd74e7125a05a34347cbed8dcc`.

Final screenshots replace the same four evidence paths. Retained-row badges fall below the390px screenshot fold; DOM text assertions prove them, not a claim that the screenshot shows them. Internal final-delta inspection found no blocker; this is not Claude's independent review. An initial affected-rerun preflight used a nonexistent abbreviated frontend-parity path and ran no tests; the corrected five-program run above passed.

The browser does not manufacture a positive Add existing fixture by removing an identity from the complete accepted inventory. It verifies the native negative chooser and actual IP/FT/TG offered choices; owning-service cases cover the explicit Add existing marker. Existing Contacts status wrapping and narrow Deploy navigation density are retained. UI source/hashes and fixture history are in `/tmp/gsis-contacts-a-ui-handoff.md`; these are working-tree references until the coordinator freezes and publishes the exact implementation head.

### Executed program selection

The coordinator ran each program below with `TZ=Asia/Singapore` and Chromium at `/usr/bin/chromium`. This is an equivalent rerun of the recorded pre-consumer-correction38-program selection: two new focused programs (browser then had six groups), followed by the36-file regression list. The final tree has seven focused browser groups. Separate Deploy storage/workbook runs, final seven-group browser and five affected reruns are recorded above, not folded into this38 count.

```bash
TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-contacts-projection.mjs
TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-contacts-projection-browser.mjs
for program in \
  v1-product-web.mjs \
  v1-product-drive-backup.mjs \
  v1-product-core-contacts.mjs \
  v1-product-contacts-save-recovery.mjs \
  v1-product-contacts-recovery-browser.mjs \
  v1-product-contacts-ui.mjs \
  v1-product-deploy-save-recovery.mjs \
  v1-product-deploy-save-recovery-browser.mjs \
  v1-product-deploy-clear-authority.mjs \
  v1-product-deploy-draft-status.mjs \
  v1-product-deploy-fortnight-browser.mjs \
  v1-product-deploy-venues.mjs \
  v1-product-deploy-venue-ui.mjs \
  v1-product-deploy-exports.mjs \
  v1-product-drive-backup-adapters.mjs \
  v1-product-lord-reference.mjs \
  v1-product-lord-notifications.mjs \
  v1-product-calendar-birthdays.mjs \
  v1-product-lord-cart-groups-browser.mjs \
  v1-product-roster-admin-settings.mjs \
  v1-product-roster-admin-settings-browser.mjs \
  v1-product-venues-navigation.mjs \
  v1-product-roster-service.mjs \
  v1-product-roster-capacity.mjs \
  v1-core-authority.mjs \
  v1-core-identity.mjs \
  v1-core-isolation.mjs \
  v1-core-races.mjs \
  v1-core-session.mjs \
  v1-contacts-catalogues.mjs \
  v1-contacts-contracts.mjs \
  v1-contacts-core-provider.mjs \
  v1-contacts-isolation.mjs \
  v1-contacts-races.mjs \
  v1-contacts-recovery.mjs \
  v1-contacts-snapshots.mjs
do
  TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node "tests/$program" || exit
done
```

Q01 **Pass**: accepted claim/incorporation and inherited overlap decision. Q02–Q05 **Pass locally**: documented ownership, privacy negatives, revision/interval/recovery checks and bounded-page/owner-query evidence above, including final consumer correction. Q06 **Pass for recorded local scope; full exact-head CI Pending**: distinguish the pre-correction38 programs from final seven-group browser/five affected reruns and final canonical/syntax/scope checks. Q07 **Pending**: implementation PR and Claude exact-head review. Q08 **Not applicable — no deployment authorised**; runtime UAT **Not tested**. Skill catalog inspected; repository ownership, minimal-projection, systematic-debugging and recovery principles applied. No optional skill execution or third-party copying is claimed.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR173](https://github.com/helper-gsps/gsis/pull/173) at reviewed head `f7f9ea2b0a6c7667e128a0752ad2c6f3551b91dd` is included in main by [merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`](https://github.com/helper-gsps/gsis/commit/334731cdb1d4fc5d37d7bdf6de761d668c062994). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/afeba886cd97f365cfb530200bcf46309812cd1b/docs/coordination/review/v1-pr175-chain-claude-recheck.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

The owner amended the sequence to merge PR175 once, preserving all eleven reviewed heads. This head is an ancestor of that carrying merge; it was not separately reimplemented or resolved by hand. The resulting product tree equals the tested tree outside two review documents. [The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
