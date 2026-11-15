# v1-accelerated-spec-20261113

Status: specification complete; independent review pending
Owner/model: ChatGPT v1 coordinator / Codex
Reviewer/model: Claude, independent review pending
Updated: 13 November 2026, Asia/Singapore
Branch: codex/v1-accelerated-spec-20261113
Source base: 27fa498657965169b9d971a9caabc33c8b19bc69
Specification commit: f39b671ac6da3f389c58345ce4f5c035f1cb3f65

## Authorised scope and result

Owner requests one complete implementation specification and Codex Astra Ultra handoff under delivery pressure, preserving most v0.9 UIUX and replacing Apps Script operational middleware. Standing owner directive of 12 November requires repository-backed v1 handoffs.

Owned only this task record and new files under docs/v1/accelerated-delivery/. Delivered specification, 44-case acceptance matrix, execution prompt and immutable source references. All nine manifest viewports are covered. Full Revision 49 is preserved under sources/ and the operative TV01-TV07 appendix is included verbatim. Engineering defaults E01-E11 are explicit. This documentation task does not perform product implementation.

## Handoff

[Specification at exact commit](https://github.com/helper-gsps/gsis/blob/f39b671ac6da3f389c58345ce4f5c035f1cb3f65/docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md)

Specification SHA256: 27ac63a64a4b422203cf973863ebe60ffe37feb8a6f53c8be9807459782b6d3c.
Revision 49 SHA256: 8fce6177b98d8e5fd87ba924e56be31f4d70e179407782bc6dd1d78495762683.

The owner can submit section 19 to the builder with the exact specification link. It authorises isolated implementation when submitted and preserves explicit production gates. Refresh active claims and owner decisions before starting.

## Verification

Parallel read-only source reviews covered Roster; Core/Contacts/Deploy; Calendar/LORD/Venues/Layout. Draft corrections addressed Core privilege predicates and evidence durability, strict cross-owner commit admission, completion deduplication across republication, disabled-limit scoring, subject block integrity and venue publication fences.

Local content validation passed: 20 numbered sections, 9 viewport routes, 11 engineering defaults, 44 unique acceptance cases, exact frozen appendix, expected source digest and no unresolved appendix placeholder. GitHub readback at the specification commit exactly matched both local specification and full Revision 49 source. These checks are prose/content validation, not runtime tests or independent Claude review.

Application build, CI, runtime tests, visual UAT, performance, provider credentials and deployment remain Not tested by this task.

## Coordination deviation

The initial claim was committed on this dedicated branch before document editing. Automatic approval review rejected advancing main to the claim-only commit because it would mutate the default branch without owner merge authority. Main was not changed; the rejection was not retried. The task claim and handoff are supplied together for the normal owner-controlled PR merge.

## Owner amendment: credential reuse

Specification version 1.1 records the explicit owner instruction to retain existing WhatsApp and Telegram tokens unchanged and use one common application secret named GSIS_SECRET. Rotation is not a migration prerequisite. Provider webhook requirements and current user permissions remain distinct. Coexistence uses one active sender/webhook owner. No token values were accessed and no live credential/provider configuration changed. Section 11.1 and acceptance case INT03 carry this requirement into the execution prompt. Updated content validation passed and frozen TV01-TV07 remain exact.

## 15 November 2026 — Claude R-2 and merge preparation

Claude approved head `b6cd8f5702fbea8fc4dc22c245de00b6dfdd2a22` as a historical record in `docs/coordination/review/v1-pr174-175-drafts-claude-review.md`, requiring an explicit supersession header. Added only that header to the specification: current OWNER_DIRECTIVES and later merged plans override the 13 November baseline. The remainder of the specification, including its original line endings, and the frozen Revision 49 source are byte-for-byte preserved.

Merged main `c69d30c682e11f10421e42efa746edc9b8729777` cleanly into this branch. This refresh stays within the existing three-document scope. Link, whitespace, preservation and documentation-only scope checks pass. No local build/application suite was run for prose; fresh CI and Claude exact-head recheck remain pending. The owner now authorises applicable merges after their gates pass; deployment and live-data operations remain outside this task. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested. The exact refreshed head is recorded in PR137.

Check detail: an initial staged whitespace check against the old branch also inspected unrelated files inherited from current main and reported their pre-existing whitespace. The relevant check compares the resulting tree with current main. For the frozen CRLF specification, `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --cached --check origin/main` recognises its preserved CRLF endings; that scoped check passes. No inherited application/licence/test whitespace was changed.
