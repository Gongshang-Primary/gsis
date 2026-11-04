# roster-whatsapp-url-buttons: message buttons and acknowledgement continuity

- Status: implementation verified locally; exact-head GitHub full suite pending
- Owner/model: Codex
- Reviewer/model: Claude
- Lane: R, v0.9.9j queue item 5
- Branch: codex/roster-whatsapp-url-buttons
- Base main: c46503bba1b930028f06588bdb46bfe7107a94da
- PR: https://github.com/helper-gsps/gsis/pull/68

## Authorized scope

Keep the five pending private-link and four pending staff-link templates disabled. Select the approved mutual_request v2. Preserve acknowledgement through equivalent publication and republish. A valid old own-duties link must show current authorized duties while preserving expiry, recipient/date scope and peer-request restrictions. No deployment or live data/configuration change.

## Template gates

Canonical contracts and activation live in `notification-worker/template-contracts.json` and `templates.activation.json`. Five pending private variants remain Off. Four staff variants have nonselectable pending metadata with missing body/component evidence; no body or hash is invented. Their activation choices are false. An accidental true choice retains the approved base template; direct pending-name configuration fails closed. The approved peer-request v2 remains selected. Activation is4511 bytes, below5120. Selectable contracts still require exact live Meta approval and component/body matching.

## Acknowledgement cause and fix

`communicationState` stores a recipient snapshot in the durable notification intent. Its acknowledgement refers to that notice identity. First `dailyPublication` previously created another notice identity, so the publication appeared pending despite equivalent acknowledged duties. An unchanged subsequent publication already retained its identity.

The first-publication bridge now retains the latest explicit recipient communication's notice identity only when a scoped acknowledgement exists and `publishedContentFingerprint` proves equivalent content. Original acknowledgement identity/time remain; existing carry evidence maps publication snapshots. Changed subject, class, time, venue or instructions remains pending. Published or explicitly communicated cancellation followed by reinstatement needs a new acknowledgement. A draft-only change restored before communication does not invent a recipient-visible change. Queued and future reminders respect carried acknowledgements. No historical acknowledgement or communication is repaired or deleted.

## Current private view and write guard

`resolveDutiesCapability` selects the latest saved publication or explicit recipient communication for the same recipient/date. The original communication remains immutable. Unsent draft edits are not exposed. Original capability expiry remains. `acknowledgeDutiesCapability` resolves the same source and rejects a stale displayed notice with409. The browser labels semantically changed duties.

Published views retain scoped notification history and own absence arrangements. A publication without a recipient row returns an explicit empty/unavailable saved view, preventing fallback to an old communication or an unsent draft. Existing timetable-notice eligibility and snapshot-only acknowledgement scope remain.

Google obtains current Contacts before the writer lock and checks current engagement against the locked state. D1 checks verified Contacts and guards its reference revision at commit. Missing, duplicate or inactive recipients are denied, retaining the existing date-specific ad hoc engagement exception. Receipt replay and concurrent Contacts changes are covered. Peer capabilities retain their request scope; expiry and revocation clear browser context.

## Verification

Two consecutive builds regenerated all18 components with stable output. Eighteen focused programs pass, including18 continuity cases,12 real Google/D1 adapter cases, pending-template gates, current-duty browser context, publication policy, peer scope, privacy and existing contract programs. Tests first reproduced identity loss, missing current-source resolution and recipient revocation, then passed after the bounded changes. A peer-scope extraction fixture now supplies its existing verified-Contacts dependencies; original scope/expiry/replay assertions remain. Independent bounded review found no blockers.

Full exact-head GitHub Node/LORD CI remains the handoff gate. Claude reviews the final head; owner decides merge. No live provider call, message send, school-record write, data repair, authority/cutover/freeze change or deployment ran. Rollback restores source/configuration only and retains communications, acknowledgements and receipts.

The final revision includes main after the approved Venues PR merged. Canonical private-link and template changes are retained alongside those Venues fixes; generated copies are rebuilt together.

## 4 Nov priority resumption

Owner order: LORD PR A, merged allocation single-flight #76, then this PR. Existing prepared scope restored from tree `5ea4ea78c9603dd88a50cb56f56c2b0bd6b98b3f` and reconciled onto main `c0789c9d37b946a782a85456d84a5ccb1402f8a9`. Canonical sources merge without conflict; generated bundles are rebuilt, never hand-merged. Main audit repair, daily relief cap and Worker lease/backoff remain. LORD PR A is separate; no LORD source changes belong to this PR. Final exact-head full CI and Claude review remain required.

The restored old metadata base already contained generic button-selection code absent from actual current main. Two focused programs reproduced the gap (enabled v2 retained v1; a string-valued pending toggle was accepted). Restored the existing reviewed canonical sender selection/validation functions outside generated markers, preserving main’s audit-repair route, then regenerated all bundles. The canonical `_worker.js` sender is therefore part of this PR in addition to its generated contract marker.

