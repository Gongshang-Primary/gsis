# Contacts B: direct authoring, compatibility and signatures

Status: implemented locally; exact-head CI and independent review are **Pending**. This document does not report a deployed change or completed migration. Codex builds; ChatGPT coordinates v1; Claude reviews the exact published head.

## Authority and source references

The [accepted task](../../coordination/tasks/v1-contacts-direct-authority.md) owns the exact 40-path amended allowlist and chronological claim record. The owner asks for ordinary Contacts input to be authoritative without catalogue setup, retaining explicit authority acceptance. Requirements are the [direct-authoring job at 16b7186](https://github.com/helper-gsps/gsis/blob/16b718600d9a391afe90c00df5129095c73f8b57/docs/v1/contacts/DIRECT_AUTHORITY_CODEX_JOB_2026-11-15.md), recovered Revision 49 and the [controlling accelerated specification](https://github.com/helper-gsps/gsis/blob/f39b671ac6da3f389c58345ce4f5c035f1cb3f65/docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md). Existing Core permissions, ownership, acceptance and recovery rules take precedence over display convenience.

| Boundary | Exact reference |
|---|---|
| Accepted task-only main claim | `d005158c3b10817e7a02f26b37a0a019cab66b49` |
| Original incorporation, before the parent correction | Public `d09f386a824d6001e946b12ae1e814599c912a47`; local `d0b85ccc73d094e11948b75321ead760533e37d7`; tree `283a53085f9a229947ad1dfae998c4165d14f6e5` |
| Corrected frozen parent | [Global save status `77e30eece77cf2477384ecd4fdc901b828e47599`](https://github.com/helper-gsps/gsis/commit/77e30eece77cf2477384ecd4fdc901b828e47599) |
| B pre-implementation integration | [Public `db63a0eca996f13afca05bc21012c6985762cec7`](https://github.com/helper-gsps/gsis/commit/db63a0eca996f13afca05bc21012c6985762cec7); local `01f47a0376f45a338f53a528331772c48292c698`; identical tree `29039243ff51dd792854b3a639cb550d699e0cf5` |
| Later main read, not merged for this checkpoint | `dbde39eb01528b8677c207896ac62e5fbd0f1133`, adding [Claude's PR159–173 review](https://github.com/helper-gsps/gsis/blob/dbde39eb01528b8677c207896ac62e5fbd0f1133/docs/coordination/review/v1-pr159-173-claude-review.md) |
| Run B discovery source | `ee052420628e3567038df5141c448bc366d0d9ba`; 49 official findings, no new invented task IDs |

The serial descendant exception permits this claimed child while the frozen parent's CI/review continues. No parent pass transfers to B. The inherited v0.9 release/coordination files are mechanical ancestry, not B edits; measure B's own 40-path amended scope against its complete pre-implementation tree. Canonical v0.9 source remains untouched. Compare the existing Contacts UI and backend while adapting behavior; retain familiar navigation, artwork and the single draft. Apply review F1 by keeping editing logic in v1-owned Contacts modules and limiting the builder to wiring where feasible, without expanding into a whole-screen rewrite.

## Ordinary input and authority

Admins and Contacts-scoped Power Users may independently create/edit ordinary records, including their own classifications. Other-module Power Users cannot manage Contacts. Existing restricted self-service, read-only impersonation and school isolation remain. SMC, EO and School Leader still require their separate acceptance operation, owner-review source and proposer/accepter/time/operation audit. Permanent Staff ID and account aliases cannot bypass no-self-acceptance. There is no second approver or Admin notification. MKE+SMC effective-interval rejection, readiness, reactivation and missing-versus-false semantics remain unchanged.

Role, EO Appointment Level, tags, memberships, section and profile completion never grant Core capabilities or supply accepted EO/SMC/School Leader values. Staff ID remains the permanent owner identity; names and signatures do not prove identity. A basic-name-only API creation remains provisional without hidden active/authority records. The UI may visibly stage Active=Y and submit that deliberate ordinary selection.

Public ordinary requests contain validated strings, booleans and ordered string arrays. Reject caller-supplied catalogue references, storage envelopes, provenance, authority values and derived TTb Name. Deterministic validation should precede operation preparation. After preparation, only durable original-operation noncommit evidence permits correction under a new operation ID. A 409, timeout or transport error alone is not proof that a request did not commit.

## Versioned representation and historical readers

| Representation | Contract |
|---|---|
| Existing schema 1 snapshot/record | Keep strict validation, exact stored bytes, digest and revision identity. Decode references only against their pinned school/catalogue/revision/code. |
| New formerly reference-shaped field | Explicit schema 2 storage envelope containing the primitive value; ordered arrays remain ordered. Do not infer a version from strings or an empty array. |
| New mixed/direct staff snapshot | Schema 2 with explicit direct-record encoding; any retained schema 1 record still passes its original strict validator. |
| Authority snapshot and Core transport/query | Remain schema 1, with the existing boolean fields, group/source vectors, acceptance and failure semantics. |
| Observation | A read does not convert content, change an existing digest, or advance source revision/sequence. Current observation evidence remains distinct from immutable snapshot identity. |

For the 11 formerly reference-shaped fields, use one pure codec for new-input normalization, strict stored-value decoding, pinned legacy resolution, operational values and display values. A converted value preserves the original operational code and bounded provenance, including source field revision/digest and the pinned definition identity/label/display attributes needed to retain meaning. An unrelated edit or no-op must not replace UT with its display label, lose a hidden tag's display rule, reorder surviving values or reinterpret a retired assigned definition using the latest catalogue. Existing immutable definitions/history remain recoverable.

Keep the owner `deriveDisplay`/`makeSnapshots` interfaces used by settings and jobs. Direct-only data needs no current catalogue reads. Historical evidence can require bounded pinned-definition reads; this compatibility path must not become a prerequisite for new direct inputs. Existing JSON storage supports the explicit representation; no SQL schema or generic runtime change is authorised by this contract.

Omission means unchanged. Explicit optional scalar clearing produces superseded state, not an accepted-null reference; an explicit empty list is known empty and differs from missing. Preserve intervals, revoked/nonaccepted states and current/future records. New content receives new immutable revisions. Conversion can legitimately change staff/source pins and invalidate an in-flight dependent operation; it must not rewrite authority field acceptance history.

## One 25-field editor and workbook schema

One owner schema/projector supplies ordered fields, values, baseline, editability, validation and workbook metadata. Preserve the first 17 columns and append School Section, Personnel Category, Employment Arrangement, Employment Status, Memberships, General Aliases, Name Suffix and Profile Completion. The main grid and any details view share the same draft, baseline and operation. TTb is read-only; EO Appointment Level is an explicit ordinary field and must survive another-cell edit. No hidden second writer or catalogue panel is introduced.

| Input | Required behavior and bound |
|---|---|
| Names and ordinary classification tokens | Existing bounded names/labels; direct unfamiliar labels accepted without registration. Validate delimiters/control characters so one token cannot manufacture several operational tags. |
| School Section / Profile Completion | Existing structural choices and completion validation; do not silently map unknown legacy sections to Primary. Completion is separate from active and authority. |
| Employment, subject, MK tags and memberships | Ordered arrays, at most 32 values; stable documented deduplication. No inferred permission. |
| General aliases | At most 16 values; cannot revive a cleared dedicated email address or prove identity. |
| Name suffix | Existing 40-character/no-parentheses rule; derived TTb uses the same owner rule as preview. |
| Email columns | Preserve school/iCON/CES domains and full stored addresses. No invented school domain or alias fallback. |
| Mobile / EXT / birthday | Existing phone bounds; EXT preserves leading zeros; birthday validates a real date and preserves historical year without exposing it to narrow projections. |
| Save/import | At most 64 mutation entries and 16 affected staff. Each addition is one entry, not one per populated new-row field. Updates-only import is at most 64 edited cells/16 staff. Preserve byte/depth limits too. |

Display actual bounds before locking a new operation; remove copied 300-cell and fixed 17-column assumptions. Fixed structural choices need no setup; other legitimate new labels remain open values. Retain recognised specialist-subject behavior, ordered modifiers and pinned legacy display attributes in a shared pure TTb preview. Unknown labels do not acquire undocumented workload/eligibility semantics. A malformed/unavailable retained reference cannot produce a fabricated preview.

Native refresh keeps existing context/read-generation/dirty/pending guards. Move contribution review into the ordinary editor before removing the old catalogue overlay: immutable publication proposals remain proposals until explicit owner review, with exact response/context binding. Retire obsolete current-catalogue write callers only after their required behavior is replaced. Keep historical readers and old-operation recovery.

Browser and Drive Contacts/Baseline sheets contain 25 staff fields plus Staff ID (26 columns) and use the same versioned schema, stable IDs, literal values and conflict baselines. Export Visible stays reporting-only. Support old 17-column imports through explicit mapping or refuse with an actionable fresh-export requirement; omitted new fields must never clear. Import cannot accept authority facts or TTb. Generic workbook/table code and provider delivery remain outside scope.

## Prepared conversion and recovery

Prepare an exported, owner-authorised conversion entrypoint; a public endpoint is not required. It has no automatic read/write/startup/cron invocation and no live execution in this task. One bounded staff transaction covers an explicit subset of the 11 reference fields, retaining existing interval/reference/byte bounds. Preview resolves every selected current/future legacy record from exact pinned definitions and returns a digest bound to codec version, field presence/revisions, original record digests and source definition digests. Unresolved, ambiguous, malformed or foreign evidence makes the requested transaction repair-required with zero writes; do not skip, guess or erase it.

Apply recomputes and verifies the preview, checks current authority/admission and the owner source fence, and guards expected staff/field/pinned-definition state in its D1 transaction. Preserve original operation identity and request intent. Exact committed replay is resolved before mutable preflight; changed intent under the same ID is rejected. Commit new values/revisions, history, snapshots, epoch, audit and receipt together in the owning D1 database. Verify actual statement/bind/UTF-8 budgets without raising existing limits. There is no cross-D1 atomicity claim.

A lost reply remains unknown until the original durable receipt resolves it. Prepared failures follow existing abort/fencing/reconciliation. Catalogue-era operations remain recoverable; conversion must not bypass their outstanding fences. Synthetic conversion/backup/restart tests can demonstrate the prepared protocol but do not authorise or prove live migration.

## Consumer and signature boundaries

Contacts projections retain purpose minimisation and accepted/effective records. Core consumes unchanged explicit authority. Deploy retains inventory/history/orphans and requires current accepted active/EO/primary evidence for new choices, preserving known negative exclusions; optional missing classification affects workload quality, not a new authority prerequisite. Membership/HR reports truthfully show direct staff facts, not inferred authority flags. Retain the paged transport's schema 1, actual catalogue digest (empty where appropriate), epoch/cursor/observation evidence, 64-row/512-KiB page and 512-staff/32-page/8-MiB aggregate bounds.

Roster already handles scalar operational codes; emit canonical tokens, memberships and its actually consumed EO appointment projection. LORD recipients and Calendar birthdays, Venues identities and Layout's published IDs retain their narrow interfaces. These readers, Core, settings/jobs, generic backup/restore and provider code need regression evidence; they are not speculative new edit paths. Browser/Drive schema metadata and raw history backups must remain coherent.

Formal-role presentation uses exactly the [59 ordered source pairs](https://github.com/helper-gsps/gsis/blob/4c2c5eef3389f5291c6152bfe4b1bb49a0ae0acd/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md#L334). Compact Unicode-unescaped UTF-8 JSON is 2,558 bytes, SHA-256 `47a5343e3fc1459a660f1a877aadf1bf499318c2eeffe35503cf387eb4b7c571`. Preserve spelling/order and do not invent missing mappings. This pure map is presentation, not an authority catalogue. Direct labels and exact pinned old/retired references share the resolver after privacy filtering. Missing/corrupt required reference evidence makes the signature unavailable; a genuinely absent or valid unfamiliar label retains the documented source fallback.

People, completed rows and DIY expose coherent formal-role/source validity. Resolve pinned definitions in bounded deduplicated reads, not per-person queries. Preserve the existing renderer, artwork/fonts, statutory-name/self-email checks, ten-subject whitelist and Teacher-prefix behavior, including Teacher Counsellor. Invalidate render/ready/download state on owner-view changes; recheck source validity/context after asynchronous rendering and before/after PNG creation. A dirty form still defers refresh. Tests must exercise actual canvas/PNG/download as well as delayed-result races.

## Evidence ledger and completion gates

Actual local commands, results, measured resource limits and retained failures are recorded in the [task verification ledger](../../coordination/tasks/v1-contacts-direct-authority.md#verification). Exact committed-head CI links and inventory belong to the publication PR. Corrected-parent CI is now green but does not count as B evidence. Claude's earlier approvals do not cover this implementation.

| Required B proof | Status |
|---|---|
| Meaningful built-browser + real owner red, then Admin/Contacts PU direct Role P create/edit with zero catalogues before and after | Pass locally: initial 409 red; service 10 and native browser 5 groups. |
| All 25 fields, unfamiliar labels, EO appointment persistence, one-draft TTb preview, keyboard/narrow UI and import/export | Pass locally: service and actual browser/workbook round trip; 25 fields plus Staff ID. |
| 64/65 entries, 16/17 staff, 32/33 tags, 16/17 aliases, scalar/date/email/request/snapshot byte negatives | Pass locally: actual owner boundaries, invalid inputs and atomic-race assertions; see measured budgets. |
| Ordinary self-edit versus authority self/alias denial; other-module/preview/school isolation; MKE/readiness/reactivation | Pass locally: direct service and retained Core/Contacts tests. |
| Strict schema 1/2, exact pinned legacy meanings, unchanged-read identities, current/future intervals and immutable historical bytes | Pass locally: pure codec, actual conversion/owner/projection and restart tests. |
| Prepared conversion repair/no-write, CAS/admission races, exact replay/changed intent, restart and matching backup/restore | Pass locally in complementary programs: conversion/restart/race proof and mixed schema1/2 fresh-owner backup/restore. No live conversion or durable F5 closure. |
| Original-operation commit/abort/lost reply and protected-context recovery; no arbitrary terminal claim | Pass locally: 8 owner recovery, 8 recovery-browser and 12 classification groups, with pre-upgrade prepared intent and real epoch/blocked-storage races. |
| Actual Core/Deploy/Roster/LORD/Calendar and narrow Layout/Venues consumer evidence; 512-staff budget | Service consumer/512-staff evidence passes. Final native Deploy report/Offload browser passes7 groups, including exact read-only facts and one functioning shared sorter. |
| Independent browser/Drive decoded workbook values and all 59 signature pairs plus actual PNG/download races | Pass locally: actual native workbook round trip, Drive3 and signature7+7 groups. |
| Explicit classification-test supersession; retained invariants, recovery negatives and unchanged required regressions | Superseded interactions documented; classification12 and recovery8 pass. Final9 regression programs pass; exact-head full suite pending. |
| Canonical build/no tracked drift, syntax/format, exact 40-path scope, both-runner discovery, new-head Node/LORD/product CI | Local build18, syntax/whitespace, exact40paths and discovery1198/97 pass. Final-source build/no drift and9 regressions pass; exact-head CI pending. |
| Claude exact-head review | Pending |

Keep the existing classification test program. Replace removed-panel interactions with direct-editor equivalents while retaining no-op/no-write, ordered survivors, deliberate clear, pinned/non-effective facts, stale CAS, exact one-effect/audit, malformed completed views, dirty/DIY/signature refresh, context and narrow-layout checks. Move catalogue-only assertions to historical/conversion coverage; do not delete/skip them to hide failures. Role P rejection fixtures become genuinely invalid direct inputs while their receipt/recovery assertions remain. Update old column/schema assumptions explicitly and preserve the original A privacy/paging/eligibility/history proofs.

Run applicable commands under `TZ=Asia/Singapore`; browser programs use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`, retaining the existing 45-second program bound. Record actual commands, groups/programs, measured limits, failures, fixture corrections, omissions and tested source/head. Q01–Q05 have implementation/local evidence; Q06 exact-head CI, and Q07 independent review, remain Pending. Q08 is not applicable because no release action is authorised. No optional skill package execution is claimed.

## Rollout and rollback limits

The current producer, direct-value readers, UI and workbook metadata ship as one compatible software set; separate Workers are not atomically deployed by this design. A coordinator must verify the actual set before capacity/readiness claims. Existing immutable schema 1 evidence stays readable. Old writers cannot be assumed to understand direct schema 2: preserve an owner backup and freeze affected Contacts writes during rollback until a compatible build is restored. A code revert cannot undo legitimate owner writes, revisions or receipts; recovering post-upgrade data requires separately authorised work.

F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. No merge, deployment, live conversion, Contacts acceptance write, provider activation, infrastructure change or live-data access is performed by this task's implementation evidence.
