# v1.07 release

- Model: Codex
- Status: claimed on 19 November 2026 SGT
- Owner instruction: “merge and deploy”. Use the standing full-release workflow and increment the v1 display label.
- Branch: `codex/v1-release-v107`
- Reviewed implementation base: `0d88c85a544075490a9045885bdb0d5508871c3a`
- Previous live release: v1.06 at `bd77b27deab417afce859cd80465d7c608ae0ab2`. [Protected run 44302602255](https://github.com/helper-gsps/gsis/actions/runs/44302602255)
- Exact file scope: this release task and the label constant in `v1/release.mjs`. The open v0.9 draft #182 is outside the release.

## Reviewed release contents

| PR | Change | Muse-approved head | Merge |
| --- | --- | --- | --- |
| #213 | Calendar multi-room validation | `4f959c5` | `73390c1` |
| #214 | New Deploy version inheritance | `a48b2d0` | `69436e0` |
| #215 | Roster SMC duty visibility after save | `cacc043` | `7a4159f` |
| #216 | Confirmed Deploy department moves | `5cb7399` | `987873e` |
| #217 | Calendar year generation and Week 0 | `18b2141` | `8a66bfa` |
| #218 | Venues physical register and Excel import | `54562e0` | `4746103` |
| #219 | Core final-denial evidence | `74e5559` | `11fc7f8` |
| #220 | Deploy Layout campus map | `42a77be` | `a0d7707` |
| #221 | LORD five-minute collection and return reminders | `66109e4` | `cc28a59` |
| #222 | Venues notification links | `8fd61b0` | `795c310` |
| #223 | Deploy table compaction and HR Settings tab order | `4893d41` | `4102dd0` |
| #224 | Roster Statistics and cumulative R% | `de8864f` | `0d88c85` |
| #225 | LORD overdue Telegram monitor | `cf4caa0` | `4794288` |
| #226 | Saved Deploy teacher membership and deletion | `c4544ef` | `12c6ca0` |
| #227 | Cursor Team Kit reference in the v1 skill policy | `2c1defe` | `79cde0f` |

The #224 merge includes the reviewed test-only fixture update for #226. The product tree at the implementation base matches that CI-tested head. No v1 SQL migration, deployment script or deployment workflow changes since v1.06. The 17 November owner directive covers the routine label and release paperwork. Thermonuclear execution remains paused.

## Verification and rollout

Run the canonical build and drift check, focused label and frontend checks and full Node/LORD and product CI at the release candidate. Verify the final main tree against the tested candidate. Take fresh full private backups of the eight owner D1 databases, with Contacts last. Verify the isolated SQLite imports, integrity, foreign keys, schemas and migration ledgers. Keep backup data, signed URLs and recovery details private.

Dispatch the existing protected main-only workflow with provider credential upload disabled. Preserve resource identities, current provider/send and webhook ownership, scheduler state, private R2, Google/Drive activation settings and retention settings. Verify completion with public GETs and release metadata. Keep authenticated hosted UAT, provider delivery and restore separate from deployment verification.

F5 and #212 remain open. A rollback needs separate owner authorisation and must preserve stored records, identities and receipts.
