# GSiS Suite v0.9.2 validation

25 October 2026, Singapore. Full suite over `f1069a135d762ab4761fdb94172f96680ec4c849` (v0.9.1c). All nine frontends, six Apps Script backends and the Roster notification Worker are labelled 0.9.2. No live deployment, school-data changes, production settings or provider sends were performed.

## Executed release gates

1. `python3 scripts/build-release.py` passed, including the ES2020 syntax gate for 156 Apps Script sources and construction of the complete 23-member installation archive.
2. `GSIS_TEST_WORKERS=4 python3 scripts/verify-release.py` ran all 666 current GSiS programs. The initial run passed 663. The three failures and their passing follow-ups are recorded below; none remains unresolved.
3. `python3 lord-suite/tests/run_all_checks.py` passed all 33 programs, with zero failures.
4. `node tests/package.cjs` passed after rebuilding at the current commit. It verifies the 23 declared installation/document files, complete frontend assets, generated backend parity, runtime version labels, configuration contracts, offline guide links and SHA256 metadata.
5. Root independently reran `tests/stapler092-indexeddb-recovery-browser.cjs` in native Chromium. It passed a plan exceeding 1 MB, exhausted localStorage, IndexedDB-first persistence, exact request replay after a lost response/reload, copied-tab forks, conditional cleanup, both-store no-send, export, migration and account isolation.
6. Independent correctness and quality review reports record all established material findings as corrected and rechecked. Domain, persistence, source, jobs and native-browser checks cover booking competition, current permissions, source-fence ambiguity, per-occurrence transfers, approval notices, stale email reconciliation, manager links, closures and recurrence preview coverage.
7. Root inspected desktop and mobile Venues screenshots. Browser suites exercise 1920/1366/390/360 widths, keyboard selectors, note whitespace/escaping, cache reuse and rejected uncovered dates. Architecture verification checks 49 source ranges at runtime integration commit `44252bd`, actual HTML rendering/browser behavior, and editable Draw.io structure. See the committed architecture receipts for detailed evidence.

## Initial failures and exact follow-ups

| Program | Cause | Correction and fresh result |
| --- | --- | --- |
| `release083-class-field-arrows.cjs` | Read localStorage synchronously before the new asynchronous recovery write completed | Commit `426db30` adds bounded waits around the existing persistence and server-save assertions. Root rerun passed; runtime unchanged. |
| `release505-timing.cjs` | Counted Roster's separate recovery ScriptLock as a Deploy planner lock | Commit `6a6ebf8` scopes the planner rule and explicitly checks the independent Roster recovery lock/finally path. Root rerun passed; runtime unchanged. |
| `package.cjs` | Archive metadata named the earlier build commit after source integration was committed | Rebuilt at the current commit; the unchanged package gate passed. The final tagged package is rebuilt and checked again before delivery. |

The result is 666 passing current GSiS programs across the complete run and targeted follow-ups, plus 33 passing LORD programs. Seven explicitly historical programs and nine helper files remain excluded by the established release runner; they are not counted as passes. Initial failure records are retained in the local verification output rather than rewritten as an all-green initial run.

The run reused installed jsdom/JSZip and native Chromium through the existing `NODE_PATH`, `GSIS_BROWSER_EXECUTABLE`, `ROSTER_TEST_CHROMIUM` and `LORD_TEST_CHROMIUM` environment settings. No missing dependency was counted as a pass.

## Performance, security and limits

The measured backend operation-count tests show two full state loads for a warm Venues read (previously three) and two for a warm booking (previously four). A fresh Contacts manifest and final locked identity, permissions, source-fence/freshness and conflict checks remain authoritative. This is an operation-count improvement, not a measured production latency claim. The backend still reads its complete retained tables; production data volume and Apps Script quotas need operational monitoring.

Current tracked text was scanned for recognizable Google API, Meta, GitHub, Telegram bot, private-key and JWT credential patterns; no candidates were found. Runtime configuration is externalized in the documented settings. Pattern scanning does not prove absence of every possible secret. Only the current source and incremental history after v0.9.1c are packaged, excluding earlier history that may contain retired configuration values.

Local checks do not verify live Cloudflare bindings, current Meta template approval, school account authorisation, provider delivery or morning throughput. Native Draw.io rendering was unavailable; its structural/semantic checks passed, while the companion HTML was rendered and inspected in real Chromium. The actual repository origin is a local recovery bundle, so source evidence is verified with local Git objects rather than an invented hosted repository link.

After the release commit, `v0.9.2` must identify HEAD. The final build and package gate run again; `scripts/package-suite.py` requires clean source, current committed deployment metadata and passing source parity. The resulting outer ZIP records the exact commit, tag, member hashes and incremental-history baseline. Its own commit cannot be embedded in this committed file without changing that commit.
