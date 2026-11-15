# v1 — PRs #159–#173 review (15 Nov UAT fixes), Claude

Project: **v1**. Model: Claude (v1 review session). Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner merges.

## Verdicts

| PR | Head | Own change | Verdict |
|---|---|---|---|
| #159 UAT tracker | `2a0b5f3` | docs, 2 files | **Approve** |
| #160 Deploy venue publication | `ab24739` | 1 commit | **Approve** |
| #161 Saved-draft venue controls (UAT019) | `1f4121a` | 1 commit | **Approve** |
| #163 Contacts save recovery (UAT004) | `175f34e` | 2 commits, on #161 | **Approve** |
| #164 Venue-clear Admin guards | `1137001` | 1 commit, on #160 | **Approve** |
| #165 Fortnight editor (UAT014) | `38dabe6` | 1 commit, on #163 | **Approve** |
| #166 aSc subject identity | `5a2affa` | 1 commit, on #165 | **Approve** |
| #167 LORD cart groups | `af6065e` | 1 commit, on #166 | **Approve** |
| #168 Deploy save recovery, LORD drafts | `ecaa37e` | 1 commit, joins #164 and #167 | **Approve** |
| #169 Venue-use metadata | `f145434` | 1 commit | **Approve** |
| #170 Venues fence query bounds | `01c1db1` | 1 commit | **Approve** |
| #171 Venues subpath navigation | `eb63f82` | 1 commit | **Approve** |
| #172 Roster admin settings | `d3d76fc` | 1 commit | **Approve** |
| #173 Contacts projections, teaching eligibility | `f7f9ea2` | 1 commit | **Approve** |

Not reviewed: drafts #162 and #174.

## Method and its limit

The thirteen code PRs form one stack (#161→#163→#165→#166→#167; #160→#164; #168 joins both; #169→#173). #173 contains them all: 65 files, +23,425/−745. This is a risk-based review. I read every server-side change for removed or weakened permission and guard checks, read the riskiest changes in full, and ran the complete product suite once at the top of the stack. I did not read every client and test line.

## Evidence I produced

Worktree at `f7f9ea2` (#173), `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium:

1. `node scripts/v1/test.mjs`: **91/91 product programs pass**.
2. `npm run build` and `node scripts/v1/build.mjs`: success, no tracked drift.
3. Every PR merges cleanly with current main.
4. Every changed path is v1-only (`v1/`, `tests/v1-*`, `scripts/v1/`, `docs/v1/`, v1 task records). No v0.9 source or shared production file changed.
5. Privacy (public repository): all email and phone-like strings in the stack are synthetic test values (e.g. `81234567`, `Fallback@moe.edu.sg`). No real staff data.

Not verified by me: CI at these heads; behaviour on the live host.

## Guard and permission checks removed, and what replaced them

I listed every removed line in `v1/services` and `v1/runtime` that touches permissions, guards or checks:

- **#170 Venues**: per-room `rowGuard` pushes replaced by set-based guards over `json_each` that bind the same captured revisions in one statement. Same protection, bounded query size.
- **#172 Roster**: the admin "config" scope rule was extended, not removed (system-config reads and saves now share the config scope).
- **#173 Deploy, edit permission**: `prepare(ctx, "deploy.edit")` moved to the caller, which passes the prepared operation into `save`; the permission check still runs once per save.
- **#173 Deploy, "Choose active staff"**: the cached `active` check in `applyEdits` was removed. It is replaced at save time by `validateTeachingBindings`, which requires every newly assigned or changed teacher to have **current accepted teaching eligibility** from a fresh Contacts read (active, verified and not excluded). Stronger than before. Existing historical assignments may remain or be removed.
- **#160, #167**: the removed lines are refactors (input parsing, query arguments); guards were added overall (#160 +5, #164 +13, #167 +21, #168 +27, #172 +65).

No permission was loosened.

## Findings

### F-1 (medium, direction): v1 fixes increasingly patch v0.9 screens at build time

Nine of these PRs fix behaviour by text-patching v0.9 source inside `scripts/v1/build-web.mjs` (about 930 added lines across the stack). Patches fail loudly if the v0.9 text changes, which is right. But every v0.9 screen change can now break the v1 build, and the patch layer grows with each fix. Recommend the v1 coordinator plan to move the most-patched screens (Deploy, Contacts, Roster settings) into v1-owned UI modules, so v1 stops depending on v0.9 markup.

### F-2 (low, process): very large single commits

#168 is one commit of 14,500 lines, including 1,481 lines of `client.js`. Large commits make rollback and review coarse. Keep to the small-PR rule.

### F-3 (low, process): two commits lack the `Model:` label

`eb63f820` (#171) and `d3d76fc5` (#172) use `fix(v1): …`. Codex should label every commit.

## Merge order

Merge along the stack: #159 any time; #160 → #164; #161 → #163 → #165 → #166 → #167; then #168 → #169 → #170 → #171 → #172 → #173. Recheck CI at each head before merging.

## Status that does not change

F5 OPEN. Official T1B-01/T1B-02, hosted durable recovery, provider delivery and unperformed runtime UAT: Not tested.
