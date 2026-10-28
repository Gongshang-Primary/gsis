# GSiS v0.7.03 reconciliation

Reviewed on 15 October 2026 against the preserved v0.7.02 package, the current conversation, source changes and local verification records. This release review does not claim a new exhaustive scan of every project chat. The earlier v0.7.02 reconciliation remains historical evidence in the source archive.

## Preserved requirements

The exact agreed public privacy page and its three contact images remain present. The page retains all 13 sections and its 14 October policy date. Its clauses cover staff and relief data, Google Workspace, REMS clauses 2.1.1 and 2.1.2, separate WhatsApp permission, minimisation, security, retention, correction, deletion and withdrawal. Publication does not collect or prove permission to send messages.

| Roster frontend file | SHA256 |
| --- | --- |
| privacy.html | 5026da603b275147329bee7d3766839e88a13ac5bc41853348069af4b8cca2aa |
| privacy-assets/rems-email.png | fc999c8d8265beaf464fbb15189a03856d4ea6f661dd84507e4c661a1b16e633 |
| privacy-assets/school-email.png | 7467c418cd05fff2c93b35e64a3551c85793b1a8952c77f95a07663dadb9707e |
| privacy-assets/school-phone.png | 95219017d6dbe4227cafea4ef1c65f4402a82bde2c4ae3efa05ef09392a8dc35 |

The app and private duty page retain their privacy links. The policy paths remain static, while protected APIs retain authentication. Verify anonymous access after deployment because Cloudflare Access configuration is external to this package.

The Deploy manual carries forward the corrected Other non-teaching term and current teacher lifecycle instructions. Its 36 embedded images remain examples from v0.6.02. The v0.7.03 text describes current behavior. The release retains the existing Layout venue mapping, school calculations, publication authority and notification contracts.

## Current reports

QUEUED_v0.7.03.md maps the current reports to release changes. The verified scope includes local colleague selection/filtering, in-memory timetable reuse, one save overlay, removal of Remarks, read controls during pending confirmation, exact request replay, conflict recovery, stale-session handling, Contacts editor preservation, indexed Deploy sorting, Calendar batching and atomic metadata writes. Layout's current implementation was reviewed without a speculative rewrite.

Pstack and Ponytail reviews are recorded in verification/703-suite-review.md and verification/703-final-release-review.md. The final source run passed 277 selected Node scripts, five Chromium checks and syntax parsing of 114 Apps Script files. Final archive results are recorded in RELEASE_SUMMARY.json.

## Open operational checks

The matching Calendar backend must be deployed before the new Roster Worker. Preserve existing URLs, properties, execution identities and live data. No release action changes those systems automatically.

Live absence cleanup is authorised but unconfirmed. The last read-only inventory found one active entry and one deleted tombstone. Clear the active entry through the authenticated Roster backend and then verify the result. Preserve history, register and baseline. No operational JSON replacement is included in this release.

The intermittent startup report with reference 892c96ed-62c2-486d-bd8c-1f5d5989285c still needs matching production diagnostics. Local timing and recovery checks do not establish its root cause or certify production reliability.

WhatsApp and automation remain paused. No message, reply-window test, provider configuration change or production deployment was performed. Exact template approval, callback correlation, recipient permission, delivery, historical R accounting and duty-SMC scheduling remain separate live acceptance checks. Earlier one-time EXT transfers and downstream spreadsheet cutovers are not recertified by this code release.
