# v0.7.04 change disposition

Status: finalised on 16 October 2026, Singapore time, following explicit user instruction. Deployment files are prepared; live deployment is separate.

| Report | Release change | Evidence and limit |
| --- | --- | --- |
| Report Absence controls not aligned | Reason, Select All and Clear periods share a 44 px control baseline; small screens retain wrapping. | Production frontend code rendered locally at desktop and mobile widths. |
| Report Absence still loads slowly | Start one read on pointer entry, focus or pointer down; reuse fresh report data for 60 seconds from completion. | Idle Home adds no report read; opening joins the in-flight request; warm reopen makes no request. Cold service latency remains. |
| Own Arrangements takes too long | Its initial save can return colleagues' availability in the same response, reusing the current save context. | Removes a separate Calendar, Contacts and Roster request chain. Optional quota is read once after unlocking. |
| Save spinner appears static | Keep rotation for normal motion; provide a gentle opacity pulse under reduced motion. | Chromium verifies actual running animation and changing computed styles in both modes. The reported device setting was not observed. |
| Save operations too slow | Move response projection outside the shared save lock; remove the second Own Arrangements request. | One atomic document write and one receipt remain. Ordinary saves still require fresh server checks; their live latency has not been measured. |
| Match Assign Relief to the supplied reference | Toolbar above an inline absence form, horizontal period controls, compact status cards and direct Remove, Edit and View actions. | Existing absence rules and write path reused. Desktop and mobile rendering checked with no page overflow. |
| Absence details waits then fails | Open View and Edit synchronously from a complete same-date snapshot; use saved lesson snapshots for read-only details in Manage reported absences. | Loaded details require zero extra requests. Uncached editor reads retain current server context and show Retry with a diagnostic reference on failure. |
| Intermittent entry and save recovery | Pair editor data with its revision, retain the exact pending request on retry, ignore late reads and close the original editor after confirmed cross-date saves. | Conflicts require explicit review. Denied access clears actionable data. Normal and uncertain cross-date save confirmation tested. |
| Stale or lost Assign Relief controls after refresh | Refresh candidates after conflict even with a retained quick-form draft; retain the selected date on ad hoc navigation and correctly cancel teacher searches. | Focused real-browser interactions passed, including access denial, draft retention and confirmed deletion. |
| Subject Load creates phantom class demand for TG subjects | Add Program Settings > Subject Type, derived from Subject Load, with Class only, TG only and Both. RRP, SDR, CCE and LSM default to TG only. | Shared policy controls class cells, TG choices and new backend allocations. Existing actual assignments and defined TGs remain visible and counted. Fixed language and FT rules remain. |
| Subject policy must remain reliable when saving | Admin-only, version-owned, per-subject changes use the existing atomic draft batch, conflict check and save receipt. | Mixed batches use final policy regardless of click order. Auto PAL and legacy subject conversion obey the policy. Version copies remain independent. |
| Use the approved evening v1 template | Evening notifications select gsis_relief_evening_v1; v2 remains on Meta. | Exact wording, language and positional fields must still pass the runtime contract. |
| Prepare conditional relief instruction submission | Prepared JSON and a readable submission guide. | Prepared, not submitted; its route remains unavailable until approval and configuration. |
| Show notification readiness separately | Report readiness for each notification type. | Template approval alone does not enable sending. Live flags and recipient checks still apply. |
| Up-version and commit | Finalise v0.7.04 and produce matching Cloudflare Pages ZIPs and backends. | No Git commit, remote push or live deployment. |

The source draft passed its focused Pstack and Ponytail reviews, including exact-request retries, role/account isolation, denied refresh, multiple dates and optional availability failure. The final integrated release results are in VALIDATION.md and RELEASE_SUMMARY.json.

No production action is included. WhatsApp and automation remain paused. Earlier absence cleanup remains unconfirmed. Live timings are still needed before claiming an improvement in ordinary save duration. The latest screenshot showed an entry loading dialog but no final error text, so the underlying production service failure is not established by that screenshot.
