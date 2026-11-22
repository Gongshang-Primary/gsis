# v1-ci-skip-v09-shards

- Status: PR open for Muse review. Owner/model: Claude. Merger: GPT. Project: v1 CI.
- Owner 22 Nov 2026: "our work should be on v1 only", then "drop all v0.9 changes" → "Stop v0.9 CI on v1 PRs".

## Change
- `.github/workflows/verify-queue.yml`: new `scope` job. If every file changed since main is under `v1/`, `scripts/v1/`, `tests/v1-*`, `docs/v1/`, `docs/coordination/` or `.github/workflows/v1-*`, the four v0.9 regression shards are skipped and the required `full-suite` check reports success. Any other path (including `shared/` that v1 also imports) runs every shard as before.
- `.github/workflows/v1-build.yml`: runs the 16 v1 contract tests (`tests/v1-*.mjs` outside `v1-product-*`) that previously ran only inside the v0.9 shards; triggers on `tests/v1-*`.

## Verification
- Both workflows parse as YAML. The scope script, run locally: `claude/v1-roster-contact-review`, `claude/v1-inbox-alert`, `claude/scan-v1-antigravity-prs-yc3gxq` → v1-only true; this branch → false (it runs every shard).
- The 16 v1 contract tests pass locally (TZ=Asia/Singapore).

## Risk
`full-suite` is a required check, so it still always reports. The v1 product job remains the gate for v1 code. No v0.9 product code, test or generated file changes.
