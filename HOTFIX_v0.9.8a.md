# GSiS v0.9.8a: withdraw selected received reports

Requires the v0.9.8 recovery backend and notification Worker already installed. This package updates Roster Pages only. The included frontend ZIP is self-contained for Cloudflare Pages direct upload.

## Install

1. Extract this package.
2. Open Cloudflare, Workers & Pages, then the existing gsps-roster Pages project.
3. Create a production deployment and upload Roster_Frontend_v0.9.8a.zip.
4. Keep the existing bindings, variables, secrets and deployment settings.
5. Refresh Roster and confirm the header shows v0.9.8a.

No Apps Script replacement, notification Worker replacement or Cloudflare Queue purge is required for this patch.

## Select and withdraw

1. Open Assign Relief and select the affected date.
2. In Received reports and review history, select eligible reports or use Select all shown.
3. Choose Withdraw selected and inspect the exact reports and date ranges.
4. Enter a reason and confirm that unsaved requests in those reports will be cancelled.
5. Confirm the action and wait for each report's result.

The action withdraws the whole selected report, including any other dates listed in it. A report covering 26 October to 2 December is not limited to the date currently shown in Assign Relief.

Withdrawal does not create an absence. Record any still-required absence separately and verify the correct coverage, type and relief setting. Existing saved absences, assignments and the original report history remain intact. Each withdrawal records who made the decision, when and why.

## Scope and partial results

Only reports awaiting review with no confirmed applied absence are eligible. Actively processing reports and work that has already applied an absence are protected by the existing backend rules. The control applies to the displayed date and loaded reports, not every report in the school. Existing server list limits still apply; check the displayed count and any notice that more reports are available. Newly arriving reports are not added to an already confirmed selection.

Withdrawals run one at a time. Confirmed results remain shown if a later withdrawal fails. An uncertain request must be retried with its retained identity; confirmed withdrawals are not sent again. A change of page, date or authority stops further automatic submissions.

After resolving the intended reports, refresh received reports and check the next due allocation cycle. This action does not prove that all other allocation or WhatsApp service errors have been resolved.

No production reports were withdrawn while preparing this package.
