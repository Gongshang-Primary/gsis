# GSiS 0.9.8b validation

* 751 current Node/DOM/browser test programs passed. After the broad run, 51 affected or previously environment-blocked programs were rerun successfully against the final runtime sources.
* 34 LORD regression programs passed. No LORD deployment component is included.
* Four historical comparison programs could not run because required older tags or source files are absent: release084-absence-browser.cjs (v0.8.3), roster717-inbox-performance.cjs (v0.7.16), roster718-absence-performance-browser.cjs (v0.7.17), and stapler718a-relief-import.cjs (historical shared/roster-stapler.js). These are not counted as passes.
* Seven pre-existing historical fixture programs remain excluded by the release verifier. The full-suite package.cjs gate was replaced by the component-patch gate appropriate to these three deployment components.
* Runtime synchronization and Apps Script syntax checks passed. The packaged Pages Worker passed standalone import, configuration, assets, authentication, source parity and archive hash checks.

## 098b regressions

The five new test programs cover read-only and fresh-authority health access; role revocation between reads; unavailable health storage; safe diagnostic projection; idle, skipped, retry and failed job classifications; Automatic/SMC/Peer approved provenance; preserved unsaved drafts; period boundaries; cross-date balances; delayed version responses; warm revision cache hits; expiry and unavailable cache; failed marker writes; lost save acknowledgements; and identical-request receipt recovery.

The existing receipt, intake, peer, allocation lifecycle, cache, conflict, notification, recovery and selective withdrawal programs passed. Review findings about cross-date balance invalidation and inaccurate job successes were reproduced and corrected. Source command concurrency tokens remain unchanged; the new allocation change key is a display invalidation hint only.

## Limits

Validation uses local fixtures and packaged smoke tests. It does not establish production latency, Google permissions, Cloudflare bindings or WhatsApp provider delivery. No live deployment, production write or notification send was performed.

Machine-readable program results: docs/v098b/validation-results.json in the source patch.
