# Global Admin evidence retention preview

- **Status** Claimed on 23 November 2026, 11:36 SGT
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-core-retention-preview`
- **Base before claim** `d0ff8f5d6e8386295af04a4beaf4318402cc321e`
- **Owner basis** Measure first and show candidates and protections in Global Admin Toolbox. [Retention owner decisions](v1-core-evidence-retention-measurement.md#owner-decisions)
- **Exact scope** This task record, `v1/web/overlays/admin/index.html`, `v1/web/shared/admin.js`, `v1/web/shared/client.js`, and `tests/v1-product-core-retention-preview-browser.mjs`.

Show bounded dry-run counts for 90-day and one-year candidate windows using the existing Core endpoint. Show owner dependency protection reasons and indicate when the preview is incomplete. Use the existing Global Admin admission and protect the current-account context when requests complete.

Verify the built Toolbox against actual local Core and owner Workers and D1 with synthetic records. Confirm only exact dry runs use read-request client handling and create no pending cleanup write. Product deletion controls, duration selection, byte estimates, hosted restore and activation remain separate from this preview.
