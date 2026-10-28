# v0.8.7 integration and review resolution

The release applies Ponytail, Pstack, Thermonuclear, Vercel and Superpowers review practices. Existing UI conventions were reviewed through Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design. No claim of production latency testing is made.

Independent reviewers reproduced two material integration defects:

- An explicit retry of an existing failed notification did not cross from the domain intent to the transport store. A durable monotonic intent generation now promotes a manual send or retries a definitively failed attempt once; accepted or uncertain outcomes cannot be reset. Attempt history is preserved. Dedicated transport tests reproduce retry, quiet-hour promotion and replay.
- An uncertain acknowledgement for notice A could leave an enabled but ineffective button after notice B appeared. The UI now exposes recovery of A's exact receipt first, then leaves B pending for an explicit new click. Chromium tests verify the race and request identities.

The primary agent completed the integration checks after the independent review sessions ended. No separate blanket independent approval is claimed. Additional checks cover exact Admin-email alert closure, transport-store failure availability, current role checks, source manifests, scoped acknowledgement ownership, optional quota lookup after an accepted absence, current-date rollover, immutable publication contents, callback-before-result buffering, and installation bundle composition.

The full runtime remains on Apps Script/Drive. Shorter lock sections and fewer external calls are demonstrated by instrumented tests; Drive write latency and production load still require observation after deployment. New absence reports use the latest locked attendance state and do not re-read immutable models when another teacher reports. Same-record edits retain conflict protection. The optional Queue gives immediate durable wake; without it, sending waits for the next scheduled tick.

The Archify map is embedded in the one HTML manual. Validation, deterministic artifact checks and browser containment checks passed on its exact source snapshot. No separate perceptual visual-quality approval is claimed for the map.
