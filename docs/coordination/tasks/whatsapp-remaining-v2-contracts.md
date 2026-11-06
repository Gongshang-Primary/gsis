# WhatsApp remaining v2 contracts

- Status: claimed; evidence capture first, runtime integration pending
- Owner/model: Codex
- Reviewer/model: Muse (Claude when available)
- Last updated (Asia/Singapore): 6 November 2026
- Branch: codex/whatsapp-remaining-v2-contracts
- Base SHA: 10f7c064f56aa1c2c553c71e77e1b215a4073ce5
- User-authorised scope: capture the exact approved body and button contracts for gsis_contact_review_v2, gsis_relief_unacknowledged_v2 and gsis_relief_urgent_smc_v2, as requested by the owner on 6 November.
- Files/domains owned: this task and docs/reference/whatsapp-remaining-v2-contracts.json for initial evidence capture. Runtime follow-up owns notification-worker/template-contracts.json, relevant tests and canonical generated copies only after the build environment is restored and lane overlap is checked.
- Out of scope: live activation, Meta template edits, notifications, deployment, merges, school records, smc_attention and relief_evening.
- Acceptance checks: exact Meta APPROVED body, id, language and buttons; SHA-256 of UTF-8 body; correct positional field mapping; static URL buttons send no dynamic parameters; disabled default and v1 fallback; live contract mismatch fails closed; canonical build and full Node/LORD CI for runtime integration.

## Evidence and limits

Meta read-only listing and detail calls confirmed all three templates APPROVED on 6 November. All three buttons are static URLs, with no {{1}} suffix. Do not reuse private-link token parameter handling for them.

GitHub connector reads/writes are available. Direct git clone failed authentication (could not read Username for https://github.com). No authenticated local checkout is available, so no canonical build or local regression run is claimed. Preserve evidence now; do not claim runtime readiness until integration, generated parity, full CI and Muse review pass.

## Deployment

None. All activation settings remain unchanged.

## Handoff

Capture provider-derived contracts without sample recipient data. Then restore authenticated checkout, promote the three pendingVariants to validated variants, cover static buttons and unchanged fallback, regenerate, run full suite, and submit the exact head to Muse. Owner decides activation and merge.