Resumed verification: all 19 non-browser programs of the 22-program combined set pass, including continuity, real Google/D1 private adapters, template selection, audit repair and real-SQLite Worker single-flight. Three browser programs need CI Chromium. Both restored sender-selection regressions were observed failing before restoration, then passing. No template bodies/hashes were newly invented or submitted; activation stays disabled for all pending choices.

## Resumed whole-branch advisory fixes

Fresh advisory of local `0408685` found two Important defects in the prepared continuity work. First, reconciliation only considered first publication: it revived an old acknowledgement after an explicitly notified cancellation, and lost a newer acknowledged communication on republish. Publication now compares the latest authorized source on every publish; a newer communicated change interrupts the earlier notice identity. Second, legacy private saved notices were readable but could never acknowledge because the new resolver excluded them. The resolver now identifies saved legacy notices/snapshots; the writer uses the same saved notice and scope while existing adapter projections remain intact. Both findings were reproduced before fixes. New publication sequences, actual Google legacy private read/write and actual D1 legacy acknowledgement pass, alongside 20 continuity cases, 13 private adapter groups and 12 acknowledgement groups. No legacy record is repaired, rewritten or deleted by deployment. No minor findings were deferred. This is Codex advisory, not Claude approval.

## Publication blocker, 4 Nov 2026

The final code at local `790230a` passed all 20 non-browser programs in the 23-program combined set after canonical regeneration. Three Chromium programs and full exact-head CI require GitHub. Full code tree before this documentation checkpoint: `e98d91665c7808b1b28bd3fe14e5af0f717acd73`.

Automatic approval review rejected uploads of `backend/RosterOperations.gs` and `docs/WHATSAPP_PARAMETERS.md`, saying the nonpublic payloads lack user-authored destination authorization. Verified `helper-gsps/gsis` through the connected GitHub API as private, owned by helper-gsps, repository ID 1437215837, with admin/maintain/push access, and verified both existing file paths and PR68 target/head. A same-tool retry after those checks was also rejected for the backend source. No workaround, alternative transport or runner execution was used to bypass that rejection. Object creation before the refusal did not update any branch.

PR68 remains at remote `8cf3466447bdb67267be77fefad932765c654119`. Next action needs explicit owner authorization to publish this prepared source/documentation to private `helper-gsps/gsis` on `codex/roster-whatsapp-url-buttons`. Then recheck main and branch, regenerate publication metadata from the current local head, verify every uploaded blob SHA and final tree, fast-forward with the expected old head, run full exact-head CI, and update the PR for Claude. Do not recreate the completed feature or repeat the already closed advisory findings. LORD PR77 is separate and green at `e19be771b7e15789ef4408addddb80623d281975`; minimal single-flight #76 is already merged. No deployment or live data/provider call occurred.

## Publication resumed, 4 Nov 2026

Owner explicitly requested completion of #68 after the publication authorization question. Publishing the prepared source and documentation to private `helper-gsps/gsis` on `codex/roster-whatsapp-url-buttons` is now authorized. The earlier blocker is resolved by that owner instruction. Main advanced to `4e30dd4a80054e9e31605a0179a83a28fadaf6c6`; retained its consecutive-period rule, settings, tests and task records, then rebuilt generated files canonically. No deployment is authorized or performed.

Current-main focused verification passed 24/24 programs: the 20 non-browser PR68/repair/lease/acknowledgement programs plus four consecutive-period/settings/allocator programs. Full exact-head CI remains the publication handoff gate.

Final base includes merged LORD PR77: `2c932747f02c70ae3eed01917652b61bca8e3617`. Copied its exact SHA-verified source, generated copies and tests before rebuilding. PR68 has no LORD delta against that base. Full CI will test both changes together, including all 40 LORD programs.

Release-label integration: main `5367e9cbae990faa5e42c90040f5a969be446b5b` changes the build label to v0.9.9j. Applied its exact package metadata, regenerated all components, and verified all non-PR68 paths match that main tree. This adds no PR68 release-label delta.

## Full-suite correction

CI at `c96285b91f784bc8b217063ccfaaeac25e3e7fec` found two failures: the new published private projection omitted the frozen assignment ID expected by the integrity regression; the existing Calendar checker test assumed the old v0.9.9i frontend after main advanced to j. Published duties now retain public assignment identity/status from the saved publication snapshot and display content from that publication’s captured row, never from mutable live assignments. New Google and D1 adapter tests reproduce and cover ID/status preservation. The Calendar test now reads the current package build label while retaining both matched and deliberately mismatched bundle checks. Both failing programs and all 26 focused programs pass locally after canonical regeneration. The full suite must run again at the corrected head.
