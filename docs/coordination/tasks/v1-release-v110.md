# v1.10 release

- Model: Codex
- Status: claimed on 22 November 2026, 21:08 SGT
- Owner instruction: “deploy to gitgate”
- Branch: `codex/v1-release-v110`
- Implementation base: `23bc2404807e4022fa0fc8395e2f10312d0c73c5`
- Previous live release: v1.09 at `e107b5ed62db6cfa2c59f61367902bb2f8957f9e`. [Protected run](https://github.com/Gongshang-Primary/gsis/actions/runs/44754930695)
- Exact scope: this task record and the shared display label in `v1/release.mjs`. The owner’s 17 November full-deployment directive covers the label increment.

## Release contents

The release includes reviewed changes merged since v1.09, including Deploy save recovery, planning and Audit, Roster notifications, Calendar import, Venues setup, Layout, LORD, Contacts and Core. The merged changes also include v0.9 recovery work on main. This run targets the protected v1 environment. [Merged source](https://github.com/Gongshang-Primary/gsis/compare/e107b5ed...23bc2404)

The migration files and protected deployment workflow match v1.09. Provider credential upload is disabled for this run. Core evidence deletion, Google integration activation and new WhatsApp template activation remain outside this release instruction.

## Verification and approval

Run the canonical build and drift check, v1 build and configuration validation, release label and frontend parity checks, and the exact-candidate queue and Product CI. Verify the final main tree matches the tested candidate. Take and verify eight fresh private full D1 backups bound to final main, with Contacts last. Record the results and exact source in the PR.

Dispatch the existing `main`-only full deployment and hand off at `gsis-v1-owner-approved`. The owner approves in GitHub. Hosted signed-in UAT, provider sends, template activation and hosted restore require separate evidence.
