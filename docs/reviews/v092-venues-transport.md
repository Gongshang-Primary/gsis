# Venues 0.9.2 transport, sources and jobs review

Scope: `venues-viewport/public/_worker.js`, `venues-backend/Sources.gs`, `venues-backend/Notifications.gs`, `tests/venues-worker.mjs`, `tests/venues-jobs.cjs`. Applied Ponytail, boundary discipline, Superpowers test-first development and fresh verification. No dependencies, live sends, deployment, settings changes or external source mutations.

## Authentication and transport

The Worker serves public application assets and `/b/<id>` / `/r/<id>` sign-in shells. Every data read or command requires a verified school identity. It supports the suite's Google school-account JWT flow and a seven-day host-only, Secure, HttpOnly, SameSite=Lax cookie signed for the current origin. Optional Cloudflare Access verification validates RS256 signature, issuer, configured audience, expiry, issued time, not-before time, app token type and email/subject. Browser identity/role fields are rejected. JWKS refresh coalesces concurrent fetches and limits unknown-key refreshes.

`POST /api/read` and `POST /api/command` enforce same-origin requests, deny cross-site Fetch Metadata, bound the streamed request to 65,536 bytes, enforce separate operation allowlists and require UUID request IDs plus observed integer revisions for commands. Proxy envelopes contain only action, timestamp, nonce, verified identity and input, signed using HMAC SHA-256. The Apps Script web-app endpoint is restricted to an HTTPS `script.google.com/macros/s/.../exec` URL. Unknown upstream outcomes tell the client to retain and retry its original request ID.

Pages settings:

- `VENUES_BACKEND_URL`: deployed Venues Apps Script `/exec` URL.
- `VENUES_PROXY_SECRET`: matching secret of at least 32 characters.
- `GOOGLE_CLIENT_ID`: same-suite Google OAuth web client ID for normal school sign-in.
- Optional together: `ACCESS_TEAM_DOMAIN` (`school.cloudflareaccess.com`, HTTPS prefix/trailing slash also accepted) and `ACCESS_AUD` (Access application audience).

Public auth routes are `GET /api/config`, `GET|POST /api/session`, and `POST /api/logout`. POST session creation accepts a verified Google bearer JWT; API calls also accept a Google bearer JWT or verified Access assertion. Access can remain an outer gate, but its optional path does not replace Contacts identity or Venues facilities grants.

## Source and snapshot boundaries

All source HTTP reads use the exact `venuesSource` / `gsis-venues-v1` envelope with `VENUES_BRIDGE_SECRET`; responses must declare schema 1, the expected source, `authoritative:true`, a bounded key and an observation no more than 60 seconds from the server clock. No source failure becomes invented empty availability. Contacts is checked live before identity resolution; unchanged staff snapshots cause no durable write. IDs resolve uniquely against active GSPS/CES email fields.

A refresh captures source epoch/fences and policy revision under the Venues lock, then releases it for all source reads, compression and Drive writes. Activation uses the pure domain's pinned fence validation and atomic displacement/audit/outbox commit. Source checks remain at most 60 seconds old; slow refreshes reject. Pending source writers never expire by age.

The Calendar manifest covers the configured year. Calendar dates are fetched only when its key changes, in batches of at most 62. Explicit holidays/weekends without parity remain covered; unknown dates carry a code and remain unbookable. Roster snapshots cover the complete year, permit uncovered days with an empty pattern ID, and use only whitelisted periods/dates/room intervals and fixed timetable labels. Unchanged Roster/Deploy/Calendar manifests reuse the full projection and Drive payload. Warm freshness checks issue four small source manifests and no annual date/snapshot/piece downloads.

Stable UUID room IDs are retained across source-ID/year changes using exact physical units and unique known aliases. Names, previous units and admin-maintained aliases persist. Generic shared descriptors do not override a unique unit match. Duplicate physical units, retired rooms and ambiguous identities are disabled. Unknown or ambiguous occupancy aliases make affected days uncovered. Only a unique physical-unit match can interpret structured classroom annotations such as `F1-16 (1P)`. Legacy aliases remain explicit; missing mappings populate `source.unresolvedAliases` and structured mapping issues. Changes to admin aliases alter the mapping fingerprint and force re-projection even when remote manifests are unchanged.

Each immutable piece uses gzip bytes, a lowercase SHA-256 digest over those compressed bytes, and the original UTF-8 byte length. Drive reads verify both before returning base64. Snapshots activate only after final revision rechecks. The manifest supports multiple pieces; the initial implementation emits one piece, bounded to 12 MB uncompressed.

