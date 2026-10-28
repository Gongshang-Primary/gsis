# LORD components in GSiS Suite v0.9

24 October 2026, Singapore. The v0.9 source supersedes the standalone LORD v1.8.1 release label. LORD, OVERLORD and STARLORD titles, asset revisions, backend health and Worker response headers use 0.9. Persisted schema, cache, draft and request identifiers retain their existing values.

The repository-safe source includes clean configuration placeholders and sanitized historical regression fixtures. Ten inherited private configuration values, including the original backend URL, were removed from the exported tree. Fixture provenance hashes were regenerated only after this configuration sanitization; the retained function/schema comparisons remain active.

A fresh sequential run of `python3 tests/run_all_checks.py` completed with all 23 registered programs passing on the clean exported tree. This includes the genuine Chromium reload checks, both LORD/OVERLORD reference UIs, 12 independent identity/history checks and eight signed cross-application contract checks against the actual GSiS source endpoints. No live service calls or provider messages were made.

The complete test summary reports `releaseVersion: 0.9`, `passedPrograms: 23`, `failedPrograms: 0`. Browser executable and GSiS companion source were supplied through `LORD_TEST_CHROMIUM` and `GSIS_SOURCE_ROOT`. Root suite verification will additionally run these programs from the committed `lord-suite` subtree.

Release preparation also tested a temporary 0.9 to 0.9.1 bump and reversal. All 112 static checks passed at both versions, and reversing the bump restored every source byte. The root suite bump process can call `tools/bump_suite_version.py VERSION`, which updates the explicit current release pins and rebuilds clean templates.

The standalone package builder requires a fresh complete source fingerprint, 23 passing programs, successful rendered browser verification and byte parity with the clean templates. Its component ZIPs contain placeholders and must be configured with existing installation values before deployment. Current upgrade guidance preserves legacy booking peppers and session secrets; the new-instance configurator must not regenerate those for an existing installation.

Live deployment, trigger timing, production concurrency, staff device acceptance and provider delivery are outside these local checks. Consult `SETUP.md` for installation and activation.
