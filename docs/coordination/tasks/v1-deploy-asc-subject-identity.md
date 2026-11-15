# v1-deploy-asc-subject-identity: preserve source loads and block mappings

- Status: merged through PR175; PR166, reviewed head `5a2affa6a99ac4511644d0b3e01bcae827774dae`, carrying merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`. Not deployed. See the 16 November checkpoint below; older pending statements are historical.
- Owner/model: Codex; v1 coordinator ChatGPT; independent exact-head reviewer Claude.
- Updated (Asia/Singapore): 15 November 2026, 10:51.
- Branch: `codex/v1-deploy-asc-subject-identity`.
- Refreshed main: `57c9223b532d5bf6c84ef6b5ffdb79059a5e3cc1`.
- Implementation parent: frozen Fortnight fix `codex/v1-deploy-fortnight-editor`, exact `38dabe6ad46a5f0fdf37baa92811ffca86206cf7` (contains PR163/PR161).
- User authority: continue serial frontend UAT repairs and recursively consume Git v1 discoveries. This source defect was found while investigating ledger UAT020, separately from the Fortnight input defect and missing migration settings.

## Exact four-path scope

1. `scripts/v1/build-web.mjs`
2. `tests/v1-product-asc-subject-identity.mjs`
3. `docs/coordination/tasks/v1-deploy-asc-subject-identity.md`
4. `docs/v1/accelerated-delivery/ASC_SUBJECT_IDENTITY_FIX_2026-11-15.md`

Adapt only the ASC asset copied into v1. Do not edit canonical v0.9 `shared/asc-export.js`, source workloads, server contracts, saved mappings, namespaces, schemas, dependencies, tracked generated files or real school data. No merge, deployment, migration, provider or installed-aSc operations.

## Evidence and overlap

At source `26bbccd229962700409bb6e9c80b1e9bec170d20`, `shared/asc-export.js` lines8/59–61 unconditionally maps Science→Sci and PE→PHE before the exact-key load lookup; line82 uses the rewritten subject for the Fortnight key. Native v1 defaults use Science. A built-browser fixture with six Science periods and three double blocks produced missing demand, two subject entities and no XML. The equivalent consistent Sci fixture produced six periods, three doubles, one subject and a5081-byte XML. Local evidence: `/tmp/gsis-export-asc-investigation/science-probe.json`. No runtime/import acceptance is claimed.

The same investigation did not reproduce the historical Excel timeouts with school-size synthetic data. It does not justify an unrelated export rewrite or close provider/tool failures.

Current root/v1 instructions and engineering/coordination records read. Explicit all-head fetch found no new external discovery changes; all24 open PR actual file inventories inspected. Builder overlaps are frozen PR161/PR163 and the same builder's frozen Fortnight parent; retain all parent changes. Current review/discovery pins remain Claude58e22a7bf7ba4a49caa2caabe877605153b098db and Run B8317d8a033b2bae443f2e8cbff79b5c010754435 (PR162).

V1 coordinator permits this sequential stacked task while frozen predecessors await review. Publish this claim only to main through non-force expected-head update, re-read it, and immediately merge the accepted claim into the child before edits. No parent-branch edits; changed parents require child revalidation. Existing production coordination remains unchanged.

## Design and acceptance

Preserve actual source subject identity, exact loads and level/subject block keys. Use the existing legacy alias only as an unambiguous compatibility fallback when the exact source is absent. Distinguish absent from zero; do not invent demand or default every lesson to singles. Conflicting alias definitions, loads or mappings must produce a visible blocker rather than choosing silently. Keep TG actual loads, class-local divisions, explicit subject crosswalks, teacher references and stable namespace/export IDs. Do not merge subjects merely because labels resemble each other. Preserve valid existing legacy exports.

Explicit and multi-level TG compatibility: unused level-default loads must not change export identity. Retain the existing profile mapping for assigned TGs and raw identity for unassigned-only TGs; do not double-count an assigned TG when includeUnassigned is selected. This leaves the historical first-assignment identity transition as an explicit installed-aSc validation limit, without rewriting any stored source or mapping.

Use actual built ASC code and a browser download with synthetic data. Test Science/Sci and PE/PHE, exact and fallback keys, zero/missing/conflicting loads and splits, TG load and crosswalk/division preservation, deterministic repeated XML, no duplicate lesson demand, valid foreign keys and unchanged IDs for already-valid exports. Reparse downloaded XML securely. Preserve no-network pure conversion and unchanged source snapshot; no stored-map writes during download.

Skill applied: `skill://user/6ada82d03e8c8191a64f562e42ddf844/export-asc-timetables/SKILL.md`, read15November. Apply its identity, block-count and structural/semantic validation rules. This repair retains the current compatibility profile; fresh installed-aSc export/import and round-trip acceptance are separate unperformed gates, not claimed or requested as a prerequisite to this source repair. Do not copy the skill or private reference files into the product.

Run TZ=Asia/Singapore focused red/green, unchanged existing ASC/Deploy and parent browser regressions, canonical build/no tracked drift, discovery, full product and Node/LORD exact-head CI. Record actual head, failures and omissions. Claude independently reviews.

## Handoff

Q01 passed: claim accepted on main at `34543928ad758f01d217573378e0651233e7c376`, merged into the frozen parent before editing at `5d73579a3f9777c0235d01f7849e1329f0681f17`. Q02–Q05 passed: bounded v1-only adapter, exact identity/zero/conflict handling, no data mutation, four owned paths and unchanged parent code outside the helper/call. Q06 focused/build/discovery passed; full exact-head suites/CI pending publication. Q07 Claude pending; Q08 no release action. [Verification and limitations](../../v1/accelerated-delivery/ASC_SUBJECT_IDENTITY_FIX_2026-11-15.md) and the PR provide the tested implementation SHA and final CI evidence.

Rollback restores the alias defect without data/schema changes. F5 remains OPEN. Official T1B-01/T1B-02, runtime UAT and installed-aSc application import remain Not tested. The next deployed release remains v1.01 under the separate version task.

## Merge checkpoint — 16 November 2026 (Asia/Singapore)

[PR166](https://github.com/helper-gsps/gsis/pull/166) at reviewed head `5a2affa6a99ac4511644d0b3e01bcae827774dae` is included in main by [merge `334731cdb1d4fc5d37d7bdf6de761d668c062994`](https://github.com/helper-gsps/gsis/commit/334731cdb1d4fc5d37d7bdf6de761d668c062994). [Claude's controlling review](https://github.com/helper-gsps/gsis/blob/afeba886cd97f365cfb530200bcf46309812cd1b/docs/coordination/review/v1-pr175-chain-claude-recheck.md) and green exact-head CI were checked before integration. The task claim is closed; prior implementation, test failures and pending checkpoints above remain dated history.

The owner amended the sequence to merge PR175 once, preserving all eleven reviewed heads. This head is an ancestor of that carrying merge; it was not separately reimplemented or resolved by hand. The resulting product tree equals the tested tree outside two review documents. [The merge inventory](v1-merge-records-20261115.md#verified-merge-inventory) records the exact heads, carrying commits and verification. Not deployed; no new hosted UAT, migration or provider send. F5 remains **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
