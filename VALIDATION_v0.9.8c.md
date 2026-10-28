# GSiS 0.9.8c validation

761 current Node/DOM/browser test programs passed across the broad run and final affected rerun. The 51 affected programs all passed after source synchronization. All 34 LORD regression programs passed; no LORD deployment component is included.

Seven current verifier entries remain limited, and are not counted as passes:

- Four historical comparisons cannot run because old tags or source files are absent: release084-absence-browser.cjs, roster717-inbox-performance.cjs, roster718-absence-performance-browser.cjs and stapler718a-relief-import.cjs.
- Three programs share a pre-existing response-size assertion: roster-draft-cell-save-speed.cjs, roster080-batch-backend.cjs and roster719-performance.cjs. A single-cell fixture returns 3,073 bytes against an old less-than-3,000-byte assertion. This result was reproduced unchanged from a clean archive of baseline commit 3f92305. The assertion was not relaxed. The other current conflict, receipt and batch regression checks pass.

Seven older historical fixture programs remain excluded by the existing verifier. The full-suite package gate is replaced by the component-patch gate for the three shipped components.

## New checks

Actual Chromium coverage includes saved and unsaved Stapler continuity, midnight, late replies, access revocation, retained recovery, Admin-only header styling, recess Pit placement, individual/cohort movement, undo/redo, exact save retries and Confirm/reopen. School-sized surgical save coverage measures a 375-byte single-field command versus 2,091,246 bytes for full plan plus base; this is a local fixture, not a live latency claim.

The 24 cache scenarios and signed backend tests cover same-ID lost-acknowledgement recovery, disjoint and conflicting edits, immutable fields, fresh authorization, missing email storage, stale review tokens, no email send during review, safe diagnostic persistence, legacy schema reads/upgrades, immutable cache parts, canonical client deltas, missing/corrupt objects, old slow publishers, deletion races and bounded pruning.

Independent review found and corrected three important issues: false zero counts when email storage was unavailable, corrupt valid-JSON cache metadata being treated as deletion proof, and stale quarantine eligibility after re-publication. Adjacent publication/quarantine races are also regression tested.

Generated runtime parity, Apps Script/Worker syntax, standalone packaged Worker import/configuration/authentication, archive contents and hashes pass. Machine-readable results are in docs/v098c/validation-results.json in SOURCE.patch.

## Operational limits

Google remains authoritative. Fresh authorization/source checks still contact Google; local tests do not establish production latency, permissions, bindings or provider delivery. Cache warm-up after saves is best effort and repairs on the next authorized read. Google document persistence is not a database row update.

Daily cleanup is bounded to 50 expired heads, 50 scanned R2 objects and 10 deletion attempts. It preserves at least 24 hours of continuous unreferenced grace. It skips deletion above 512 live scopes or 8 MiB of reference metadata, or when integrity cannot be verified. Small deletion tombstones remain to fence delayed publishers; their total metadata size is not capped. Old cache namespaces and other R2 content are untouched.

Uncertain email review preserves uncertainty and sends nothing. Provider accepted and delivered remain different states. No live deployment, production write or notification send was performed.
