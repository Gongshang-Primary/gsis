# PRs #154 and #155 review (14 Nov v0.9 updates into v1), Claude

Model: Claude. Reviewed 15 Nov 2026 (Asia/Singapore).

| PR | Head | Own diff | Verdict |
|---|---|---|---|
| #154 v0.9 inventory, release-label chrome | `344141a` | 4 files, +195/−2 | **Approve** |
| #155 Dated ad hoc relief eligibility | `a37869a` | 10 files, +688/−27 | **Approve** |

Advisory; the owner merges. Authority: owner instruction "read v0.9 repo. capture all updates done today. ensure that the updates are also integrated into v1 where applicable", recorded in both task files.

## Evidence I produced

Separate worktree per head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium:

- #154: v09-frontend-parity, navigation, web-browser: pass. `npm run build` and `scripts/v1/build.mjs` succeed; no drift.
- #155: roster-adhoc-parity, roster-adhoc-delivery, roster-adhoc-browser, roster-service, roster-capacity, capacity-notifications: pass. Both builds succeed; no drift.
- Merge-tree against current main: clean for both.

Not run by me: full Node/LORD and full product suites (Codex reports 1,169/1,171 Node, 70/72 product, 40 LORD green; #155 needed one retry after an existing table-test timeout).

## #154

`build-web.mjs` replaced a hard-coded `v0.9.9p` → `v1` substitution with `normaliseReleaseChrome`, which reads the current `gsisBuildLabel`, finds text nodes only inside title, header and release/footer elements (never script, style or template), and patches just those byte ranges. This survives future v0.9 label changes without rewriting other markup. `jsdom` is an existing declared dependency. The inventory document is honest about evidence types (source inspected vs owner-reported deployment vs verified).

## #155

New `eligibility.mjs` defines one rule: a dated ad hoc activation counts only for a matching permanent Staff ID, an EO or ad-hoc-eligible person, an exact valid date, and (when given) a listed period. Effects:

1. Context no longer promotes a Contacts-inactive person to `active` when they have a dated activation (including during `saveAdhoc`). Availability lives in Roster's activation records; Contacts employment status is untouched. The one changed assertion in `v1-product-roster-service.mjs` reflects this deliberate correction and is explained in the task record.
2. At send time, relief notifications to an inactive person re-read current activation rows from Roster D1 and are cancelled unless every relief period in the message is still activated. Non-relief messages to inactive people are cancelled. An explicit `notificationConsent === false` now cancels.
3. v0.9 `saveAdhoc` always stores `periods`, so existing records satisfy the new period check.

Sound. Sends remain behind `SEND_OWNER`.

## Notes for the owner (no action required for merge)

- The inventory records that v1 was **deployed** from `889669a` (workflow run 43605950624, 14 Nov). This is the first deployment I have seen recorded. It opens the way to close F5's live-recovery step in that environment when you choose.
- It also records Muse's retirement handoff (`9c69e76`). v0.9 production coordination and review need a named owner; that is a coordinator decision for the owner.
