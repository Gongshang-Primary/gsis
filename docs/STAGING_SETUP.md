# Roster staging setup

Staging is a private copy of Roster for trying every change before production. Real users never use it. It must never send WhatsApp messages or write to production data.

## Safety rules

1. Staging never holds a production secret, file ID or URL that can write. Every write target is a staging copy.
2. WhatsApp settings are left unset in staging. `WHATSAPP_ENABLED` is `false`.
3. Staging Apps Script has no time-driven triggers until a test needs one.
4. Staging uses its own `GSIS_SECRET`, different from production.
5. Before each test, check the staging page header shows **STAGING**.

## Phase A: Cloudflare (about 15 minutes)

### A1. Create the staging D1 database
1. Cloudflare dashboard → **Storage & Databases → D1 → Create database**.
2. Name: `gsis-staging`. Location: leave automatic (or Asia-Pacific).
3. Click **Create**.

### A2. Create the staging Pages project
1. **Workers & Pages → Create → Pages → Upload assets**.
2. Project name: `gsps-roster-staging`.
3. Upload the current `Roster_Frontend_v0.9.9.zip` contents (the folder holding `index.html` and `_worker.js`).
4. Click **Deploy site**. Note the address, for example `https://gsps-roster-staging.pages.dev`.

### A3. Bind the database
1. Open `gsps-roster-staging` → **Settings → Bindings → Add → D1 database**.
2. Variable name: `GSIS_JOBS`. Database: `gsis-staging`.
3. Save.

### A4. Set staging variables
Open **Settings → Variables and Secrets** and add these to **Production** (this is the staging project's own production environment):

| Name | Type | Value |
| --- | --- | --- |
| `GSIS_SECRET` | Secret | A **new** random value of 40 or more characters. Generate it in a password manager. Never reuse production's. |
| `BRIDGE_SECRET` | Secret | The same new staging value as the staging Script Property `BRIDGE_SECRET` (32 or more characters). Signs browser sessions; sign-in fails without it. |
| `ROSTER_PUBLIC_ORIGIN` | Text | The staging address from A2 |
| `ROSTER_EDGE_AUTHORITY` | Text | `legacy` |
| `WHATSAPP_ENABLED` | Text | `false` |
| `GOOGLE_CLIENT_ID` | Text | The staging OAuth client from Phase B (leave for now) |
| `APPS_SCRIPT_URL` | Text | The staging Apps Script URL from Phase B (leave for now) |

Do **not** add any `WHATSAPP_*`, `NOTIFICATION_DISPATCH_URL`, `VENUES_*` or `GSIS_RECOVERY_*` variable to staging.

### A5. Turn off public previews
**Settings → General**: disable preview deployments for branches if offered. Staging is private by obscurity only, so do not share the address. Phase C adds Cloudflare Access as a sign-in gate.

## Phase B: Google

### B1. Copy the Apps Script project
1. Open the production **Roster GSiS** project → **Overview** (ⓘ) → **Make a copy**.
2. Rename the copy `STAGING Roster GSiS`.
3. Check **Triggers** (⏰) in the copy: it must be empty. Do not add triggers.

### B2. Copy the data files
Copies are in the Shared Drive folder **Staging** (`1FRPw9b307xz2TkVKuzZos2L3FZZ87Zcd`), made on 28 Oct 2026.

| Property | Production file | Staging copy ID |
| --- | --- | --- |
| `ROSTER_OPERATIONS_FILE` | Roster operations.json (13.3 MB) | `1Vcr3k3-T46iUOQDVDJmfnDuOp1P4-D00` |
| `ROSTER_INDEX_FILE` | Roster register.json | `1s5ncwcYUjiQxlVrJZaB9YNju0pg9YEM7` |
| `ROSTER_INBOX_FILE` | Roster WhatsApp Inbox.json | `1KCK-0QaPxtWYNUnTEScuS0bAWRf4PcqE` |
| `ROSTER_ABSENCE_INTAKE_FILE` | Roster absence intake.json | `1KMXIfFRSPmK9bNrRE3iVc9eN-Rl5bUDc` |
| `ROSTER_NOTIFICATION_TRANSPORT_FILE` | Roster notification transport.json | `1PkTkB2GBCWUT4Imz8PPMFo5caPdUOW8J` |
| `DEPLOY_SHEET_ID` | deploy | `1FyxaShulqRFntCRUyzGi3RGmL9gy9IBwtMiZ7ab_4hw` (Copy of deploy) |
| `LANDMARK_SHEET_ID` | venue | `1tz_t9qR82QLRCQV81Gcs6foOPjbmtRiusEBHE7fmetM` (Copy of venue) |

The four timetable model files (long ID names) are not copied. They are written once and only read, and the staging register still points at the production models. Staging reads them; it does not change them.

To refresh staging data later, copy the five Roster JSON files again and update these IDs.

### B3. Set the staging Script Properties

| Group | Properties | Staging value |
| --- | --- | --- |
| Copy | `ROSTER_OPERATIONS_FILE`, `ROSTER_INDEX_FILE`, `ROSTER_INBOX_FILE`, `ROSTER_ABSENCE_INTAKE_FILE`, `ROSTER_NOTIFICATION_TRANSPORT_FILE`, `DEPLOY_SHEET_ID`, `LANDMARK_SHEET_ID` | ID of the `STAGING` copy (see B2 table) |
| New | `GSIS_SECRET`, `ROSTER_SERVICE_SECRET`, `BRIDGE_SECRET` | New random values, shared by staging components only |
| Own identity | `ROSTER_OWNER_SCRIPT_ID`, `ROSTER_WEB_APP_URL` | The staging script ID and its `/exec` URL (after B4) |
| Same (read-only) | `CONTACTS_API_URL`, `CONTACTS_BRIDGE_SECRET`, `ROSTER_WRITER_ENABLED` | Same as production |
| Unset | `VENUES_APPS_SCRIPT_URL`, `VENUES_BRIDGE_SECRET`, `ROSTER_VENUES_SOURCE`, `DEPLOY_WEB_APP_URL` | Leave out. Roster sends writes to Venues. |
| Runtime | `LEASES`, `NOTICE_ACK_*`, `ROSTER_ALLOCATION_RUN:*`, `ROSTER_STAPLER_LEASE:*`, `ROSTER_VERSION_HINT`, `ROSTER_TIMETABLE_CACHE` | Do not copy; created at run time (`ROSTER_TIMETABLE_CACHE` is a cache ticket, not a file) |

### B4. Deploy the staging web app
1. **Deploy → New deployment → Web app**. Execute as and access: same as production.
2. Copy the `/exec` URL into `ROSTER_WEB_APP_URL` (B3) and `APPS_SCRIPT_URL` on `gsps-roster-staging` (A4).
3. Set the staging Pages `GSIS_SECRET` to the same new staging value as B3.

## Phase C: Connect and smoke test (pending)

1. Add Cloudflare Access to `gsps-roster-staging` (helper account and named testers only).
2. Sign in, confirm the version and STAGING marker, load one day, make one relief change, and confirm production data is unchanged.
