# v1-contacts-projection: canonical Contacts projection and current Deploy eligibility

- Status: claimed for bounded implementation; immediate incorporation of the accepted claim is required before edits.
- Last updated (Asia/Singapore): 15 November 2026, 14:59.
- Owner/model: Codex. Coordinator: ChatGPT for v1. Independent exact-head reviewer: Claude.
- Branch: `codex/v1-contacts-projection`.
- Owner authority: continue the frontend UAT repair queue, one bounded group at a time, refreshing Git discovery recursively. This authorises implementation, tests and an implementation PR within the sixteen paths below. No merge, deployment, live settings/data writes, migration, live Contacts acceptance or provider activation.
- Frozen parent: [`d3d76fc571fecbcd335ee9c5552ca869fd329a3a`](https://github.com/helper-gsps/gsis/commit/d3d76fc571fecbcd335ee9c5552ca869fd329a3a), tree `48264d153aaa4f8d27a7ebc36a1edeb2703c14b4`, branch `codex/v1-roster-admin-settings`. It inherits Venues navigation `eb63f820b3d9a78fdeec528bfe0c0d990bc17db0`, B-D03 `01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef`, B-R01 recovery and the preceding Contacts recovery fixes. Parent CI/review is pending; none of its checks counts as this task's evidence.
- Refreshed main before prospective claim: `52468a2c6573aaf77a803c88346a09100c0b4590`. Latest discovery: Run B `1a00d6f94a4caa3ceac85930ecc859353887d8f1`; Claude branch `claude/beautiful-dirac-uiflqu` at `58e22a7bf7ba4a49caa2caabe877605153b098db`.
- The coordinator refreshed the actual files of all31open PRs this turn. The only current overlap is frozen inherited work owned by the same builder; no editor remains on it. ChatGPT permits this serial successor after the parent's source freeze while its automated checks/review remain pending. Never amend the frozen parent.
- Before edits: publish this claim through the existing expected-head workflow, re-read the accepted claim/main, refresh actual competing files and immediately incorporate the accepted claim into the selected parent. Record the resulting branch/base/head. No cherry-pick of private patches or reset to an older builder/client.

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
4. Eligibility matrix: accepted active eligible EO; inactive, explicit non-EO, MK/MKE, unknown/orphan, pending/future/expired/revoked EO and missing activity/section. Retained inactive current/future assignments survive bootstrap, export and unrelated edits; labels never grant eligibility.
5. Direct API/import IP/FT/TG bypasses reject new/repointed references. Cover unchanged historical references, removal, notes, class-display rename with legacy FT, reused assignment ID, retained TG ID with changed levels/scope, and non-teaching roles.
6. Change accepted activity/EO/section between preview/apply and source-read/commit; expire an interval without source-revision change. No new ineligible reference or partial row/revision/audit write. Keep original operation/receipt and normal recovery; source outages stay unavailable.
7. Lost committed import reply then preview expiry/Contacts outage returns the exact original receipt. Uncommitted stale preview still rejects. Preserve request digest, current authorization and replay order; no fabricated success or automatic replacement request.
8. Measure projection payloads and dependent-save query/bind/interval bounds, including maximum supported inventory shape where practical. Do not count synthetic projection-size tests as durable whole-school/live integration. A concrete extra consumer/budget need stops only affected work for coordinator scope review.

Run the two new programs plus affected Drive backup, Deploy storage/workbook and all25existing shared-web cases. Required unchanged regressions include Core/Contacts product and twelve contract programs; Contacts save/recovery browser/UI; Deploy save recovery/browser, clear authority, draft status, Fortnight, venue/publication; Drive adapters; LORD reference/notifications/cart groups; Calendar birthdays; both Roster administrative-settings programs and Venues navigation. Full product tests cover untouched purpose consumers. Record every actual command/count/failure/omission.

All commands use `TZ=Asia/Singapore`; browser uses `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` where available. Run `node tests/run.cjs --list` discovery, canonical `npm run build` with no tracked drift, `node scripts/v1/test.mjs`, `npm test`, and required full/product exact-head CI. Confirm the exact16-path diff, no production imports/config/generated changes, tested base/head and runtime limitations. Parent test/CI/review results are not inherited passes.

Publish one bounded PR labelled `Model: Codex`, with exact head/base, claim, inventory, evidence, limitations and rollback. Claude reviews that head without editing the branch; later changes require updated-head review. No merge or deployment is authorised by this claim.

## Completion and rollback

No owner policy question blocks this task. Pure helper names, compatible metadata, fixture layout, stable-target comparison and dependency filtering are engineering decisions within the contract. Do not pause for hypothetical scope questions; report concrete exceptions before affected edits.

Rollback is code-only to the prior projection/eligibility behaviour. No stored schema/history conversion or deletion is part of A; retain immutable records, source evidence, audits and receipts. F5 stays **OPEN**. Official T1B-01/T1B-02 and all unperformed runtime UAT remain **Not tested**. Record build/test/review/release gates separately; do not imply that local tests or pending parent CI establish production readiness.

Q01: claim publication/incorporation pending confirmation; Q02–Q06 planned, no child test pass claimed; Q07 Claude exact-head review pending; Q08 not applicable to deployment. Skill catalog inspected; ownership, minimal projections, systematic failing regressions and recovery principles applied. No optional skill execution or third-party copying is claimed for this bounded preparation.
