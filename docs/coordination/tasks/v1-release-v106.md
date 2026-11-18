# v1.06 release

- Model: Codex
- Status: claimed on 18 November 2026 SGT
- Owner instruction: “deploy”. Use the standing full-release workflow and increment the v1 display label.
- Branch: `codex/v1-release-v106`
- Base: `bea573dcd65a75d4776bc0667c210977c9d2dff1`
- Previous live release: v1.05 at `1c42db77f1fec0a92e2beac289865ae742a26475`, [protected run 44087208582](https://github.com/helper-gsps/gsis/actions/runs/44087208582).
- Exact new edits: this release task and the display-label constant in `v1/release.mjs`. Open PR #182 is v0.9 and outside this release.

## Reviewed release contents

| PR | Change | Muse-approved head | Merge |
| --- | --- | --- | --- |
| #206 | Deploy Subject Load column order | `3b4eeab` | `5df8b98` |
| #207 | Deploy TTb modifier display | `559a760` | `22c4192` |
| #208 | Roster WhatsApp receipt ordering and early delivery evidence | `6435389` | `43d6e6c` |
| #209 | Roster offline Excel exports | `b33a42a` | `1fea93e` |
| #205 | Explicit Deploy Duplicate source and Versions note controls | `456f264` | `6b0b171` |
| #210 | Repeated saves for notes on a version that is not loaded | `1d68662` | `bea573d` |

The combined product tree at the base is identical to #210's CI-green head. No migration changed since v1.05. The four separately approved branch heads for layout, compact tables, inheritance and department moves remain outside this release. The owner directive dated 17 November waives a separate Muse review solely for the routine label and release paperwork.

## Verification and release

Run canonical build and tracked-drift check, local release-label and frontend-parity checks, and full Node/LORD and product CI at the release candidate. Verify the main merge tree against the tested candidate. Take fresh full private backups of all eight owner D1 databases, with Contacts last. Verify the isolated SQLite imports, integrity, foreign keys and migration/schema evidence. Keep backup files, signed links, credentials and owner data private.

Dispatch the existing main-only protected deployment with provider credential upload disabled. Use the environment reviewer gate through the GitHub run page. Preserve resource identities, existing setting values, v0.9 sender and webhook ownership, disabled scheduler, private R2, inactive Google integrations and retention deletion disabled. Verify workflow completion and safe public reads and release metadata. Do not exercise hosted writes or send notifications as part of verification.

Hosted authenticated UAT, restore and provider delivery are untested. F5 remains open. Rollback requires separate owner approval and must retain stored state, stable identities and receipts.
