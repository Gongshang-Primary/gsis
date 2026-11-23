# Standing approval for v1 release backups

- **Model / owner** Codex, coordination documentation
- **Reviewer** Muse
- **Status** Claimed
- **Updated** 23 November 2026, Asia/Singapore
- **Branch** `codex/v1-standing-d1-backup-approval`
- **Base** `80f9347edd86f0c1cfcef66e045a1c5f379424b8`
- **Files** This task and [Owner directives](../OWNER_DIRECTIVES.md)

During the v1.12 release, the owner approved full schema-and-data backups of all eight existing live v1 D1 databases through Cloudflare-managed temporary export storage for private workspace download and verification. The owner extended the same approval to future requests to deploy v1 to the GitHub gate: “yes. in future deploy to git gate with approval granted for D1 databases”.

Apply the approval only after an owner request to deploy to the GitHub gate. Preserve exact release and resource checks, fresh backup verification, Contacts last, CI and the protected GitHub approval step. The owner approves the GitHub gate. Keep export payloads and signed URLs private.

The documentation change adds one directive and preserves all earlier directives. Workflow changes, data edits, retention changes and new destinations are outside this claim.
