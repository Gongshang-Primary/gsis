# v1.04: release merged department save fixes

- Status: claimed; not deployed.
- Owner/model: Codex. Coordinator: ChatGPT. Product reviewer: Muse, PR201 exact head; no additional Muse round solely for this release label under the owner's latest instruction.
- Updated: 17 November 2026, 14:22 SGT (Asia/Singapore).
- Branch: `codex/v1-release-v104`. Base: main `9cc5cf0f64d0c15c633f168f7a81b12707f66ef9`.
- Exact file scope: this task; `v1/release.mjs`; `docs/coordination/OWNER_DIRECTIVES.md`.
- Owner scope: “deploy with all the recent merged”, followed by “skip excessive review. do full deploy in future to cut down muse reviews”. This supersedes the selective-default scope restriction. Use the existing protected full workflow; preserve CI, verified fresh backups, required-reviewer gate and safety settings. Routine release-label packaging does not require another Muse cycle. No functional product fix is added by this task.

## Release contents and ownership

Current live source is v1.03 `d3bba194f0dc162d38f0899dc4e0b6e5e1351fa2`. PR201, approved by Muse at `ac5575fe322dcbe08521288054f2c66e3e4defde` and merged unchanged as this base, is the sole new product change: Deploy department and related planning saves. Its Node/LORD44018861436 and product44018874666 passed at that exact head. PR196, PR197 and PR199 add documentation. PR197's TTb-name finding remains OPEN; its merge does not implement that fix. PR182 is v0.9 and excluded. Open PR/file inventory has no overlap with this claim.

The only application line to change is RELEASE_LABEL v1.03 to v1.04. Every other product path must remain byte-identical to merged, independently reviewed PR201. Add a dated directive recording the owner's latest full-deployment default while retaining the superseded row as history. No deployment machinery, dependency, schema, permission or provider change. Synthetic artifact comparison of live and pre-label main found semantic changes in Deploy and web assets; the other seven owner bundle differences remove an unused empty module/import only. The owner now explicitly requests full deployment, so the existing reviewed workflow can be reused unchanged.

## Acceptance and release sequence

Run existing real built-browser release-label and frontend parity checks, canonical build/no tracked generated drift, exact three-path scope and whitespace checks. Run required Node/LORD and product/package CI at the final release head, then verify final merged main. Record results and any failure honestly. Owner's current deployment instruction authorises the release merge; no extra model approval is claimed for this three-file packaging head.

After final candidate verification, take fresh full private exports of all eight owner D1 databases, Contacts last. The owner's prior explicit “pls export” authorises the staff-record exports through Cloudflare signed download links into the private workspace; SQL, links, credentials and records stay out of Git. Verify isolated SQLite import, integrity, foreign keys, schema and migration ledgers. Separate exports do not prove cross-D1 atomic recovery or hosted restore. Preserve R2 objects and private recovery evidence.

Dispatch main-only protected `v1-deploy.yml` with `DEPLOY ISOLATED V1`, provider upload false, exact final source and owner environment approval. Preserve resource identities, only existing GSIS_SECRET upload, sender/webhook ownership v0.9, scheduler disabled, Google/Drive inactive and retention deletion false. No live staff edit/import, permission publication, provider send, prune or integration activation as release tests. On partial failure inventory completed steps before retry decisions.

Verify nine live source/label/settings inventories, unchanged eight schema/ledger sets and private R2, plus public GET-only routing/assets. Record actual deployment evidence. F5 remains OPEN; T1B-01/T1B-02, authenticated Run B/runtime UAT, N-1 latency and hosted restore remain Not tested unless executed separately. Rollback must preserve all saved data, stable IDs, publications, frontiers, audit and receipts; an old binary does not undo writes.

## Gates and handoff

Q01 scope/authority: pass at claim. Q02-Q05: existing contracts reused; bounded label/directive change, no new persistence/concurrency/security boundary or dependency. Q06 verification: pending. Q07: product exact-head review already complete; owner requested no excess release-packaging review. Q08: deployment authorised, execution pending. Wrangler skill used for pinned local verification and existing protected workflow; no new installation or direct CLI production bypass. No source edit, fresh live export or deployment has occurred at claim publication.
