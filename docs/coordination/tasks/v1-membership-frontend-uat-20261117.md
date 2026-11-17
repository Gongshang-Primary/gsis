# Membership frontend copy and UAT — 17 November 2026

Model: Codex. Status: blocked on computer-control availability. Updated: 17 November 2026, 07:55 SGT. Reviewer: Muse. Branch: `codex/v1-membership-uat-20261117`. Base: `b2faf390ebdf75db721a2ef5bec0b98afc3484e7`.

Owner authorises copying the Membership matrix row by row from the v0.9 Deploy frontend to the v1 Deploy frontend and timestamping issues in a new Git ledger. Exact documentation allowlist: this task and `docs/v1/DEPLOY_MEMBERSHIP_UAT_LEDGER_2026-11-17.md`. No source implementation changes. Use only the requested frontends for inspecting and copying application data. Save and reload each copied row before marking it verified; do not publish a version merely to test copying. Preserve existing source data. No database/API substitution for the frontend task.

Computer-control discovery currently exposes no browser JavaScript, desktop interaction, viewer-opening or handoff tool. Environment status reports the managed environment running with remote desktop enabled and state unknown; that is not proof of an accessible browser. No rows have been inspected, copied, saved or verified. Record the environment blocker distinctly from product defects. Hosted Membership UAT remains Not tested. Resume when an actual interaction tool is exposed; inspect selected versions before editing and ask if multiple plausible targets make the destination ambiguous.

## Owner's later investigation-only direction — 17 November, 08:11 SGT

Owner supplied the v0.9/v1 HR Terms screenshot and instructed: “do not commit code, maintain change log”; investigate v0.9 initially. This task now records that frontend parity discovery in its existing two-path documentation scope. No application code edit, commit, build, migration, deployment or live data operation is authorised by this update. The earlier row-copy task remains unperformed; this source investigation does not claim frontend access.

The ledger records DEP-17-001 with the pinned v0.9 and v1 source evidence, expected draft/publication semantics, v1 replacement/save/import restrictions, existing policy/test conflict and future acceptance checks. Documentation only; no application tests run. Reviewed actual open PR paths: PR196 and PR182 do not overlap this task or ledger. Main at investigation start: `ecc26a6d69eff5411468daaf5463d83496633cc3`. Skill method: manual source/dependency tracing; no named skill executed. Independent read-only comparison performed by a Codex subagent; this is not reviewer approval.
