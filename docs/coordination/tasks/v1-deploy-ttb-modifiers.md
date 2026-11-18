# Deploy TTb Name follows the selected version's modifiers

Model: Codex. Status: claimed on 18 November 2026 SGT. Reviewer: Muse.

- Branch: `codex/v1-deploy-ttb-modifiers`. Base: `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed`.
- Owner requested a quick fix for PE missing from TTb Name. This is the same stale-name defect as DEP-17-004, previously requested for employment modifiers.
- Exact scope: this task, `v1/web/shared/ttb-name.mjs`, `v1/contacts/direct-fields.mjs`, `v1/web/shared/deploy-eligibility.mjs`, `v1/web/shared/deploy-ui.js`, `v1/services/deploy/model.mjs`, `v1/services/contacts/service.mjs`, and `tests/v1-product-deploy-ttb-modifiers-browser.mjs`.
- The other open PRs and already reviewed follow-up branches retain their current heads. The edits to Deploy's UI and model use separate hunks from those branches.

Deploy derives the current name from the selected version's effective Basic Name and modifier fields. The current formatter's ordering, visibility, aliases, kept suffix and length limit apply. Draft values are visible immediately, and saved values drive the reloaded name and export. Keep the stored Basic Name and the stable Staff ID. A read must not rewrite stored rows, earlier publications or Contacts. Existing authority and accepted workload inputs govern their separate decisions.

Use an actual built browser with synthetic Workers and D1. Cover the bare stale label with saved PE, an edit before and after Save, explicit clears, repeated tags in the existing Basic Name, retained name suffix, and exported names. The broader atomic TTb namespace work remains tracked in the Contacts lifecycle design.
