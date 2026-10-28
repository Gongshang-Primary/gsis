# v0.8.9 documentation review

## Design decisions

- **Awesome Design:** used the Mintlify documentation study for navigation, readable line height, restrained borders and a clear search control. Kept GSiS branding and system fonts.
- **Frontend Design Premium:** kept the existing staff-task structure and role labels. Distinguished local content, a confirmed save, publication and external delivery. Search, print, empty results and recovery remain usable offline.
- **Taste:** treated this as a school service manual, not a marketing page. Preserved a quiet, dense-enough reference layout; removed the large embedded diagram runtime rather than adding decoration.
- **UI UX Designer:** used semantic headings, tables and buttons; visible keyboard focus; 44 px touch targets; mobile navigation; plain action labels. Did not add promotional content to the school artifact.
- **Apple Design:** kept input feedback immediate and animation optional. No decorative motion or transition blocks an action. Reduced-motion mode stops the example spinner.
- **Archify:** separate self-contained source-based system map. The manual links to it with a relative path. The final diagram pins code commit `982e247d40418e9b60098056f7df0e766caac3c7`.

The English uses short active sentences and stable terms. Technical identifiers remain exact. This is a controlled-English style, not an ASD-STE100 certification.

## Automated manual checks

`node docs/reviews/v089/check-manual.cjs`

The check covers 1440 px desktop, 390 px mobile and a 720 CSS-px layout equivalent to a 1440 px desktop at 200% browser zoom. It checks overflow, search/reset, unique IDs, local anchors, the architecture link, reduced motion and runtime errors. This is a layout-equivalence check, not a claim to have changed a browser UI zoom setting.

Desktop and mobile captures were inspected. Text, controls, focus and navigation were readable. The captures are internal evidence and are not part of the full deployment package.

## Source accuracy checks

The maintainer guide keeps the existing cold-start manifests, four backend setup procedures, role/authority rules and complete notification contract appendix. New steps name the actual D1/R2 bindings and exact idempotent SQL from `WEBHOOK_SCHEMA_SQL`. Optional Calendar continuation uses a signed HTTPS-origin fallback so the guide does not depend on an unverified Worker-to-Pages dashboard binding.

The guide explicitly preserves these limits: current backend authority checks remain; Roster still physically replaces its operational JSON; Inbox still shares Roster ScriptLock; separate service writes are not one SQL transaction; accepted jobs are not delivered messages; live throughput requires an installation test.

## Architecture verification

The complete Archify `finalize` workflow passed validation, delivery, artifact checks and browser checks. All nine composition checks passed with zero errors and warnings. Its 23 source ranges resolve to committed bytes at `982e247d40418e9b60098056f7df0e766caac3c7`.

The source repository was restored from a local Git bundle. Archify does not accept a filesystem path as a repository URL. Verification therefore used a clean temporary checkout of the same commit with the explicit local-only fixture identity `https://local.invalid/gsis-release-preparation.git`. This is not a hosted repository or a browsable source link. The source repository's origin was not changed.

The separate `visual-check` passed containment, readability, viewer controls and light/dark themes at 1440×900 and 2048×1320. The 1440 px light and dark captures were visually inspected. Routes, labels and card headings are separated. The diagram offers zoom and focused views; the accompanying prose carries the detailed explanation. Source receipts and internal captures remain outside the deployment package.

A separate 390 px mobile check found no document overflow or runtime errors. Keyboard Tab reaches the theme control and reduced-motion mode pauses animation. The mobile capture was inspected: prose cards wrap and remain readable. The diagram itself uses an internal pan/zoom viewport on a narrow screen; it does not fit every node at readable size at once.

Receipts: `docs/GSiS-v0.8.9-Architecture.finalize.json`, `docs/GSiS-v0.8.9-Architecture.browser-check.json`, and `docs/reviews/v089/architecture-visual/`.

The exact `WEBHOOK_SCHEMA_SQL` string matches the guide, including the read-claim expiry index. The guide includes bounded read-claim cleanup and a 30-day object lifecycle for the dedicated `roster/timetables/v1/` cache prefix.

No live school setup, Google sync or message send was performed by this documentation work. Installation and production latency still need an operator check.
