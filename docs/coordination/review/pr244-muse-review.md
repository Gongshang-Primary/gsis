# Review: PR #244 — Add bounded validUntil-scoped Core-to-Contacts authority read cache (D01/D02)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `67853cc`.
- Branch: `antigravity/v1-core-auth-decision-cache`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## Note on the head

The originally reviewed head `d46e621` conflicted with main. The branch was rebased (same implementation, new head `67853cc`); this review is at the rebased head only. The earlier approval at `d46e621` never carried across.

## What it does

Adds a bounded `validUntil`-scoped in-isolate cache for Core→Contacts derived authority reads (`D01`/`D02`) in new `v1/services/core/auth-cache.mjs`, wired into `v1/services/core/service.mjs` and invalidated by `v1/services/contacts/service.mjs`:

- **Scope**: caches verified effective-SMC Contacts `/internal/authority` reads for non-mutating derived-capability checks only (`!d.write`), keyed per `(dbRef, schoolId, staffId, sessionId)`. A second read path reuses the in-flight `authority` object within one evaluation for the same staffId with effective SMC.
- **Expiry**: `Math.min(now + 15000, sessionExpiresAt, employmentActive.validUntil, field validUntil, next future validFrom)` — never past `validUntil` or session expiry. A missing or non-finite session expiry yields an expiry of 0, so nothing is cached. Fail-closed.
- **Bound**: LRU capacity 500 entries, evicting oldest first. Expired entries are deleted on read.
- **Never cached**: mutating writes (`d.write === true`), non-effective/denial paths, and error/unavailable outcomes always read fresh from Contacts, preserving fail-closed semantics and exact T1A denial-evidence recovery. Only reads that passed the SMC capability check (`value("smc") && caps.has(d.action)`) are stored.
- **Invalidation**: immediate, on Core `POST /logout` (by session), on Core account suspension/grant/linkage changes (by staff), and on Contacts accepted authority / active-status commits via `POST /internal/authority-cache/invalidate` (by staff, school-checked). The Contacts-side call is fire-and-forget (failure swallowed); the 15-second TTL bounds any missed invalidation.

## Scope, merge, secrets

- Diff vs the PR base: exactly 5 files, matching the task record's exact-file allowlist (task record, new `auth-cache.mjs`, `v1/services/core/service.mjs`, `v1/services/contacts/service.mjs`, new test). 647 insertions, 42 deletions.
- `git merge-tree --write-tree --name-only origin/main 67853cc` clean (tree 1463f994), re-checked against current main after the six approved PRs merged.
- `git diff --check`: clean. Secrets scan of the diff: clean — the only matches are a test-only synthetic secret value and redacted environment echoes in the test.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44878774741: **success at head 67853cc**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt244-review` at 67853cc, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-core-auth-cache.mjs`: exit 0, PASS — repeated reads reuse bounded cache, writes always read fresh, `validUntil` & TTL ceilings enforced, errors never cached, LRU bounded, Contacts revocation + logout immediately invalidate.
- `tests/v1-product-core-contacts.mjs`: exit 0, PASS.
- `tests/v1-product-core-identity.mjs`: exit 0, PASS.
- `tests/v1-product-core-denial-evidence.mjs`: exit 0, PASS.
- `tests/v1-product-core-provider-deadline.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed caching with strict expiry and invalidation, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
