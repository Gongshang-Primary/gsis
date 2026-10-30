# Roster operations split-file implementation plan

Goal: remove the whole-document ceiling without changing Google authority or the state API.
Spec: docs/coordination/tasks/roster-operations-split-files.md.

Use native Drive calls, immutable replacement parts, and a manifest written last. Preserve JSON field, array and map order. Store the revision in the manifest. Keep the existing commit locks and source fences.

1. Add a fake-Drive regression program. Prove a 30M-character round trip, bounded monthly/half-month parts, selective writes, failed commit recovery, corruption refusal, authorised conversion, retained backup, undo ceiling and retry identity. Run it red.
2. Add split serialization/read/write helpers in backend/RosterOperations.gs. Retain the existing single-file fallback. Route the raw maintenance reader/writer through the same helpers.
3. Add Admin storageReport, splitOperations and joinOperations routes with a ScriptLock, request identity and exact storage token. Verify read-back before activating any conversion.
4. Add storage layout details and conversion controls to the existing storage view. Retain the same command on an uncertain result. Test the API and UI.
5. Regenerate canonical bundles. Run all tests in Asia/Singapore with installed Chromium. Record any missing historical release inputs separately; do not claim them as passes.
6. Update PR #19 for Claude exact-head review. Hold merge until owner deploys 6bb4844, sets ROSTER_OPERATIONS_MAX_CHARS and supplies Storage screenshot. No deployment, pruning, D1 activation or messages.
