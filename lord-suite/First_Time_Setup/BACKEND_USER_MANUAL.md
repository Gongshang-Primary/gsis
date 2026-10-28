> Current release: GSiS Suite v0.9.1. For the Contacts and published Deploy reference bridge, also follow [gsis-integration/SETUP.md](gsis-integration/SETUP.md). Historical function names and provider template names remain compatibility identifiers.

# LORD backend: simple maintainer manual

Staff use LORD to book, collect and return. Administrators use OVERLORD to inspect bookings and physical movements. STARLORD shows the schedule. The workbooks are the operational record; the browser may show a labelled saved view while reconnecting.

GSiS v0.9.1 includes the token-free settings correction retained from `v0.9-correction`. Source release does not deploy the apps or change live settings. Before saving its new source, move the existing LORD configuration to Apps Script → Project Settings → Script Properties and the three Pages projects' Settings → Variables and Secrets, following [the setup guide](gsis-integration/SETUP.md). Keep the proxy secret, both booking peppers and session settings unchanged. The private settings ledger stays outside code and upload ZIPs.

## What you maintain

| Location | Normal task |
| --- | --- |
| Reference workbook | Maintain teacher, class, subject, trolley and timetable lists. Keep their column positions and avoid duplicate names/codes. |
| contacts | Maintain each teacher's GSPS email, display name and mobile in column F for agreed operational alerts. |
| admins | Use OVERLORD Settings to grant access/enroll alerts. Disable access with Active=No. Preserve a valid Google Sub binding. |
| Bookings | Inspect planned use. Make booking changes through LORD/OVERLORD so ownership, conflicts and audit fields remain consistent. |
| Sessions and Session Trolleys | Inspect physical custody, quantities, declarations and evidence. Use LORD for collection and return. |
| Event Log | Inspect the audit history; keep its records intact. |
| Drive photo folder | Stores collection/return evidence. A failed staged submission can leave unlinked files; reconcile before deleting anything. |
| REIGN archive folder | Stores logging-period archives created by the existing REIGN workflow. |

After changing reference lists, use OVERLORD → Settings → Shared data → Read latest from Sheets once. Online clients adopt the refreshed lists within about two minutes; reopen an existing form to display them. Ordinary reads can be cached. A displayed booking is planned use, not proof that devices were collected or returned.

## Admin access and WhatsApp

An existing administrator opens OVERLORD Settings, chooses a unique Contacts name/email, verifies the displayed mobile, confirms that colleague agreed to alerts, and grants access. The new admin signs out and in again to refresh their role. Enrollment does not establish their Google identity: that binding comes from verified sign-in. Existing admins also need enrollment for WhatsApp.

See `WHATSAPP_SETUP.md` for W1/W2 template approval, sender configuration, consent removal and troubleshooting. Delivery is disabled by default. A WhatsApp acceptance audit means the provider accepted the request, not that the phone received or read it. Telegram works independently.

## Routine checks

1. Check OVERLORD's Action required list for overdue equipment, preparation and return issues.
2. Investigate a maintenance warning using `diagnoseLORDBackgroundWork` in the Apps Script editor.
3. Check Apps Script Executions for failures and `LORD_TIMING` records; compare elapsed time, lock wait, lock held and photo time without copying private payloads.
4. Confirm both scheduled triggers exist and belong to the designated maintainer.
5. Back up source/configuration before upgrades and follow the school's established data backup and retention process.

## Which editor function to run

| Function | Purpose and effect |
| --- | --- |
| `selfTestLORDV17` | Read-only configuration/schema/service checks; may warm caches. Inspect its returned failure count and individual tests. |
| `inspectLORDV17Configuration` | Read configuration/trigger summary without printing credential values. |
| `inspectLORDPhotoUploadReadiness` | Read-only Advanced Drive v3 and evidence-folder write-capability check. |
| `maintainLORDPhotoUploads` | Retire at most 20 pending photo manifests older than eight days; never delete Drive files. See [photo upload reliability](PHOTO_UPLOAD_RELIABILITY.md). |
| `diagnoseLORDBackgroundWork` | Read queue/receipt counts and the latest warning. |
| `createLORDV17Schema` | First-time setup only. Creates missing empty structures; refuses incompatible transaction headers. |
| `installLORDV1Triggers` | Install/replace this owner's two named triggers. Not required during an ordinary upgrade. |
| `acknowledgeLORDMaintenanceWarning` | Clear the notice only after reconciling the failed background task; does not repair or clear its queue. |

Legacy setup/migration aliases remain callable, but no longer relabel an incompatible populated table. They are not routine maintenance tools. Do not run REIGN, force-return functions or property cleanup as a diagnostic.

## When something goes wrong

| Symptom | What to do |
| --- | --- |
| STARLORD cannot load | Record its diagnostic code and time. Check backend health/version and the configured `/exec` URL. A fresh response and a cached display are different checks. |
| Configuration property missing | Add the named property in the LORD project's Script Properties; use the private ledger and do not paste its value into logs or source. |
| Pages reports backend configuration missing | Check Production `LORD_BACKEND_URL` and encrypted `LORD_PROXY_SECRET` on that Pages project, then redeploy after correcting them. |
| Booking/return submission timed out | Keep the draft and original request ID. Check the record before retrying; use the app's existing recovery flow. Do not create a new duplicate transaction manually. |
| Collection says booking changed | An edit occurred while photos were being prepared. Reload the booking, review its requirements and evidence, then retry through LORD. |
| Header mismatch | Stop and compare the named columns with a backup/schema reference. Do not force a new header over existing data. |
| Background queue is full | The main transaction can still be committed. Review missing notifications/audit tasks, service failures and trigger execution; older pending tasks are retained. |
| Administrator loses access | Check Active, GSPS email and the bound Google Sub in admins. Correct an identity binding only after verifying the account through the school's process. |

The queue uses leases and stable audit IDs, but email and WhatsApp delivery are not exactly once: an interruption after delivery and before acknowledgement may cause a later duplicate. Sheets commits do not roll back Drive files, email or WhatsApp. The 18:00 administrative close records an operational status; it does not prove a physical return. REIGN must still pass its custody, timing and archive safeguards.

## Logging exceptions in v1.8

Teacher declarations are recorded as COMPLIANCE_INCIDENT payloads in the existing Event Log. Do not edit or delete them to mark review complete. OVERLORD's Logging incidents control records a separate COMPLIANCE_RESOLVED note. Counts retain both reviewed and unreviewed omissions. Initial period has no inferred start date.

DECLARED RETURNED means the teacher confirmed all devices were back without logging photos. The loan and reservation are closed immediately; it is not photo verification. Normal returned quantities stay blank for this exception. The incident retains booking, session, teacher, actor, cart, actual collected quantities, window and server acceptance time. REIGN archives incident details and totals. Consent events survive the close.

Contacts C is the CES notification address, D the verified GSPS address and F the mobile. Operational notifications use the configured school agreement and current Contacts mobile. Use OVERLORD Settings for administrator grants and the shared Read latest from Sheets control. Granting access is independent of mobile readiness and does not record personal consent.
