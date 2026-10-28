# Separate timetable preparation — 0.9.9 verification

The separate preparation runtime, UI and package use 0.9.9. Native manifests retain the O wire identity (`release: "0.9.8o"`, schema version 1); status explicitly reports `protocolRelease`. No storage schema, native snapshot hashes/source keys, dated selection, production routing or authority changes are introduced. The build source and bundle hashes change with the runtime label. The synthetic I rehearsal remains a retained compatibility fixture, not another live deployment.

Two regressions were run before implementation. The runtime compatibility case failed because status still reported O. The recovered-source case exposed an existing packaging defect: the documented exporter test required a helper omitted from the separate source package. That helper is now included; the bundled source also declares `jsdom`, required by its included Worker/browser test. Both regressions pass. The package uses the current setup guide and preserves the compact native contract reference rather than duplicating old operator-specific setup instructions.

## Local evidence

All 13 focused commands passed with `TZ=Asia/Singapore`. Exact commands, exit codes and raw output are under `verification/v099/preparation/results.json` and its referenced logs. Initial failing regression logs are retained separately. This is not a full-suite or live deployment claim.

| Check | Result |
| --- | --- |
| Native preparation source / generated bundle | 12/12 cases each |
| Native read-only exporter | 14/14 |
| Separate package, canonical verifier and recovered-source exporter | 6/6 |
| Synthetic rehearsal source / retained I bundle | 9/9 each |
| Offline rehearsal setup guard | 1/1 |
| P serializer-to-browser-to-importer export contract | 4/4 |
| Production export UI / authenticated routing | 3/3 and 2/2 |
| Existing Google recovery cache | 24/24 |
| Save acknowledgement/cache-warm separation | Pass |
| Generated preparation source/bundle parity | Pass |

The native tests execute real SQLite transactions and explicit mock R2/identity transport. They cover same-identity replay, concurrent CAS winners, D1 rollback, corrupt/oversized gzip and immutable objects, independent confirmed plans, source hash/chronology rejection, role/origin denial and unverified freshness. The generated bundle repeats the same behaviors. No real Google, Cloudflare, school account, provider or production data is contacted.

The existing Google recovery cache tests cover fresh permission checks, source changes, corrupted/missing data, old publisher races, publication/deletion races, bounded cleanup, quarantine grace, rolling-date retention and refusal to prune when reference evidence is incomplete. These are tests of the existing production cache. The separate shadow preparation Worker intentionally has **no pruning or delete capability**; passing the cache tests does not grant it that capability.

The two recovery-cache programs emit the repository's existing Node module-type inference warning. They pass without a package-module-mode change. Final release archive integrity is recorded in the enclosing release verification; these focused results do not replace that gate.

Independent read-only review found no blocking correctness, security or protocol issue and reran native preparation source (12/12) and exporter (14/14) under the Singapore timezone. Its wording clarification about native snapshot hashes versus build hashes is incorporated above.

A fresh non-Git extraction of the separate package also passed six commands: build, native Worker source, native Worker bundle, exporter, package regression and canonical archive verification. Evidence is in `verification/v099/preparation/recovered-source-results.json`. Only the already installed dependency directory was reused; no source files outside the extraction were needed. A fresh network dependency installation was not tested.

## Live evidence and remaining gates

The supplied P rollout report records an unedited native import into the existing O Worker: revision 2, six native parts, 15 verified projection hashes and 31 dates. This is earlier operator evidence, not proof of 0.9.9 installation or current source freshness.

Still required: real two-tab stale-revision testing; review of the shared production/rehearsal OAuth origin/client arrangement; real unlisted-account denial and private-bucket checks; live workload measurements; verified current Calendar date/parity and Contacts/Name Bridge identity; permission-filtered production readers; full source invalidation and ownership/rollback gates. No deployment, cutover, deletion, notification or overnight-intake migration was performed here.
