# GSiS v0.8.10 source verification

Baseline: v0.8.9c, `30ef3b07d26cd1d94efaae6dc04f8b104ca46b3b`.

## Current source gates

617 current test programs pass across one broad run and seven targeted reruns. The inherited seven historical tests remain excluded by the existing runner; there are no new exclusions or unavailable dependencies. The composed Apps Script syntax gate parses all 114 current and historical .gs files. `git diff --check` passes.

The initial run had seven failures. Two read missing or concurrently composed generated files; rebuilding and frozen-source reruns passed. One expected the old Audit-only navigation. Three Home fixtures expected pre-v0.8.9a labels and reproduced against the baseline; their updated fixtures retain access, account-race and immutable-model checks. One complete absence projection comparison needed the new exact row token; it now independently calculates that token and checks that another teacher cannot use it to gain authority. No runtime fix was hidden by weakening these assertions.

Current absence tests include 30 overlapping preparations with reversed commit order, exact retries with zero extra writes, same-row conflict rejection and independent-row updates. Timetable tests retain account/source boundaries, baseline-first batches, daily/hourly checks, immutable models and changed-date context reads. ASC tests cover demand totals, references, mappings, persistent settings, local drafts and zero export API calls.

## Independent review

Separate correctness/security and structural-quality reviews compared the runtime to the baseline. Both found no remaining material finding in the inspected scope after two repairs:

- Birthday reconciliation now stores a bounded 50-ID audit sample, exact count and digest of every changed ID. A 1,000-event removal stays within the Sheets cell limit and commits events, audit and receipt in one batch.
- Daily Drive report failures retain bounded stage/code/HTTP-status diagnostics. Matching claims alone can persist them; raw staff data, exception text and private links are excluded.

## Browser and document checks

Real Chromium exercised ASC Export at 1400/800/390px, Calendar at 390/660/800/1024/1440px in both layouts, Stapler at desktop/mobile widths, and the offline manual at 1365/390px. Feature owners and reviewers inspected captures. Checked drafts, keyboard/error focus, local export, no document overflow, readable controls, Calendar sticky navigation, manual anchors/search/print and absence of external manual requests.

## Local performance evidence

The 180-teacher/1,800-assignment ranking fixture reduced assignment staff-ID inspections from 937,722 to 5,122 with the same complete result digest. Name matching for 220 identities reduced repeated matching reads from 48,400 to 220. Saved full-day absence editing starts without another timetable entry request. Immutable day access avoids cloning the full 4,000-tile planner for each display read. These are local algorithm/service-call checks, not production end-to-end latency measurements.

## Acceptance boundaries

No live Apps Script, Sheets, Drive, Calendar sync, Cloudflare configuration, WhatsApp send or queue cleanup was performed. Test the draft XML in a new/copied installed aSc timetable. Existing-template definition omission stays blocked without a verified external-ID mapping. Existing uncertain WhatsApp outcomes remain uncertain. Whole operational Drive JSON writes and Inbox's shared Roster lock remain documented architectural limits.

Package and Archify gates are recorded after final generation in the release record.
