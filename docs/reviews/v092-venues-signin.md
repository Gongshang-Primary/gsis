# Venues v0.9.2 sign-in hotfix

25 October 2026. Scope: `venues-viewport/public/_worker.js` and the Worker regression, against `fb3c9b0`.

## Cause and remedy

`signingKey()` used `redirect: 'error'` for both Google and Cloudflare Access key retrieval. Cloudflare workerd accepts only `follow` and `manual`; its Request constructor throws before the fetch reaches the key service. `sessionRoute()` converts the failure to HTTP 401 with the same school-account message used for rejected credentials.

Primary evidence: https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c++ (`Request::tryParseRedirect` and the `Invalid redirect value` guard). The source explicitly advises manual mode and response-status checking.

Use `redirect: 'manual'` and retain the existing `!response.ok` rejection. This preserves refusal of redirected signing keys without depending on an unsupported runtime option. Signature, issuer, audience, expiry, school identity, session, CSRF and backend authorization checks remain intact. No additional request, secret, binding or backend change is introduced.

## Verification

1. Added the documented workerd redirect constraint to the existing key-service test boundary. Before the runtime fix, `node tests/venues-worker.mjs` failed with 401 instead of 200 on a valid identity.
2. After the fix, the same program passes Google and Access sign-in, session/cookie validation, authorization lanes, CSRF, invalid claims/signatures and bounded requests.
3. New cold-key Google and Access 302 cases confirm no redirect following, no session cookie and no request onward to Apps Script.
4. `tests/venues-browser.cjs` passes in Chromium with the configured local test runtime: booking, cache isolation/reuse/integrity, dashboards, permissions, responsiveness and uncertain retry.
5. `git diff --check` passes.

The network boundary models the documented runtime constraint; the test did not run workerd or a production Google account. The connected user browser was unavailable. The live public config endpoint reported configured true and Access false. Production success still requires deployment and sign-in with the user's school account.

## Deployment

Upload `GSiS_v0.9.2_Venues_Signin_Fix.zip` to the existing Venues Cloudflare Pages project's Production deployment. It contains the complete seven-file frontend at the ZIP root, including the corrected `_worker.js`; it is not the full GSiS suite package. Keep existing variables and secrets. Open Venues again and sign in.

No Apps Script redeployment, data migration, setup rerun, token replacement or browser-storage reset is required for this patch. This focused hotfix retains the suite's 0.9.2 version; the original full-release ZIP remains historical and does not contain it.
