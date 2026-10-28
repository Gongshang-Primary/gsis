# Calendar venue lookup

The 0.9.9 administrator health check distinguishes configuration, endpoint, permission, register and catalogue failures. The normal location field still accepts custom text. A catalogue result identifies a school venue; it neither reserves it nor proves it is available at the event time.

1. Sign in to Calendar as an administrator.
2. Open **URL Setup**, then run the existing **Health check**.
3. Read the **Venue directory** result. The code and suggested action contain no key, endpoint identifier, staff record or raw backend response.

| Code | Next action |
| --- | --- |
| `VENUES_URL_MISSING` / `VENUES_URL_INVALID` | Open the Calendar Apps Script project → Project Settings → Script Properties. Set `VENUES_APPS_SCRIPT_URL` to the existing Venues web-app deployment URL ending in `/exec`. Use the standard `https://script.google.com/macros/s/.../exec` form, without spaces or query parameters. |
| `VENUES_SECRET_MISSING` / `GSIS_SECRET_INVALID` / `INVALID_SIGNATURE` | Privately check that Calendar and Venues have the same valid `GSIS_SECRET`. A working 33-character key is supported. Do not paste the key into the health screen or a diagnostic message. |
| `VENUES_HTTP_ERROR` / `VENUES_RESPONSE_INVALID` | Check the existing Venues deployment and web-app access settings. An HTML sign-in page is not a valid catalogue response. |
| `REGISTER_SETUP_REQUIRED` / `REGISTER_INVALID` | Check the configured Venues workbook and its shared `Venues` tab. Preserve existing rows; correct the reported register problem through the existing administrative workflow. |
| `CATALOGUE_UNVERIFIED` | Refresh Venues sources to reconcile current room units with saved venue identities. Do not invent replacement venue IDs or delete bookings to clear the warning. |
| `FORBIDDEN` / `IDENTITY_CHANGED` | Check current staff access in Contacts and Venues, then retry. |
| `COMMIT_UNCERTAIN` | Review the unresolved Venues save using its existing recovery controls before attempting another write. |
| Other safe code | Check the existing backend's status and retry. Custom location text remains available. |

During investigation the physical Venues tab and its standard headings were present. The live Calendar Script Properties and complete room-identity mapping were not independently verified, so this release does not claim that the production lookup failure was a particular missing setting or that it has already been repaired.

Future venue booking awareness is a separate projection: only permitted occupancy and necessary occupant display names may be supplied. SMC drafts, private staff details, absence reasons and relief instructions remain excluded. Production Roster occupancy export remains paused until its own readiness gate passes.
