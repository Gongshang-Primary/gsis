# Review: PR #197 — 17 Nov Deploy changelog: TTb names and HR links

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `ba0a7639748c3cd85cd920b0fd8469c0f480fb79`.
- Base / claim clarification: `c6feb62c87b43c87eeb397940e8f4efa2f758a71` (original claim `b2faf390ebdf75db721a2ef5bec0b98afc3484e7`).
- CI run: [44026646702](https://github.com/helper-gsps/gsis/actions/runs/44026646702), green, all 5 jobs (4 regression shards + full-suite), at the exact head. No separate product/package run was triggered for this documentation-only head; none is claimed.
- PR: https://github.com/helper-gsps/gsis/pull/197 (Codex, branch `codex/v1-membership-uat-20261117`; draft, not merged).
- Task record: `docs/coordination/tasks/v1-membership-frontend-uat-20261117.md` (in the PR; reviewer line already names Muse).

## What it does

Documentation only. Maintains the 17 November Deploy frontend changelog and source investigation. The new owner report is **DEP-17-004: TTb names must include employment modifiers**. No product or test code, live data, merge or deployment is authorised or performed by this update.

The ledger records: v0.9 derives Basic Name, then each Employment Modifier, then each Subject Modifier, then the MK suffix, each wrapped in parentheses — e.g. `Synthetic Teacher (FAJT) (4/5) (MTL)`. Role, appointment grade/status, Active and membership flags are not direct suffixes. Existing v1 formatting already includes employment tags with its own typed visibility/deduplication rules. The separate v1 precedence defect is confirmed by source plus in-memory synthetic replay: a local edit preview derives the new name, but backend edits retain modifiers in `teacherDrafts` without updating the cached Contacts-derived name, so bootstrap/profile resolution can display the older name beside the saved modifier fields, and workbooks also prefer the cached `ttbName`. The ledger records exact pinned source links, synthetic examples and future acceptance checks covering preview/save/reload/selectors/exports/collisions/version independence. Contacts and Deploy must each derive from their own inputs, as the existing owner lifecycle design requires. The screenshot's activity/eligibility warnings are separate elements, not name suffixes. No real staff names, account identifiers or screenshot rows are copied into Git.

Earlier entries are preserved: ENV-17-001, DEP-17-001 and DEP-17-002. Their earlier text describes historical checkpoints; PR198's internal HR/role link fixes subsequently shipped in v1.03, but no hosted UAT closure or external catalogue overwrite is invented. Department issue DEP17-003 remains in separate PR201; its Muse-reviewed code head is not changed here. The requested row-by-row frontend Membership copy remains unperformed, and the old computer-control observation is historical rather than a new tool-availability check.

## Checks run (local worktree at the exact head)

- Scope: the diff against the base is exactly the two claimed files — `docs/coordination/tasks/v1-membership-frontend-uat-20261117.md` (10 insertions) and `docs/v1/DEPLOY_MEMBERSHIP_UAT_LEDGER_2026-11-17.md` (144 insertions) — 154 insertions, no deletions, no product/test/workflow path touched. All non-documentation paths match current main byte for byte. `git diff --check` clean.
- Merge-tree against current main: clean, no conflicts.
- Secrets scan of the diff: none. No staff names, account identifiers or screenshot rows in the new text; all examples use synthetic identities.
- Read the full DEP-17-004 section and the task-record additions. Verified each factual claim read-only against the pinned sources:
  - v0.9 `profileName_` (`backend/Code.gs` L1262 at `d9d180c`): Basic Name + Employment Modifier tokens + Subject Modifier tokens, comma-split, trimmed, each ` (token)`, + MK ` (mk)`. Matches the ledger's rule, including comma splitting, order preservation and no deduplication. The example `Synthetic Teacher (FAJT) (4/5) (MTL)` follows from Employment Modifier "FAJT, 4/5" and Subject Modifier "MTL".
  - `deriveContacts_` (`Contacts_Backend_v0.9.9.gs`): the same comma-split tag rule is used there.
  - v1 `previewTTb` (`v1/contacts/direct-fields.mjs` L291 at `d3bba19`): reads employmentTags, subjectTags and mkTags with visibility, deduplication and name-length rules; subject roles MTL/PE/Art/Music supply a required subject tag. The ledger's "Synthetic Gamma" row (`(FAJT) (PE) (Art)` with Role PE and Subject Modifier Art) follows that rule.
  - `mergeContacts` (`v1/services/deploy/model.mjs` L237 at `d3bba19`): `name`/`ttbName` set from the incoming Contacts-formatted string (`p.ttbName || native["TTb Name"] || p.name`).
  - Teacher edits (`v1/services/deploy/model.mjs` L791 at `d3bba19`): edits merge into `teacherDrafts[t.id]` only; no recalculation of the displayed name fields.
  - Bootstrap (`v1/services/deploy/service.mjs` L767 at `d3bba19`): `mergeContacts(doc, projection)` refreshes teacher rows from Contacts. `resolve` (`shared/teaching-rules.js` L12): overlays the draft profile but keeps the previous name (`Object.assign({}, t)`).
  - Teachers renderer (`public/app.js` L1367 at `d3bba19`): prints `t.name` beside modifier fields from the effective profile, with activity/eligibility warnings as separate small elements.
  - Workbook display (`v1/services/deploy/workbooks.mjs` L117 at `d3bba19`): `t.ttbName || t.profile?.["TTb Name"] || t.name || t.id` — prefers the cached name.
  - Relative link targets resolve: `../coordination/tasks/v1-deploy-internal-links.md` and `contacts/CONTACTS_LIFECYCLE_DESIGN.md#3-stable-identity-basic-name-and-independent-ttb-names` (heading "## 3. Stable identity, Basic Name and independent TTb Names" exists).
- No application build, Worker/D1 test or hosted check was run for this documentation update, and none is claimed; the PR body states that plainly.
- Note: the `docs/v1/AGENTS.md` supplement still says "Claude independently reviews" — that is the stale pre-16-November role text, superseded by the owner's 16 November directive. It is not part of this PR's diff and is not a finding against it.

## Findings

None. No findings.

## Note N1 (minor, not blocking)

One pinned line anchor is off by one: the ledger links `deriveContacts_` at `Contacts_Backend_v0.9.9.gs#L493`, but the function declaration is at line 494 (line 493 is the closing brace of the preceding function). The function and its rule are correctly identified; only the anchor line is off. A later ledger touch-up may correct it to L494.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner direction was investigation-only ("do not commit code, maintain change log"; "changelog: ttb name should include employment tags too; study v0.9 behaviour"); exact two-file documentation scope.
- Q02 Design and ownership: pass. Changelog and investigation only; the required future correction is recorded as acceptance checks, not implemented or implied as done.
- Q03 Security and privacy: pass. No staff data, identifiers or screenshot rows copied; synthetic examples only.
- Q04 Concurrency and recovery: pass. No product behaviour changed; no recovery claim made.
- Q05 Resources and maintainability: pass. Docs only; no dependency or workflow change.
- Q06 Verification: pass. Claims checked read-only against pinned source; exact-head Node/LORD CI green. No runtime UAT is claimed.
- Q07 Handoff and review: pass. This record; PR names the reviewer; draft, not merged.
- Q08 Release boundary: not applicable. No deployment, migration, live data or provider action. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

Changelog only. DEP-17-004 is recorded as OPEN: saved employment modifiers can persist while reload displays an older Contacts-derived name. The correction must cover previews, reloads, selectors and exports, and is not built in this PR.
