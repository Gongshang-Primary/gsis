# v1 Deploy venue publication recovery

- Status: claimed; first bug in the 15 November queue, V1-20261115-01.
- Owner/model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Claude.
- Updated (Asia/Singapore): 15 November 2026, 08:58.
- Branch: `codex/v1-deploy-venue-publication`.
- Base: `8ec2315a162fcf48bbb5161572abbb51a3df53ed`; application source unchanged from `26bbccd229962700409bb6e9c80b1e9bec170d20`.
- Authorisation: owner now says “read project chat data clone uat ledger, treat them as change log for bug fixes too. proceed to work on them one by one”. This supersedes the recording-only hold for implementing reported bugs, including the preceding Deploy publishing report. It does not authorise merge, deployment or live-data operations.
- Background: PR159 at `cd2dca6951a8ddc22e6b88fff7a6cb17f06cd9ab` records the screenshot, evidence and future criteria. Original live receipt and clone cause remain unverified. The separate project chat ledger was unavailable through connected tools; owner asked for its entries/Git handoff. Do not invent ledger findings or expand into PR158's Contacts redesign.

## Exact seven-path implementation scope

1. `v1/services/deploy/service.mjs`
2. `v1/web/shared/deploy-publication.js`
3. `tests/v1-product-deploy-storage.mjs`
4. `tests/v1-product-deploy-venues.mjs`
5. `tests/v1-product-deploy-venue-ui.mjs`
6. `docs/coordination/tasks/v1-deploy-venue-publication.md`
7. `docs/v1/accelerated-delivery/DEPLOY_VENUE_PUBLICATION_FIX_2026-11-15.md`

Refresh/readiness validation must identify missing room references before immutable publication preparation. The existing explicit venue refresh may repair canonical metadata by exact ID while preserving Deploy-owned form assignments. Expose a safe refresh/review path with the new saved revision. Preserve original operation identity, immutable prepared payload, uncertainty, owner source fencing, current capabilities and school isolation. Never fabricate revisions or infer a live outcome. No Core/Contacts contract, Venues writer, migration, provider, v0.9 source or generated-output changes.

All 19 current open PR actual file inventories checked: no overlap with these paths. Existing implementation claims and lane instructions read; latest parity work is merged/deployed, with claim closure pending in PR144. This is the sole new implementation task; PR159 remains a separate documentation queue. Claim-only commit lands on main before application/test edits; branch continues from that claim. Root owns integration/docs/commits; delegated service and UI work must use disjoint paths within this claim.

## Acceptance and verification

Reproduce before fixing. Test missing/null/absent venue evidence, retained form/forms assignments during refresh, valid current publication, stale/deleted room/source outage, saved-revision conflict, unknown/aborted/committed receipts, duplicate retry and response loss. Include actual isolated Workers/D1 and built-browser mobile controls; no live stores or private staff fixtures.

Use `TZ=Asia/Singapore`: focused red/green tests, product runner discovery, canonical build/no tracked drift, full product programs, full existing Node/LORD suites and exact-head CI. Commands, exact head, outcomes, failures and omissions go in the fix handoff and PR. Claude independently reviews the exact head; subsequent code changes need updated review. Q01 scope/ownership inspection recorded; Q02–Q07 evidence pending. Q08 release Not applicable. Rollback reverts this code and UI only; it does not undo publications or delete recovery records.

Skill used: Pstack `principle-fix-root-causes` (`skill://plugins_6a85a87df50c8191bd7f010bb7b17794/principle-fix-root-causes/SKILL.md`), read for reproduce-first diagnosis and avoiding weakened validation. No third-party code copied.

No merge/deploy, live receipt lookup/retry, staff import or activation. F5 OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
