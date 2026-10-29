# roster-d1-chunked-import: import the Roster into D1 in pieces

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 09:42
- Branch: codex/roster-d1-chunked-import
- Base SHA: 0b42df332d09f62e22b39071000cf11d40aa365f
- Current head SHA (or PR head; avoid self-referential commit hashes): none
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: review Claude PRs #2–#6, build roster-allocation-run-once first, then claim and build this task as priority 2. No ROSTER_EDGE_AUTHORITY switch.
- Files/domains owned (include generated outputs): backend/RosterEdgeMigration.gs and the Roster dispatch allowlist (export side); canonical shared edge-store/import helpers and shared/edge-setup.js; roster-update/public/edge-roster.js; builders and generated backend/browser/Worker copies; focused tests, runtime profiling evidence, task/changelog/roadmap records.
- Out of scope: activation (edgeFence), notification Worker, quiet mode (PR #5), absence policy.
- Acceptance checks: see below.

## Problem (evidence, 29 Oct 2026)
- Production import from `roster.gsps.edu.sg/edge-setup` fails with "The response could not be read" (~05:05 SGT). D1 heads stayed `legacy`, revision 0 (verified by query). Likely cause: the Pages Worker holds the whole export (`Roster operations.json` 13.7 MB plus notification transport 2.2 MB, inbox, intake) as text, parsed object and packed copy at once, over the 128 MB Worker memory limit and possibly CPU time.
- `rosterEdgeSnapshot_` (`backend/RosterEdgeMigration.gs`) returns everything in one response; `edgeRosterMigration` `import` (`roster-update/public/edge-roster.js` ~line 209) parses, packs and `importState`s it in one request.
- Hard save limit: `rosterOperationsCommit_` refuses above 16,000,000 characters; the file was 13.72 MB at 04:17 SGT and grew ~383 KB in 5 hours. Weeks of headroom at most.

## Design brief (proposal; implementer decides)
1. Backend export in pieces: `edgeExportManifest` (source digest, list of parts with ids, byte sizes and digests) and `edgeExportPart` (one part by id: settings/config, absences by month, assignments by month, audit by month, outbox, receipts, transport, inbox, intake, register). Each part well under 1 MB. Parts are taken from one snapshot (one lock) and staged (for example in CacheService or a temp Drive file keyed by the digest) so later part reads do not re-read the 13.7 MB file.
2. Worker import in steps: one request per part (or a small batch), each validated against the manifest digest and written to D1 via a resumable staging area; progress recorded so a retry resumes. No request holds the whole Roster.
3. Final step assembles the head (`imported`, source digest) only when every part's digest matches the manifest.
4. Keep: admin checks, exported model/archive identity checks (PR #2), activation's exact-digest check under the writer fence.

## Acceptance checks
- Import of a fixture at production size (about 14 MB) completes within Worker memory and CPU limits, measured in a test.
- A missing, duplicated or altered part is refused; a resumed import continues from the last committed part.
- Imported D1 state equals the single-shot import on small fixtures (existing `roster094-edge-roster.mjs` cases).
- Nothing switches users; heads remain `imported`.

## Handoff
Next: Codex claims, branches from current main, and coordinates with Claude's open Roster PRs (#2, #3, #5) under the serial Roster rule.

## Claim and serial handoff, 29 Oct 2026
Codex completed the first task and opened allocation PR #7 for Claude at `6744cf232848089af771ed085d97bffca8f6e146`; that branch is now handed off for review. This is the only next implementation claimed in this session, following the owner's explicit chat order. The later plan adds WhatsApp summary work, which is not included here. Claude retains PRs #2/#3/#5 and their fixes. Reuse PR #2's captured model/archive identity checks, and regenerate shared bundles when the PRs are integrated. Do not merge or deploy any branch as part of this claim.

The implementation will freeze one immutable export, serve bounded verified parts, stage rows and durable part receipts, and finalize both scopes only at imported. Status/resume must avoid full-state reads; accepted progress is not completed import. Existing activation fencing and Google authority remain unchanged. Local production-size Worker measurements and failure/replay tests are required before handoff; no real school snapshot or notification will be used for testing.
