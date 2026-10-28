# GSiS Suite v0.9: LORD components

LORD, OVERLORD and STARLORD use v0.9 in titles, asset revisions, backend health and Worker response metadata. The release replaces the standalone v1.8.1 label. Existing database schemas, booking records, pending receipts, cache keys and maintainer aliases remain compatible.

The suite includes the reviewed GSiS reference bridge: LORD retains its own Contacts and published Deploy snapshot, validates independent source revisions, preserves staff identity across renames and blocks stale recipient data at the send boundary. It keeps custom activities separate from published classes and TGs. Open forms pin their reference generation and provide a refresh path if publication changes.

The repository source, first time templates and historical test fixtures contain placeholders instead of private installation credentials. Existing deployments must retain their operational IDs, secrets, booking peppers and session settings when preparing configured files. Current packages require a successful complete test run and rendered browser checks; source hashes prevent packaging a stale verification result.

Live activation, provider acceptance and production deployment remain separate operational steps. See the integration review and setup documents for verified scope and limits.
