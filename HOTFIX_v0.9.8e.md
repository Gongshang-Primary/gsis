# Install GSiS v0.9.8e

Baseline: v0.9.8d. Existing Google authority and Cloudflare setup. No migration.

1. Keep the current Roster Apps Script and Pages versions for rollback.
2. In the existing Roster Apps Script project, replace combined code with Roster_Backend_v0.9.8e.gs and save. Deploy > Manage deployments > pencil > New version > Deploy. Keep the existing URL and properties.
3. Upload the inner Roster_Frontend_v0.9.8e.zip to the existing Roster Pages project. Refresh and check the v0.9.8e header.
4. Retain revision D notification Worker and LORD backend. This patch contains only the changed Roster components.
5. Open Report Absence or Assign Relief, expand a received report and check its issue. Use Review report to compare saved coverage, then Apply reviewed report to request processing under existing checks. Check status to confirm saved attendance. Shorter reports still use Choose coverage.
6. For several eligible reports, select them and use Retry selected or Withdraw selected. Withdrawal requires a reason and never removes a saved absence. Retry stops on an uncertain response; check status or retry the original receipt.
7. In History, use Delete from history or Clear history. These clear completed updates from this browser only. Server audit and saved attendance remain. Renewed unresolved work reappears. Preferences last up to 90 days, with at most 250 retained entries per account.
8. Close a floating unconfirmed message with its cross. The inline pending notice retains Show details and the original retry command. Closing the message does not cancel processing or unlock another allocation. An exact completed manual run clears the retained command and checks saved records.

Past reports can save captured attendance. Instructions and colleague proposals for past dates stay in the original report as evidence; expired follow-on work is not dispatched. Current and future dates retain normal arrangement checks.

No production deployment or live messages were performed. Verify a controlled receipt and allocation after installation. Code rollback: restore Roster D backend and Pages together; saved records are not rolled back.
