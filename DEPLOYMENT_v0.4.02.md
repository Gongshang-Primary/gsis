# GSiS v0.4.02

This package updates Contacts, Deploy and Layout together. It includes three Cloudflare Pages ZIPs, two combined Apps Script files and the complete source. The live installation has not been changed.

## Install and migrate

1. Finish open saves and pause editing during the upgrade. Copy both spreadsheets and both existing Apps Script projects. Keep the v0.4.01 deployment package.
2. Replace the existing Contacts script with `Contacts_Backend_v0.4.02.gs`. Save and update its existing web-app deployment using **Manage deployments → Edit → New version → Deploy**. Keep the deployment URL and secrets.
3. Replace the existing Deploy script with `Deploy_Backend_v0.4.02.gs`. This file includes the seed; remove any separately installed Seed.gs to avoid duplicate definitions. Keep the existing spreadsheet IDs and connection properties.
4. In the Deploy script editor, run `preflightFieldStore`. It validates every working version by flattening and reconstructing its data. Stop on any error. Run `migrateFieldStore`, then run `preflightFieldStore` again; every working version should report `storage: fields` and `valid: true`. Legacy snapshots and the existing published pointer remain available. Migration does not publish drafts.
5. Publish a new version of the existing Deploy Apps Script web app.
6. Upload `Contacts_Frontend_v0.4.02.zip` to **gsps-gsis**, `Deploy_Frontend_v0.4.02.zip` to **gsps-deploy**, and `Layout_Frontend_v0.4.02.zip` to **gsps-layout**.
7. Hard-refresh each viewport and verify v0.4.02. Old Deploy clients are rejected on write until refreshed.
8. Check the selected version's Membership, Subject Load, PLT, Events, Fortnight Split and Duty. Save a small edit, confirm **Saved**, refresh and verify it. Publish the intended version through the normal Admin review. Check Contacts filters and Layout against that published version.

If the explicit migration is omitted, a legacy working version migrates on its first successful save. The explicit preflight/migration above is preferred for a controlled upgrade.

| Connection | Target |
| --- | --- |
| Contacts Pages `APPS_SCRIPT_URL` | Contacts Apps Script `/exec` |
| Deploy and Layout Pages `APPS_SCRIPT_URL` | Deploy Apps Script `/exec` |
| Deploy Apps Script `CONTACTS_API_URL` | Contacts Apps Script `/exec` |
| Contacts Apps Script `DEPLOY_API_URL` | Deploy Apps Script `/exec` |

Retain matching bridge secrets and existing Google sign-in configuration. Saving script source alone does not update a published web app.

## Save, refresh and recovery

**Save changes** writes the selected working version. **Publish** makes the reviewed version authoritative for Contacts and public Layout. Saving a draft leaves the published snapshot intact.

Ordinary Deploy edits send changed fields with stable record identities. The backend writes dirty fields, required derived values and commit metadata, then returns a compact acknowledgement. Screen updates follow through a separate delta request. An interrupted response is checked against the original request ID; retry confirmation from the same open page. A display failure after confirmation shows **Saved · refresh needed**, and does not resubmit the write.

Drafts remain in page memory. Keep an unconfirmed edit open and use its retry control. Closing the page does not guarantee draft recovery. Full Refresh resolves a fresh authorized baseline; background refresh uses revision deltas. A permission change or expired cursor requests a full resynchronization.

Deploy journals each transaction before touching field data. A subsequent authenticated request automatically resumes an interrupted transaction under the script lock. `recoverFieldCommit` is also available in the script editor. Contacts catalogue publication resumes its pending journal before later reads. A pending Contacts staff save/approval blocks unrelated requests until its editor retries the original save/publication, so incomplete rows are not displayed as committed records.

After a publication timeout, retain and retry the same review. Publication and Contacts synchronization are separate services; a retry may be finishing catalogue synchronization for an already published version.

## New pages and behaviour

- **Often:** IP Deploy, Dept, Committees, CCAs, PLT, Events, Duty.
- **Information:** Summary, Duty Cards, Layout.
- **Program Settings:** Classes, Subject Load, Fortnight Split and the five group-definition pages.
- **Settings:** Versions now precedes Audit. The version selector is in the blue header; Notes are optional free text.

PLT starts with the 17 requested teams in their supplied order. PLT Leader remains the first slot. Admin/KP can add or delete teams in PLT Settings. Missing leaders and unassigned teachers are visible warnings; multiple membership is allowed. Events starts with 32 names, with OIC, 2IC and member slots. KPs manage its alphabetical definitions. Twelve committees are added by name without replacing existing assignments or IDs.

Fortnight Split uses each direct level/subject row from Subject Load, excluding the derived FT aggregate. Weekly and fortnight lesson-block counts are independent whole numbers. Read-only targets retain fractional Subject Load values; a mismatch is a warning and does not block saving. These choices resolve the previously unanswered implementation details without importing spreadsheet allocations.

Subject Load distinguishes numeric zero from `n/a`; an n/a cell is grey and stays editable. In-cell selection closes the menu, focuses the edited control and centres it in the table. Independent panel scrolling is retained.

Duty entry and print share the roster's column and day spans. The default roster prints on one A4 landscape page, with P1–P6 recess columns and Wednesday subdivisions. Custom content can continue to additional pages. Print at 100% with browser headers/footers off; use the supplied page-size/margin settings. Existing saved descriptions are preserved. `Updated` records the latest Duty save; older versions without that timestamp say “Not recorded”. Duty Cards aggregates actual assigned occurrences, including custom duties, by stable teacher identity.

Contacts dropdowns use OR within a category and AND across categories. Levels and Subjects must match the same assignment; FT is a separate condition. Dept, Committees, CCAs, PLT and Events use the published memberships. Subject choices exclude only TTT, FTT, FTGP and Assembly. The computed FT header remains available: explicitly choosing FT matches FT allocations; ordinary teaching-level matching excludes FT. Missing deployment data is shown as unavailable rather than as zero matching teachers.

Layout includes the ISH L1 west opening, interior-facing WC/Store doors at L1/L4, and the covered two-flight metal stair to the L4 east entrance. Its dimensions are approximate model geometry, not construction drawings.

## Rollback

Pause editing and finish/recover pending transactions first. To preserve edits made after this upgrade, run **`prepareLegacyRollback` using the v0.4.02 Deploy code** before restoring v0.4.01. It exports current working versions and the frozen published version into legacy chunk snapshots and switches their index pointers; it preserves audit and receipt data. Then restore the prior Apps Script versions and all three prior frontend ZIPs together.

Alternatively restore the pre-upgrade spreadsheet copies and matching scripts/frontends, understanding that this discards changes made after those copies. Keep field sheets and journals until the recovery is checked. Do not manually clear a pending journal or replace only the index.

## Verification limits

The source package contains `VALIDATION.md`, `API_CONTRACTS_v0.4.02.md`, automated tests, rendered UI/geometry proofs and PDF samples. Validation uses local Sheets/service fixtures and Chromium. Live Google authorization, Apps Script quotas/latency, Cloudflare bindings and the production migration require the installation checks above.
