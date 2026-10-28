# Merge v0.8.5c into the full GSiS suite

Start from v0.8.5 commit `e70af17c870595dc11a60e86ae46ae81ae8767b0`. SOURCE.patch contains the tracked delta; the committed package includes the incremental Git bundle and annotated v0.8.5c tag.

Canonical changes are in `shared/roster-operations.js`, `backend/RosterOperations.gs` and `roster-update/public/roster-settings-ui.js`. Preserve the dedicated `consecutiveSubjects` response field. Other settings keep their existing `subjects` contract. The server derives the list from its current state and baseline index rather than trusting a submitted list. Use immutable confirmations even when a later working draft exists.

Regenerate the embedded backend and browser model with `python3 scripts/build-release.py --sync-only`. Canonical Deploy code retains its Deploy role and component version 0.8.5. The standalone Roster build receives the fixed Roster role and version 0.8.5c. Other installed components remain at 0.8.5; the notification Worker needs no replacement.

Retain changelog items 100–102, the catalogue and picker regression tests, updated synthetic settings fixtures, and the documented UI contract when making the next full release. Do not expand the new rule's subject validation into unrelated wildcard, family or shared-cover policies.

Build this patch with `python3 scripts/build-component-patch.py`. The final build follows the release commit and tag and verifies the exact two-component contents, source parity, assets, checksums and repository bundle.


The integrated b changes make custom instructions ongoing policies with `enabled !== false` legacy defaults. Keep their all-date dependency in allocation conflict tokens and frontend invalidation; exclude undeleted rules from historical pruning. Preserve captured publication history and the established modern/legacy notification paths. The custom-rule UI retains unsaved form edits across toggles.

The integrated c changes resolve Assign Relief's default school date through the existing authenticated Calendar gateway. Keep Singapore cutoff semantics, explicit-date/draft precedence, unknown-calendar failure handling and stale-navigation guards. No Calendar/backend ownership change is involved.
