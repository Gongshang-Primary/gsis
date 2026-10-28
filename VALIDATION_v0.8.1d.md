# GSiS v0.8.1d validation

Scope: Roster frontend over installed v0.8.1c. Deploy backend remains v0.8.1c; the separate notification Worker remains v0.8.1b. No backend or gateway authorization change is required.

## Five coding skills

Ponytail keeps the fix within the existing private page without new production dependencies. Pstack traces access loss to fragment handling rather than changing token lifetime. Thermonuclear reviews correctness and security across access, acknowledgement and navigation. Vercel reviews authorization, concurrency and maintainability. Superpowers supplies a failing regression before the fix and verification before completion.

## Checks

The new browser regression first failed on the old page because opening removed the fragment. It passes with the patch. The current full npm run passed 455/456 scripts. The one failure was release505-relief-api.cjs assuming the backend always shares the overall release version. Its assertion now uses the declared backend component version (0.8.1c); the complete test passed on follow-up. All 456 current scripts are therefore verified across the full run and that follow-up, rather than in one all-green run.

Full-run log: verification/81d-npm-test.log. Follow-up: verification/81d-relief-api-followup.log. Build and package parity log: verification/81d-build.log. Seven superseded historical scripts remain excluded by the existing runner; this patch does not change those exclusions.

The passing suite includes roster084-private-link-reuse-browser.cjs, roster083-notify-ack-browser.cjs, roster083-external-ack-gateway.mjs, roster701-gateway-integration.mjs and roster701-r20-service.cjs. These cover the actual page in Chromium, signed gateway validation and backend acknowledgement idempotence. Independent correctness and structural reviews found no unresolved material issues.

All 68 Apps Script files passed the ES2020 syntax gate. The component archive verifier passed exact scope, source parity, routes, vendor assets and checksums. The Deploy backend, Pages gateway and separate notification Worker have no source diff from v0.8.1c. Final packaging repeats the archive verifier after commit.

Verified coverage: repeated original-link access; copying or bookmarking the current URL into a fresh browser context; refresh without session storage; access before and after acknowledgement; changing teacher/date links while an earlier request is pending; clearing private content after authorization failure; genuine expiry rejection; existing signed-scope and idempotent acknowledgement behavior.

## Reproduction

Install declared dependencies with npm ci. Run npm run build, npm test and npm run test:release. Browser tests accept ROSTER_TEST_CHROMIUM and GSIS_BROWSER_EXECUTABLE; both point to /tmp/chromium in this workspace. The suite supplies Singapore time for its fixtures.

The component verifier checks exact archive membership, every Roster frontend file, declared component versions, vendor assets, public signed-link routes and hashes. It must find only Roster_Frontend_v0.8.1d.zip as a deployment component. Final packaging occurs after commit so PATCH.json identifies committed source.

## Limits

No live deployment, production record update, provider template edit or WhatsApp send was performed. Local tests do not establish live Meta delivery or external Cloudflare Access configuration. Installation acceptance should reopen an already valid private link in the installed site. Genuine expiry is unchanged, and this patch does not revive expired links.
