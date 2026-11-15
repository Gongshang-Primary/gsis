# v1 — PRs #174, #175 and drafts #136, #137, #158, #162, Claude

Project: **v1**. Model: Claude (v1 review session). Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner merges.

| PR | Head | Kind | Verdict |
|---|---|---|---|
| #174 Contacts classification roundtrip | `ba81883` | code, on #173 | **Approve** |
| #175 Shared save-status warnings | `77e30ee` | code, on #174 | **Approve** |
| #158 Contacts direct-editing job | `16b7186` | docs (draft) | **Approve as document**; mark ready |
| #136 Contacts policy and simplified readiness | `0081eea` | docs (draft) | **Approve as document**, one refresh (R-1) |
| #137 Accelerated spec and Rev 49 source | `b6cd8f5` | docs (draft) | **Approve as record**, add header (R-2) |
| #162 UAT Run B handoff | `ee05242` | docs (draft) | **Approve as document** |

Not reviewed: #132 and #138 (assessed earlier as ones to close).

## Evidence I produced

- Worktree at `77e30ee` (#175, contains #160–#174): `node scripts/v1/test.mjs` **93/93 pass**; `npm run build` and `scripts/v1/build.mjs` succeed, no drift.
- All six merge cleanly with current main. Drafts change documentation only.
- Privacy scans (public repository): no real phone numbers, IDs or school emails in any of the six. #162 names only the owner.

## #174

Browser-side fix in `contacts-catalogues.js` plus a build patch. Untouched fields are omitted from saves; selections keep their exact catalogue reference (ID, revision, code) rather than matching by label; restoring a value clears its dirty state; unavailable or retired values are shown honestly rather than re-pinned. A bounded data-integrity fix. It does not extend catalogue authoring, so it does not conflict with #158's plan to remove the catalogue prerequisite; Contacts B will replace this screen.

## #175

Browser-side: the shared "save outcome unknown" warning now clears when the original operation is verified as settled, using the client's existing pending-operation map. The one change to an existing test (`deploy-save-recovery-browser`) makes it **stricter**: it no longer treats a real rejection as a lost commit, and waits for the saved snapshot before asserting.

## Drafts

- **#158** matches owner decisions: Global Admin or Contacts Power User edits directly in the Contacts viewport; the catalogue prerequisite is removed from ordinary writes; validation, accepted authority, Staff IDs, history, concurrency and recovery stay; no self-acceptance; role labels never grant SMC, EO or School Leader. #173's claim already names it as its controlling source.
- **#136** applies the owner's "Admin or Power User alone" rule (no approval stage, no notifications, no self-acceptance, audit kept) and simplifies the readiness check to one consistent read inside Contacts, per my C1. Main currently still states the old Admin-approval rule, so main is wrong until this merges.
  - **R-1:** it says "No authoritative v1 Contacts store exists in this repository" (true on 13 Nov; the v1 product now has one). Refresh that sentence and rebase before merge.
- **#137** is the requirements baseline the v1 product was built from; three files on main link to it.
  - **R-2:** later owner decisions supersede parts of it (Admin/Power User alone; Contacts B catalogue removal; inactive staff excluded from readiness). Add a header line saying it is the 13 Nov baseline and that `OWNER_DIRECTIVES.md` and later merged plans override it.
- **#162** records UAT Run B and owner migration decisions (v0.9 is the source of truth; current and future data only; Deploy excludes inactive staff, SAT, OSO, MK and other non-EO staff). Note for the owner: Run B **migrated real school data** into the v1 installation on the school hostname. That makes v1 hold personal data now; the earlier caution about treating further data loading as an owner decision applies.

## Merge order

After #173: #174 → #175. Drafts: mark ready, then #158 and #136 (after R-1) before Contacts B starts; #137 (with R-2) any time; #162 any time.
