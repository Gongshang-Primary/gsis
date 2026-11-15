# ASC subject identity and demand

Model: Codex. [Claim and four-path scope](../../coordination/tasks/v1-deploy-asc-subject-identity.md). Claude reviews the exact implementation head. Implemented and locally verified; exact-head full suites/CI and independent review pending. Not merged or deployed.

## Evidence

The copied v0.9 ASC exporter unconditionally maps `Science` to `Sci` and `PE` to `PHE` before looking up the selected version's load and Fortnight split. Native v1 versions can store the exact `Science` key. In a synthetic built-browser reproduction, a six-period Science assignment with three weekly double blocks lost its demand, produced two subject entities and could not export XML. The equivalent consistently keyed Sci fixture exported successfully. Source: `26bbccd229962700409bb6e9c80b1e9bec170d20`, `shared/asc-export.js` lines 8/59–61/82 and `v1/services/deploy/model.mjs` line 44.

This is separate from missing namespace, TTT crosswalk or class-local division data reported in UAT020. It is also separate from UAT014's input/navigation defect. Those settings must not be invented to make an export pass.

## Compatibility boundary

Adapt the asset copied into v1, leaving canonical v0.9 sources unchanged. Preserve the selected source subject and its exact values. A known legacy paired spelling is only a compatibility fallback when the exact source is absent; zero and invalid explicit values are not absence. Preserve already-valid legacy export identities, the saved namespace and explicit subject mappings. Conflicting definitions or duplicate teaching demand must block visibly, rather than silently selecting or merging facts.

TG actual period overrides remain authoritative, including zero. Their export identity is independent of unused level defaults: assigned TGs retain the existing profile mapping (Science→Sci and PE→PHE), while unassigned-only TGs retain their legacy raw identity. When includeUnassigned visits an already assigned TG, it must not add duplicate demand. This preserves tested valid legacy exports without changing source labels. The pre-existing profile may change an unassigned-only long-name TG identity when its first teacher is assigned; this repair does not redesign that transition, and installed-aSc repeat-import acceptance remains a separate gate. Preserve class-local divisions, co-teacher references, lesson-block keys and the existing XML profile. Export remains a pure local download from a frozen snapshot/settings combination; it does not save mappings or contact an external service.

The [aSc export skill](skill://user/6ada82d03e8c8191a64f562e42ddf844/export-asc-timetables/SKILL.md) supplies the identity and lesson-demand invariants used for this bounded repair. No skill repository or school reference data is copied into the product. Its historical reference profile does not prove compatibility with the currently installed aSc application. This task does not change that profile; installed-application import and repeat-import acceptance remain **Not tested**.

## Verification and handoff

Seven built-browser groups pass with synthetic source records. They exercise actual copied v1 code and the actual XML download: native and legacy pairs, explicit zero, absent/invalid/conflicting values, TG actual overrides, explicit crosswalks/class-local divisions, same-source co-teachers, repeated deterministic output, secure browser XML parsing and foreign-key checks, and no source mutation or external API writes. Covered valid legacy assigned and unassigned-only exports and IDs remain byte-identical. Mixed raw aliases for one target are rejected even when both would resolve to the same fallback; aliases for separate levels/targets with consistent explicit mappings remain valid. Equivalent active split counts and reordered block definitions do not create false conflicts.

Initial red evidence reproduced loss of the exact Science identity. A first attempted builder hook did not reach the embedded exporter and remained red; it was corrected to target the bounded embedded asset. Internal review found a raw Science/Sci assignment pair could collapse silently; the added regression failed before the duplicate-source guard. A later internal review reproduced an explicit TG lesson ID changing when only an unused level-default load changed. The regression now includes assigned and unassigned-only legacy byte parity, multilevel and zero overrides. The final unassigned-only compatibility refinement was green on its first run because the builder correction preceded that run; no separate red is claimed. Final and independent focused runs pass. Logs: `/tmp/gsis-asc-unassigned-tg-green.log`, `/tmp/gsis-asc-tg-identity-red.log`, `/tmp/gsis-asc-tg-nav-green.log`, `/tmp/gsis-asc-subject-red.log`, `/tmp/gsis-asc-subject-edge-red.log`, `/tmp/gsis-asc-subject-nav-final.log`, `/tmp/gsis-asc-subject-independent-final.log`.

Unchanged regressions pass: Fortnight browser six groups, Contacts recovery eight groups, draft-status browser six groups, twelve Core/Contacts programs, existing ASC demand/export/settings/UI tests, legacy ASC browser at 1400/800/390 widths and v1 Deploy exports. Canonical build passes with no tracked generated drift. Both runners discover the new program: 78 product and 1,177 Node programs. Parent builder content is byte-identical outside the new helper and call. Focused checks used working base `5d73579a3f9777c0235d01f7849e1329f0681f17` plus the four allowlisted paths; the PR will record the exact published implementation head, full suites and CI rather than claiming this precommit working tree is a clean commit.

```bash
export TZ=Asia/Singapore
export GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium
export ROSTER_TEST_CHROMIUM=/usr/bin/chromium
export LORD_TEST_CHROMIUM=/usr/bin/chromium
npm run build
node tests/v1-product-asc-subject-identity.mjs
node tests/v1-product-deploy-fortnight-browser.mjs
node tests/v1-product-contacts-recovery-browser.mjs
node tests/v1-product-deploy-draft-status.mjs
node tests/v1-product-deploy-exports.mjs
for f in tests/v1-core-*.mjs tests/v1-contacts-*.mjs; do node "$f" || exit; done
node scripts/v1/test.mjs --list
node tests/run.cjs --list
git diff --check
```

Full `node scripts/v1/test.mjs` and `npm test`/LORD, product build/dry-run/local-migration CI, exact tested head and Claude verdict are pending. Actual aSc import/repeat-import and hosted UAT are not replaced by synthetic structural checks.

Parent: frozen Fortnight fix `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, including PR163 and PR161. Main claim `34543928ad758f01d217573378e0651233e7c376` was merged into the child before editing. The parent code remains separately reviewable.

Rollback restores the alias defect without rewriting saved data. No schema, migration, server, credential, provider, live school-data, merge or deployment change. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. The next deployment label remains v1.01 under its separate task.
