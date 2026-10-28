# GSiS v0.8.2a validation

Scope: Contacts frontend item 083 over full v0.8.2, commit 4cd0fbe5f33175ac2be5c28b33e2c55d9a8a05b6. The final full-suite result is recorded below after completion.

## Five coding skills

Ponytail removes the former Google Contacts integration instead of maintaining two flows or adding a dependency. Pstack checks the actual exported file and loaded data boundary. Thermonuclear runs independent correctness and structural reviews. Vercel traces authentication, privacy, browser lifecycle, cache labels and component packaging. Superpowers supplies failing regressions before implementation and checks evidence before completion.

Thermonuclear used the user's saved 17 October package, SHA256 0578d044642d6ccd07cd1663dba71d33401337debb2d494db3b440c79039c7c2, because the current installed-skill catalogue did not expose it. Both packaged rubrics and the shared review contract were read. No plugin was installed or modified.

## Verified changed behaviour

The two contacts083 tests failed before implementation. A later review regression also failed for a mobile value already beginning with the Singapore country code; normalization now exports it with the plus sign and the test passes.

contacts083-vcard.cjs checks exported vCard bytes, exact structured names, optional fields, phone/email formatting, duplicate email suppression, injection-resistant escaping, CRLF and UTF-8-safe line folding. It checks missing values without name substitution and excludes staff identifiers, birthdays, role and absence data.

contacts083-vcard-browser.cjs runs the actual page in Chromium, downloads the file, compares its contents, goes offline after directory load and confirms no extra network or Contacts consent call on click. It covers keyboard and touch activation, selected-person isolation, fallback, sign-out cleanup, header placement and row height. contacts410-transport.mjs still checks the unchanged request/recovery path. All three focused checks passed after the phone-format correction.

Desktop and mobile screenshots were inspected. The plus is plain text with 18px invisible padding on each side and no vertical padding. Measured button dimensions were approximately 47.7 by 18.2px desktop and 46.9 by 16.9px mobile. Rows measured 25.2px and 23.9px, respectively. Keyboard focus remains visible. The user's explicit compact-row requirement takes precedence over a taller touch-button convention.

Independent Vercel/UI and both Thermonuclear passes found no remaining material defect in the changed scope. Frontend review also applied Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design. Premium's heuristic whole-repository audit reported 615 flags, including 7 unresolved entries; it is not a clean whole-suite UI compliance result. Those broad existing/heuristic reports were not treated as proof of defects in this patch or silently marked fixed. Actual changed-flow browser checks and visual inspection provide the acceptance evidence here.

## Release gates

The full npm test run passed 491 of 491 current scripts in one run. The seven existing historical exclusions remain unchanged. The two obsolete Google Contacts integration tests were replaced by the new Contacts VCF tests. Full-run evidence is verification/82a-npm-test.log. Focused serializer, browser and transport reruns also passed. The component archive verifier passed before the full run and is repeated after final documentation and commit.

The component archive verifier checks exact archive membership, every Contacts frontend byte, source patch parity, declared component versions, required assets and checksums. Other frontends, Apps Script backends, shared runtime modules and the notification Worker have no runtime source changes. The Contacts gateway changes only its version label. Final packaging runs after commit so PATCH.json identifies committed source.

## Reproduce and limits

Use npm run build, npm test and npm run test:release. Browser tests accept ROSTER_TEST_CHROMIUM and GSIS_BROWSER_EXECUTABLE; this workspace uses /tmp/chromium. No new production or development dependency was added.

No live deployment, Google Contacts write, phone contact creation, school record mutation or staff message was performed. Chromium touch emulation verifies browser downloads, not a native Android/iPhone contact-app prompt. Confirm actual device import after installation. Downloading cannot prove successful saving, duplicate handling or ongoing synchronisation. The file contains only the contact values already loaded; later directory changes require a fresh load and export.
