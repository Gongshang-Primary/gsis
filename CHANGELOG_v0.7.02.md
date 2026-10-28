# GSiS v0.7.02

Baseline: v0.7.01, commit 132687a. Prepared from the queued changes of 15 October 2026. Code changes and deployment package finalised. Git history remains separate. No production activation or message was performed by this build.

## Roster

SMC Home places Report Absence, Manage reported absences and Assign Relief together above one divider. Other permitted functions appear below it. Breadcrumbs share the status row and align to the right.

After sign-in, Home appears before the full baseline is fetched in the background. Timetable views share one current baseline object and its search/export indexes. Changing the baseline replaces the cache; sign-out clears it. A timetable stays blank until a name is selected. Read-only local searches and display changes reuse loaded data. Availability names use a separate staff directory read that retains date-specific external activations without loading timetable, quota or Calendar context.

Assign Relief uses persistent absence cards, a full-day period row, selected-period summaries and candidate day cards with ranking context. Existing assignment eligibility, combination, quota, audit, Undo and publication rules remain authoritative. The daily absence page provides sortable absence and relief tables, search and Excel export. Viewing its Relief Assignments tab no longer mounts the assignment workspace.

## Setup and diagnostics

Deploy's manifest includes the email scope needed by its editor diagnostic. The published URL checks use `DEPLOY_WEB_APP_URL` from Deploy Script Properties, with validated automatic discovery as a fallback. Cached failures are labelled history and do not determine the current check result.

The notification Worker has a generated, self-contained dashboard script and matching copyable text. An optional diagnostic mode tests configuration, Meta read access, the signed service directory connection and Calendar reads. It skips sending and allocation. No public diagnostic HTTP endpoint is added.

The setup guide identifies all four locations for the shared Roster service secret and separates the phone-owning account from the template account. Template observations are evidence of submission and content, not approval. Every template remains disabled by default. Live Utility approval and exact content matching are still required.

## Cross-chat reconciliation

Restored the original 14 October privacy page and its three contact images from the parallel-chat privacy package without changing its wording. Roster and private-duty pages link to it. The page explains separate WhatsApp permission, REMS references, data use, withdrawal and the school helpdesk. The packaging gate now checks that the page, images and links are present. Anonymous live access still depends on the site's existing Cloudflare Access policy.

The matching Deploy manual now includes Other non-teaching in the displayed relief equation. The layout mapping guide identifies the current 143-venue seed and corrects the stale Pump Room ID. Deployment notes distinguish the baseline Git bundle from the final source ZIP. PROJECT_RECONCILIATION_v0.7.02.md records the reviewed sources, covered requirements and open operational checks.

## Release limits

See VALIDATION.md for actual check results. The paused live single-recipient test remains paused. No WhatsApp message, 24-hour service window, timetable publication or automatic allocation is triggered by preparation. The write protocol remains 500 and existing school data is retained. QUEUED_v0.7.02.md records the requested scope and observed setup history.