Backend source settings: `VENUES_ROSTER_APPS_SCRIPT_URL`, `VENUES_CONTACTS_APPS_SCRIPT_URL`, `VENUES_DEPLOY_APPS_SCRIPT_URL`, `VENUES_CALENDAR_APPS_SCRIPT_URL`, `VENUES_BRIDGE_SECRET`, `VENUES_SCHOOL_YEAR` (four-digit year), and `VENUES_SNAPSHOT_FOLDER_ID`. The backend owner implements `setupVenues`, `venuesHealthCheck`, `syncVenuesSources`, persistence, grants and source service endpoints. Root implements upstream adapters and durable Roster coordination.

## Durable delivery and jobs

`venuesRunJobs()` is the idempotently installed one-minute Apps Script trigger. It refreshes sources, expands durable participant intents, re-resolves Contacts, dispatches at most ten channels within a 45-second delivery budget, and prunes bounded old records. Email and WhatsApp have separate durable delivery states. Email addresses deduplicate GSPS/CES contacts; unsent channels follow changed Contacts addresses while sent or uncertain channels retain their evidence. Discontinued unsent address slots are marked superseded. No message includes recipient contacts in a browser response.

Provider sends happen outside the lock, after a durable `sending` claim. A second dispatcher cannot claim the same channel. Successful sends become `sent`; definitive WhatsApp 4xx rejection becomes `failed` with exponential backoff; timeouts, malformed successes, server failures and email exceptions become `uncertain`. Abandoned sending claims become uncertain after ten minutes. Uncertain outcomes never auto-resend. Explicit reviewed `notificationDecision` handles retry/confirmation and preserves already-sent channels.

The public URL must be an HTTPS `gsps.edu.sg` subdomain without a path. Booking links use `/b/<id>`; transfer links use `/r/<id>` and grant no authority. Missing settings, missing contacts or unapproved templates yield visible `setup-required` states. Operational notifications follow the school-managed policy; no per-staff opt-in setting was added.

Backend delivery settings:

- `VENUES_PUBLIC_URL`: e.g. `https://venues.gsps.edu.sg`.
- `VENUES_EMAIL_ENABLED`: exactly `true` to enable live email; otherwise queued channels show setup-required.
- `VENUES_WHATSAPP_ENABLED`: exactly `true` to enable live WhatsApp.
- `VENUES_WHATSAPP_ACCESS_TOKEN`: backend-only Meta token.
- `VENUES_WHATSAPP_BUSINESS_ACCOUNT_ID`: digits only.
- `VENUES_WHATSAPP_PHONE_NUMBER_ID`: digits only.
- `VENUES_WHATSAPP_API_VERSION`: explicit `vNN.N`.
- `VENUES_WHATSAPP_TEMPLATE`: JSON with `name`, `language`, `body` and the exact ordered `fields` array below.

```json
{
  "name": "YOUR_APPROVED_VENUES_TEMPLATE",
  "language": "en_GB",
  "body": "YOUR_EXACT_APPROVED_BODY_WITH_{{1}}_THROUGH_{{6}}",
  "fields": ["recipient_name", "event", "venue", "date", "status", "manage_url"]
}
```

The configured body must mention venue(s), have exactly six sequential placeholders and exactly match the Meta-approved template's body and locale. The dispatcher checks provider template status `APPROVED` before sending. This implementation sends six body text components, including the authenticated management URL. Dynamic headers and URL/button components are not assumed approved or reused from LORD; templates needing those components remain setup-required. Static text header/footer components are allowed. No real template name or approval claim is supplied by this source release.

Retention: at most 100 expired receipts/nonces/sent outbox rows per table per run; receipts 30 days, nonces two days (the entrypoint has a tighter live replay window), sent outbox 90 days. Failed/uncertain items are preserved. At most 20 Drive files are considered per run; only managed `occupancy-<sha256>.json.gz` files older than 30 days and absent from the active manifest are trashed. Active and unrelated files remain intact.

## Verification evidence

Fresh local runs passed:

- `node tests/venues-worker.mjs`: real RSA JWT signature/issuer/audience/expiry failures, forged identity, Access and Google auth, signed backend payload, session cookies, same-origin/CSRF, body limits, read/command separation and record-link shells.
- `node tests/venues-jobs.cjs`: signed source boundaries, full-year/leap coverage, privacy-safe projection, stable and duplicate room identities, structured annotations, Calendar unknown/holiday distinction, compressed digests and corruption, unchanged-manifest reuse, fresh actors, durable pending fence, actual-domain late-fence activation race, exact template approval, both email destinations, own-domain links, durable claim exclusion, provider uncertainty/backoff, changed Contacts addresses and bounded snapshot retention.
- `git diff --check` on owned implementation/test paths: clean.

Google services, Drive, Sheets and notification providers were simulated at their transport boundaries. These checks make no claim of live deployment, approved WhatsApp template availability or provider delivery. The root agent owns the single final full-suite/build/package integration run and independent review.
